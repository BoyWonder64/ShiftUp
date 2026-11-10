"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  type SlotInfo,
  type View,
} from "react-big-calendar";
import withDragAndDrop, { type EventInteractionArgs } from "react-big-calendar/lib/addons/dragAndDrop";
// Internal module, not part of react-big-calendar's public API - the exact
// component Week.js/Day.js both delegate to (see
// node_modules/react-big-calendar/lib/Week.js). Reused directly below
// (createFilteredDaysView) to render an arbitrary fixed set of days instead
// of always a full Sun-Sat week. No published types for this subpath (only
// react-big-calendar's top-level API is typed) - an ambient `declare
// module` doesn't take precedence over the real, resolvable .js file here,
// so this is suppressed at the import instead.
// @ts-expect-error -- see comment above; no .d.ts for this internal module
import TimeGrid from "react-big-calendar/lib/TimeGrid";
import { addDays, eachDayOfInterval, format, parse, startOfWeek, getDay, isSameDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import type { PermissionKey } from "@/lib/permissions/catalog";
import {
  DEFAULT_EVENT_COLORS,
  EVENT_COLOR_LABELS,
  buildColorTriples,
  isEventColorKey,
  resolveEventColor,
  resolveEventColors,
  type ColorTriple,
  type EventColorKey,
} from "@/lib/colors/eventColors";
import { getCustomHolidaysInRange, type ComputedHoliday } from "@/lib/holidays/federal";
import { getEnabledHolidaysInRange } from "@/lib/holidays/catalog";
import { CALENDAR_TEXT_SIZE_REM, type CalendarTextSize } from "@/lib/calendar/textSize";
import { formatClockRange, formatClockTime, type TimeFormat } from "@/lib/calendar/timeFormat";
import { condenseEvents, type CondensedKind } from "@/lib/calendar/condenseEvents";
import { CalendarToolbar } from "./CalendarToolbar";
import { CalendarLegend } from "./CalendarLegend";
import { MiniMonthCalendar } from "./MiniMonthCalendar";
import { StaffWeekRosterView } from "./StaffWeekRosterView";
import { columnDayLayout } from "./columnDayLayout";

// Pass date-fns's startOfWeek directly - dateFnsLocalizer only ever calls it
// as startOfWeek(new Date(), { locale }) internally (see
// node_modules/react-big-calendar/lib/localizers/date-fns.js), to derive a
// fixed "which weekday is first" constant for the locale. It is NOT used for
// navigation despite looking like it should be - don't waste time here if
// navigation ever breaks again; see the controlled date/view state below instead.
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { "en-US": enUS },
});

// TResource = StaffOption - lets the resource-view props below
// (resourceIdAccessor/resourceTitleAccessor/resourceAccessor) be typed
// against the real staff shape instead of a bare `object`.
const DnDCalendar = withDragAndDrop<CalendarEvent, StaffOption>(Calendar);

/**
 * Fills the Week/Day time-grid's otherwise-blank top-left corner cell
 * (react-big-calendar's `timeGutterHeader` slot, rendered inside its own
 * `.rbc-time-header-gutter` wrapper) with the viewer's local timezone
 * abbreviation - genuinely useful (every time on this calendar renders in
 * the browser's local timezone, nothing else on the page says so) rather
 * than leaving a plain white box there.
 *
 * Computed client-side only (via an effect, not at render time) because the
 * server's timezone almost never matches the viewer's browser - rendering it
 * directly would be a hydration mismatch.
 */
function TimeGutterHeader() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    // Deferred into a callback rather than calling setState directly in the
    // effect body, to satisfy react-hooks/set-state-in-effect - same pattern
    // as the panelVisible effect above.
    const timer = setTimeout(() => {
      try {
        const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date());
        setLabel(parts.find((p) => p.type === "timeZoneName")?.value ?? "");
      } catch {
        // Intl.DateTimeFormat with timeZoneName isn't universally supported -
        // leaving the corner blank is a harmless fallback, not worth surfacing an error.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="flex h-full items-center justify-center text-[10px] font-medium text-gray-400"
      title="Times on this calendar are shown in your local timezone"
    >
      {label}
    </div>
  );
}

const DayDragContext = createContext<{
  enabled: boolean;
  dragDays: Date[] | null;
  onStart: (date: Date) => void;
  onEnter: (date: Date) => void;
  consumeDragFlag: () => boolean;
} | null>(null);

/**
 * react-big-calendar's `components.header` slot for the Week/Day time-grid's
 * day column headers (TimeGridHeader.renderHeaderCells wraps whatever this
 * renders in its own "drill down to Day view" button whenever one applies -
 * see node_modules/react-big-calendar/lib/TimeGridHeader.js). Reused here so
 * dragging across Week's day headers can narrow the grid to just the
 * dragged range (`visibleDayFilter` below, set via `onStart`/`onEnter`'s
 * drag-tracking in the main component). A plain click (no drag) still
 * drills down exactly as before - `consumeDragFlag` only reports true, and
 * suppresses the click via stopPropagation/preventDefault, when the mouseup
 * that just fired actually spanned more than one day.
 */
function DayHeaderCell({ date, label }: { date: Date; label: string }) {
  const ctx = useContext(DayDragContext);
  if (!ctx?.enabled) return <span>{label}</span>;
  const highlighted = ctx.dragDays?.some((d) => isSameDay(d, date)) ?? false;
  return (
    <span
      onMouseDown={(e) => {
        e.preventDefault();
        ctx.onStart(date);
      }}
      onMouseEnter={() => ctx.onEnter(date)}
      onClick={(e) => {
        if (ctx.consumeDragFlag()) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      title="Drag across days to show only that range"
      className={`block cursor-pointer select-none rounded px-1 transition-colors ${
        highlighted ? "bg-primary-100 text-primary-700" : ""
      }`}
    >
      {label}
    </span>
  );
}

/**
 * A thin wrapper around react-big-calendar's own internal TimeGrid - the
 * exact component Week.js delegates to - that renders a *fixed* set of days
 * instead of the full Sun-Sat week TimeGrid.range would otherwise compute.
 * Backs both the "Show days" toolbar input and drag-selecting the Week
 * view's day headers (DayHeaderCell above) - both just produce a `days`
 * array through the same `setVisibleDayFilter` setter in the main
 * component.
 *
 * react-big-calendar's View.range/.navigate/.title statics only ever
 * receive `{localizer}` (range/navigate) or `{localizer, length}` (title) -
 * no custom app state - so `days` has to be baked into a *fresh* component
 * (new statics closing over this call's `days`) rather than read from props
 * at call time. The `views` useMemo below recreates this view whenever
 * `visibleDayFilter` changes - the same reactivity pattern already used
 * there for StaffWeekRosterView/groupByStaff. Back/Next re-derive a shifted
 * `days` array and push it back through `setVisibleDayFilter` themselves
 * (closed over here) rather than just returning a new focal date, since
 * nothing else would otherwise tell the *next* instance of this view what
 * the shifted window should be.
 */
function createFilteredDaysView(days: Date[], setVisibleDayFilter: (days: Date[] | null) => void) {
  function FilteredDaysView(props: Record<string, unknown>) {
    const { localizer, min, max, scrollToTime, ...rest } = props as {
      localizer: { startOf: (d: Date, unit: string) => Date; endOf: (d: Date, unit: string) => Date };
      min?: Date;
      max?: Date;
      scrollToTime?: Date;
    };
    return (
      <TimeGrid
        {...rest}
        range={days}
        eventOffset={15}
        localizer={localizer}
        min={min ?? localizer.startOf(new Date(), "day")}
        max={max ?? localizer.endOf(new Date(), "day")}
        scrollToTime={scrollToTime ?? localizer.startOf(new Date(), "day")}
      />
    );
  }

  FilteredDaysView.range = () => days;

  FilteredDaysView.navigate = (date: Date, action: string) => {
    if (action === "TODAY") {
      setVisibleDayFilter(null);
      return new Date();
    }
    if (action === "PREV" || action === "NEXT") {
      const delta = action === "PREV" ? -days.length : days.length;
      const shifted = days.map((d) => addDays(d, delta));
      setVisibleDayFilter(shifted);
      return shifted[0];
    }
    return date;
  };

  FilteredDaysView.title = () => {
    const start = days[0];
    const end = days[days.length - 1];
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${format(start, "MMMM d")} – ${format(end, "d")}`;
    }
    if (start.getFullYear() === end.getFullYear()) {
      return `${format(start, "MMMM d")} – ${format(end, "MMMM d")}`;
    }
    return `${format(start, "MMMM d, yyyy")} – ${format(end, "MMMM d, yyyy")}`;
  };

  return FilteredDaysView;
}

type EntryMode = "appointment" | "shift" | "custom";

/** Thin `ApiAppointment`-shaped wrapper around the shared `resolveEventColor` helper. */
export function resolveAppointmentColor(
  appt: ApiAppointment,
  colors: Record<EventColorKey, ColorTriple>
): ColorTriple {
  return resolveEventColor(
    { status: appt.status, isShift: isShift(appt), tagColor: appt.tag?.color, colorKey: appt.colorKey },
    colors
  );
}

const BASE_LEGEND_KEYS: EventColorKey[] = ["appointment", "shift", "completed", "noShow", "cancelled"];

export interface StaffOption {
  id: string;
  displayName: string;
}
/** A tenant-defined team (Settings > Teams) and the staff profile ids on it - used to narrow the calendar/roster staff filter by team. */
export interface TeamOption {
  id: string;
  name: string;
  description: string | null;
  members: { staffProfileId: string; displayName: string }[];
}
export interface TenantRoleOption {
  id: string;
  name: string;
}
export interface ServiceTypeOption {
  id: string;
  name: string;
  durationMinutes: number;
  // Appointment-only (AppointmentServiceType) - absent on a ShiftServiceType
  // option, since a shift has no price concept (ISSUES.md #1).
  price?: string | null;
}
export interface ClientOption {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}
/** One of the tenant's named custom calendars (Settings > Calendars > "Custom calendars") and its own independent form field-visibility settings. */
export interface CustomCalendarOption {
  id: string;
  name: string;
  showClient: boolean;
  requireClient: boolean;
  showJobType: boolean;
  showJobEstimate: boolean;
  showColorKey: boolean;
  showPaymentStatus: boolean;
}
/** An admin-defined quick-fill template (Settings > Calendars > "Preset events"). */
export interface EventPresetOption {
  id: string;
  label: string;
  entryKind: "SHIFT" | "APPOINTMENT" | "CUSTOM";
  customCalendarId: string | null;
  durationMinutes: number;
}
export interface TagOption {
  id: string;
  name: string;
  color: string;
  appliesTo: "SHIFT" | "APPOINTMENT" | "BOTH";
}
export interface HolidayOption {
  id: string;
  name: string;
  date: string;
  recurring: boolean;
  blocked: boolean;
}
export interface BlockedTimeOption {
  id: string;
  label: string | null;
  startTime: string;
  endTime: string;
}
export interface ApiAppointment {
  id: string;
  staffId: string;
  entryKind: "SHIFT" | "APPOINTMENT" | "CUSTOM";
  // Only set when entryKind is CUSTOM - which named CustomCalendar this
  // entry belongs to (a tenant can have several).
  customCalendarId: string | null;
  customCalendar: { id: string; name: string } | null;
  // Only ever set for a "Custom event" quick-create (entryKind SHIFT or
  // APPOINTMENT) - see Appointment.customTitle's schema doc comment.
  customTitle: string | null;
  clientId: string | null;
  serviceTypeId: string | null;
  startTime: string;
  endTime: string;
  status: string;
  priceCharged: string | null;
  paymentStatus: string;
  estimatedDurationMinutes: number | null;
  estimatedValue: string | null;
  locationType: "IN_PERSON" | "ONLINE";
  location: string | null;
  tagId: string | null;
  tag: TagOption | null;
  colorKey: string | null;
  client: ClientOption | null;
  serviceType: ServiceTypeOption | null;
  staff: StaffOption;
}
export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: ApiAppointment;
  // Only set on a summary block standing in for several real entries on a
  // crowded grid (see condenseEvents.ts) - "same" is everyone on one shift,
  // "overflow" is a "+N more" block. `resource` is then just the first
  // member's, so color/kind lookups keep working unchanged.
  group?: { kind: CondensedKind; members: CalendarEvent[] };
}

/**
 * The in-progress "new appointment/shift" slot is rendered as a real,
 * draggable/resizable event on the grid (rather than just a pair of
 * datetime inputs in the side panel) so the selection stays visible and can
 * be adjusted by dragging it around, the same way an existing event would
 * be. `resource` is never read for this id - eventPropGetter/onSelectEvent
 * special-case it before touching `.resource` - it only exists to satisfy
 * CalendarEvent's shape.
 */
export const DRAFT_EVENT_ID = "__draft__";
const DRAFT_RESOURCE: ApiAppointment = {
  id: DRAFT_EVENT_ID,
  staffId: "",
  entryKind: "SHIFT",
  customCalendarId: null,
  customCalendar: null,
  customTitle: null,
  clientId: null,
  serviceTypeId: null,
  startTime: "",
  endTime: "",
  status: "DRAFT",
  priceCharged: null,
  paymentStatus: "UNPAID",
  estimatedDurationMinutes: null,
  estimatedValue: null,
  locationType: "IN_PERSON",
  location: null,
  tagId: null,
  tag: null,
  colorKey: null,
  client: null,
  serviceType: null,
  staff: { id: "", displayName: "" },
};

/**
 * Blocked-time spans (both the holiday "Block" checkbox and the Settings >
 * Calendar > "Blocked time" entries) render as react-big-calendar
 * `backgroundEvents` - visually distinct from a real appointment/shift and,
 * via `pointerEvents: "none"` in eventPropGetter below, non-interactive, so
 * they never intercept a click meant for the slot/grid underneath (this
 * feature is a visual cue only, never a hard scheduling constraint - see
 * BlockedTime's schema doc comment). `resource` is never read for these
 * ids, same as DRAFT_RESOURCE above - it only exists to satisfy
 * CalendarEvent's shape.
 */
const BLOCKED_EVENT_ID_PREFIX = "__blocked__";
const BLOCKED_RESOURCE: ApiAppointment = { ...DRAFT_RESOURCE, id: BLOCKED_EVENT_ID_PREFIX, status: "BLOCKED" };

// The draft event's "(drag to adjust)" hint is for people who haven't
// figured out the draft block is draggable yet - once someone's created 10
// entries in this browser, they clearly already know, so it stops showing.
// Tracked in localStorage (per-browser, not per-tenant) since this is a
// one-time onboarding nicety, not data worth a round trip to the server for.
const CREATION_COUNT_STORAGE_KEY = "shiftup:creation-count";

function readCreationCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.localStorage.getItem(CREATION_COUNT_STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function bumpCreationCount(): number {
  const next = readCreationCount() + 1;
  try {
    window.localStorage.setItem(CREATION_COUNT_STORAGE_KEY, String(next));
  } catch {
    // Private browsing / storage disabled - the hint just won't learn to
    // hide itself for this viewer, not worth surfacing an error over.
  }
  return next;
}

/** Carries the HTTP status alongside the message so callers can tell a real scheduling conflict (409, from the DB's EXCLUDE constraint) apart from any other failure, without parsing message text. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new ApiError(data.error ?? "Request failed", res.status);
  return data;
}

// Replaces the old clientId-presence inference (null = shift, set =
// appointment) now that entryKind is the real source of truth - a CUSTOM
// entry can have a client or not depending on the tenant's Custom-form
// settings, so clientId alone can no longer tell SHIFT apart from CUSTOM.
export function isShift(appt: ApiAppointment): boolean {
  return appt.entryKind === "SHIFT";
}

export function isCustomEntry(appt: ApiAppointment): boolean {
  return appt.entryKind === "CUSTOM";
}

function entryModeOf(appt: ApiAppointment): EntryMode {
  return appt.entryKind === "SHIFT" ? "shift" : appt.entryKind === "CUSTOM" ? "custom" : "appointment";
}

/** A tag tagged BOTH shows on every picker; SHIFT/APPOINTMENT only shows on its own. Custom entries only ever offer BOTH-scoped tags (no separate CUSTOM tag scope exists). */
function tagsForMode(tags: TagOption[], mode: EntryMode): TagOption[] {
  if (mode === "custom") return tags.filter((t) => t.appliesTo === "BOTH");
  const scope = mode === "shift" ? "SHIFT" : "APPOINTMENT";
  return tags.filter((t) => t.appliesTo === "BOTH" || t.appliesTo === scope);
}

/**
 * The "Color key" picker combines two different kinds of option in one
 * `<select>`: a custom `EventTag` (value = its id, unchanged) and one of the
 * 5 built-in keys from Settings > Event colors (value = this prefix + the
 * key, since a bare key could collide with a real tag id). `colorValueFor`/
 * `parseColorValue` convert between that single combined value and the two
 * underlying nullable fields (`tagId`/`colorKey`) the API actually stores -
 * exactly one of which is ever non-null at a time.
 */
const BASE_COLOR_VALUE_PREFIX = "base:";

/** "completed"/"noShow"/"cancelled" apply to either kind of entry; "appointment"/"shift" only make sense for their own kind. A custom entry isn't inherently either, so both stay offered. */
function baseColorOptionsFor(mode: EntryMode): EventColorKey[] {
  if (mode === "custom") return BASE_LEGEND_KEYS;
  return BASE_LEGEND_KEYS.filter((key) => key !== (mode === "shift" ? "appointment" : "shift"));
}

function colorValueFor(entry: { tagId: string | null; colorKey: string | null }): string {
  if (entry.colorKey) return `${BASE_COLOR_VALUE_PREFIX}${entry.colorKey}`;
  return entry.tagId ?? "";
}

function parseColorValue(value: string): { tagId: string | null; colorKey: string | null } {
  if (value.startsWith(BASE_COLOR_VALUE_PREFIX)) {
    return { tagId: null, colorKey: value.slice(BASE_COLOR_VALUE_PREFIX.length) };
  }
  return { tagId: value || null, colorKey: null };
}

/** Shared with RosterView.tsx, which renders the same chip label without the "(staff name)" suffix - each chip already sits under that staff member's row. */
export function appointmentTitle(appt: ApiAppointment): string {
  // A "Custom event" quick-create (see Appointment.customTitle) always wins -
  // it's a free-text title chosen specifically to replace this composition,
  // regardless of which calendar (entryKind SHIFT/APPOINTMENT) it's filed under.
  if (appt.customTitle) return appt.customTitle;
  if (isShift(appt)) return `Shift${appt.serviceType ? ` – ${appt.serviceType.name}` : ""}`;
  if (isCustomEntry(appt)) {
    const base = appt.client?.name ?? appt.customCalendar?.name ?? "Custom entry";
    return `${base}${appt.serviceType ? ` – ${appt.serviceType.name}` : ""}`;
  }
  return `${appt.client?.name ?? "Client"}${appt.serviceType ? ` – ${appt.serviceType.name}` : ""}`;
}

/**
 * Job-estimate duration is stored as a single `estimatedDurationMinutes`
 * int, but the create/edit forms let the user enter and view it in whichever
 * unit makes sense for the job (a quick fix in minutes vs. a multi-day job) -
 * these convert between the two without touching the schema.
 */
type DurationUnit = "minutes" | "hours" | "days";
const MINUTES_PER_UNIT: Record<DurationUnit, number> = { minutes: 1, hours: 60, days: 1440 };

/** Picks the "nicest" unit that round-trips the stored minutes exactly (days > hours > minutes), so e.g. 120 shows as "2 hours" rather than "120 minutes". */
function minutesToDuration(totalMinutes: number | null | undefined): { value: string; unit: DurationUnit } {
  if (totalMinutes === null || totalMinutes === undefined) return { value: "", unit: "hours" };
  if (totalMinutes !== 0 && totalMinutes % MINUTES_PER_UNIT.days === 0) {
    return { value: String(totalMinutes / MINUTES_PER_UNIT.days), unit: "days" };
  }
  if (totalMinutes !== 0 && totalMinutes % MINUTES_PER_UNIT.hours === 0) {
    return { value: String(totalMinutes / MINUTES_PER_UNIT.hours), unit: "hours" };
  }
  return { value: String(totalMinutes), unit: "minutes" };
}

function durationToMinutes(value: string, unit: DurationUnit): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Math.round(n * MINUTES_PER_UNIT[unit]);
}

/** Read-only display, e.g. "2 hours" instead of the raw "120 min". */
function formatDuration(totalMinutes: number | null | undefined): string {
  if (totalMinutes === null || totalMinutes === undefined) return "—";
  const { value, unit } = minutesToDuration(totalMinutes);
  if (unit === "minutes") return `${totalMinutes} min`;
  const n = Number(value);
  return `${value} ${unit === "hours" ? (n === 1 ? "hour" : "hours") : n === 1 ? "day" : "days"}`;
}

/**
 * Centered overlay for the create/edit and details panels - replaces the old
 * in-flow placement below the calendar grid so the calendar stays put and
 * the form/panel floats in front of it instead of pushing the page layout
 * around. Closes on Escape or a click on the dimmed backdrop.
 */
export function Modal({
  onClose,
  visible = true,
  panelRef,
  children,
}: {
  onClose: () => void;
  visible?: boolean;
  panelRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 pt-[8vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`w-full max-w-xl transition-all duration-300 ease-out ${
          visible ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-2 scale-95 opacity-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** "Jane Smith" -> "JS"; single-word names fall back to its first two letters. Used by the event's staff avatar badge. */
export function staffInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Fixed palette, cycled by a hash of staffId - gives each staff member a
// consistent color for their avatar badge across the whole calendar, without
// touching eventPropGetter's status/tag-based background color.
const STAFF_AVATAR_COLORS = ["#6366f1", "#059669", "#d97706", "#db2777", "#0891b2", "#7c3aed", "#dc2626", "#4b5563"];

export function staffAvatarColor(staffId: string): string {
  let hash = 0;
  for (let i = 0; i < staffId.length; i++) hash = (hash * 31 + staffId.charCodeAt(i)) >>> 0;
  return STAFF_AVATAR_COLORS[hash % STAFF_AVATAR_COLORS.length];
}

function toEvent(appt: ApiAppointment): CalendarEvent {
  // Staff name leads (used by Agenda view and screen readers, which render
  // this plain string rather than EventContent's richer markup below) so
  // it's the part that survives truncation, not the part ellipsis eats first.
  const title = `${appt.staff.displayName}: ${appointmentTitle(appt)}`;
  const start = new Date(appt.startTime);
  const end = new Date(appt.endTime);
  // react-big-calendar moves anything that starts and ends exactly at
  // midnight into the all-day strip above the Week/Day grid, where every
  // such entry stacks and pushes the real grid out of view. Ending it 1ms
  // before midnight keeps it in the grid as a full-height block.
  if (isMidnight(start) && isMidnight(end) && end > start) end.setTime(end.getTime() - 1);
  return { id: appt.id, title, start, end, resource: appt };
}

const GROUP_EVENT_ID_PREFIX = "__group__";

/** Entries only share a "same" block when they'd look identical on the grid apart from who's working: same kind, title, status and color. */
function groupKeyOf(event: CalendarEvent): string {
  const a = event.resource;
  return [a.entryKind, a.customCalendarId ?? "", a.status, a.tagId ?? "", a.colorKey ?? "", appointmentTitle(a)].join("|");
}

function makeGroupEvent(members: CalendarEvent[], kind: CondensedKind): CalendarEvent {
  const sorted = [...members].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.resource.staff.displayName.localeCompare(b.resource.staff.displayName)
  );
  const start = new Date(Math.min(...sorted.map((m) => m.start.getTime())));
  const end = new Date(Math.max(...sorted.map((m) => m.end.getTime())));
  const label = groupLabel(sorted, kind);
  const names = sorted.map((m) => m.resource.staff.displayName).join(", ");
  return {
    id: `${GROUP_EVENT_ID_PREFIX}${kind}:${start.getTime()}:${end.getTime()}:${sorted[0].id}`,
    // Plain-text version for the hover tooltip and screen readers.
    title: kind === "same" ? `${label} · ${sorted.length} staff: ${names}` : `${label}: ${names}`,
    start,
    end,
    resource: sorted[0].resource,
    group: { kind, members: sorted },
  };
}

function groupLabel(members: CalendarEvent[], kind: CondensedKind): string {
  return kind === "same" ? appointmentTitle(members[0].resource) : `+${members.length} more`;
}

function isMidnight(d: Date): boolean {
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
}

/** One minute shorter is always one z-index step further forward; stays below the draft event's 10081. */
function stackingZIndex(start: Date, end: Date): number {
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return Math.max(1, 10080 - minutes);
}

/** Snaps to the nearest whole minute - undoes toEvent's 1ms midnight nudge when an event is dragged or resized. */
function toNearestMinute(d: Date): Date {
  return new Date(Math.round(d.getTime() / 60_000) * 60_000);
}

/** "2024-01-01T09:00" - the format `<input type="datetime-local">` needs, in the browser's local time (not UTC). */
function toInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Default time range when opening the create panel from a button rather than clicking a calendar slot - the next full hour, one hour long. */
function nextHourSlot(): { start: Date; end: Date } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return { start, end };
}

/** Same "next full hour" default as nextHourSlot, but pinned to an arbitrary date (StaffWeekRosterView's click-to-create) - today still gets the next real hour, any other day defaults to a plain 9-10am slot. */
export function hourSlotOn(date: Date): { start: Date; end: Date } {
  if (isSameDay(date, new Date())) return nextHourSlot();
  const start = new Date(date);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return { start, end };
}

export function SchedulingCalendar({
  readOnly = false,
  calendarKind,
  initialStaffId,
  customCalendarId,
  allKinds,
}: {
  readOnly?: boolean;
  // Which fixed calendar page this is - each of the split pages mounts this
  // component with its own fixed kind (no more in-toolbar switcher); "all"
  // is the one page that still shows every kind together and still needs
  // the Appointment/Shift/pick-a-custom-calendar chooser popup for an
  // ambiguous slot-drag creation, same as the old "both" calendarType used
  // to.
  calendarKind: "appointment" | "shift" | "custom" | "all";
  // Preselects the staff filter - used by the roster drill-down view's
  // "View full calendar" link (?staff=<id>) so landing here already shows
  // just that one employee instead of "All staff".
  initialStaffId?: string;
  // Required when calendarKind === "custom" - which of the tenant's named
  // CustomCalendar rows this page shows (a tenant can have several). Ignored
  // for every other calendarKind.
  customCalendarId?: string;
  // Only consulted when calendarKind === "all" - which of the three kinds
  // are actually enabled for this tenant/role (license tier + the Settings >
  // Calendars on/off toggle + the relevant VIEW_* permission, all already
  // resolved by the page before mounting this component), so "All" only
  // shows/creates what's really available instead of everything the license
  // tier alone would allow. `custom` here just means "at least one custom
  // calendar is reachable" - which ones is read separately below, from this
  // component's own self-fetched `/api/custom-calendars` list. Defaults to
  // allowing all three for callers (like /calendar/view) that don't need
  // per-kind narrowing.
  allKinds?: { appointment: boolean; shift: boolean; custom: boolean };
}) {
  const kindsOnAllPage = allKinds ?? { appointment: true, shift: true, custom: true };
  // Whether each kind's UI (create button, filtering, legend entry) should
  // show on *this* mount - true for the one kind a fixed-kind page renders,
  // or per-kindsOnAllPage on the combined "All" page.
  const showAppointmentUI = calendarKind === "appointment" || (calendarKind === "all" && kindsOnAllPage.appointment);
  const showShiftUI = calendarKind === "shift" || (calendarKind === "all" && kindsOnAllPage.shift);
  const showCustomUI = calendarKind === "custom" || (calendarKind === "all" && kindsOnAllPage.custom);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  // Settings > Account > "Calendar text size" - per-user, fetched independently of the
  // tenant-wide settings below since it's the viewer's own preference, not shared config.
  // Defaults to the calendar's own (smaller-than-body) baseline until the real value loads.
  const [calendarTextSize, setCalendarTextSize] = useState<CalendarTextSize>("MEDIUM");
  const [timeFormat, setTimeFormat] = useState<TimeFormat>("TWELVE_HOUR");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  // Split per ISSUES.md #1 - an appointment's job type and a shift's job type
  // now come from two independent tables/endpoints, never the same pool.
  const [appointmentServiceTypes, setAppointmentServiceTypes] = useState<ServiceTypeOption[]>([]);
  const [shiftServiceTypes, setShiftServiceTypes] = useState<ServiceTypeOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean> | null>(null);
  // Admin-configurable (Settings > "Appointment & shift form") - whether
  // the create-appointment form must have a client attached. Defaults to
  // true (the previous, implicit behavior) until the real value loads.
  const [requireClientForAppointments, setRequireClientForAppointments] = useState(true);
  // Same settings section - whether the detail panel shows an "Open in
  // Google Maps" button next to an in-person appointment's address.
  const [enableMapsNavigation, setEnableMapsNavigation] = useState(true);
  // Same settings section - whether the detail panel shows/lets staff edit
  // Appointment.paymentStatus at all (ISSUES.md #5). Never applies to
  // shifts (no client, no price) regardless of this setting.
  const [showPaymentStatus, setShowPaymentStatus] = useState(true);
  // Tenant-personalized event colors (Settings > "Event colors") -
  // defaults to the original hardcoded palette until the real value loads.
  const [colorTriples, setColorTriples] = useState<Record<EventColorKey, ColorTriple>>(() =>
    buildColorTriples(DEFAULT_EVENT_COLORS)
  );
  const [enabledHolidayNames, setEnabledHolidayNames] = useState<string[]>([]);
  const [blockedHolidayNames, setBlockedHolidayNames] = useState<string[]>([]);
  // Admin-configurable (Settings > "Shift form") - whether the shift
  // create/detail forms show these fields at all. Never applies to
  // mode === "appointment", which has its own always-shown equivalents.
  const [showJobTypeOnShiftForm, setShowJobTypeOnShiftForm] = useState(true);
  const [showJobEstimateOnShiftForm, setShowJobEstimateOnShiftForm] = useState(true);
  const [showColorKeyOnShiftForm, setShowColorKeyOnShiftForm] = useState(true);
  // The tenant's named custom calendars (Settings > Calendars > "Custom
  // calendars") - a paid tenant can have several, each with its own
  // independent field-visibility settings, unlike the single flat set of
  // toggles Shift/Appointment have. Self-fetched here (not passed as a
  // prop) since every calendarKind needs it: "custom" pages resolve their
  // one active calendar's settings from this list by id, and "all" uses it
  // for the create-mode chooser's per-calendar options.
  const [customCalendars, setCustomCalendars] = useState<CustomCalendarOption[]>([]);
  // Settings > Calendars > "Preset events" - quick-fill templates for the
  // create form's presets row (see CreateEntryPanel below).
  const [eventPresets, setEventPresets] = useState<EventPresetOption[]>([]);
  // Settings > "Calendar" > "Calendar hours" - minutes-from-midnight bounds
  // on the Week/Day grid's displayed range. Defaults to the full day until
  // the real value loads, same as every other tenant setting here.
  const [calendarStartMinute, setCalendarStartMinute] = useState(0);
  const [calendarEndMinute, setCalendarEndMinute] = useState(1440);
  // Settings > Calendar > "Allow editing booked events" - tenant-wide master
  // switch, ANDed with the per-role EDIT_SHIFTS/EDIT_APPOINTMENTS/
  // EDIT_JOB_ESTIMATES permissions below rather than replacing them. Defaults
  // to true (today's existing behavior) until the real value loads.
  const [allowEditingBookedEvents, setAllowEditingBookedEvents] = useState(true);
  // The tenant's real roles (Settings > "Roles") - used by the inline
  // "+ Add new staff member" role dropdown.
  const [roles, setRoles] = useState<TenantRoleOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [holidays, setHolidays] = useState<HolidayOption[]>([]);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTimeOption[]>([]);
  const [staffFilter, setStaffFilter] = useState<string>(initialStaffId ?? "all");
  // Settings > Teams - narrows staffFilter's "all"/one-staff-member choice
  // down to one team's members, ANDed with it rather than replacing it.
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  // Settings > Permissions > VIEW_ALL_SHIFTS/VIEW_ALL_APPOINTMENTS - "all" is
  // only ever an option when the viewer actually holds the relevant
  // permission; without it the server always scopes the response to the
  // viewer's own shifts/appointments regardless of this state (see
  // loadAppointments below), so there's nothing insecure about defaulting to
  // "all" here - a viewer who lacks both permissions just gets their own data
  // back either way.
  const [viewScope, setViewScope] = useState<"all" | "mine">("all");
  // Explicitly controlled, rather than relying on react-big-calendar's own
  // internal (uncontrolled) date/view state via its `uncontrollable` wrapper -
  // owning this ourselves means Today/Back/Next and Month/Week/Day switching
  // go through code we can see and debug directly, with no ambiguity about
  // what the library does internally when no `date`/`view`/`onNavigate`/
  // `onView` props are passed.
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [currentView, setCurrentView] = useState<View>("week");
  // Measured (rather than hardcoded) because the toolbar's own height varies
  // with how many of its controls are rendered and whether they wrap onto a
  // second line at narrower widths - the mini calendar/legend column below
  // uses this to pin itself directly under the toolbar instead of either
  // overlapping it or guessing a fixed offset that's wrong at some width.
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setToolbarHeight(entries[0].contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [range, setRange] = useState<{ start: Date; end: Date }>(() => {
    const now = new Date();
    const start = startOfWeek(now, { locale: enUS });
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  });
  const [selected, setSelected] = useState<ApiAppointment | null>(null);
  // The summary block ("Shift · 15 staff" / "+N more") whose member list is open.
  const [openGroup, setOpenGroup] = useState<CalendarEvent | null>(null);
  // Width of the calendar card, measured so the crowding limit (maxLanes
  // below) follows the real day-column width instead of assuming a desktop.
  const calendarWrapperRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(900);
  useEffect(() => {
    const el = calendarWrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setGridWidth(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [creating, setCreating] = useState<
    | {
        start: Date;
        end: Date;
        mode: EntryMode;
        defaultStaffId?: string;
        // Only meaningful when mode === "custom" - which of the tenant's
        // named custom calendars this draft belongs to.
        customCalendarId?: string;
        // True while the generic "Custom event" quick-create is open
        // (CustomEventPanel, not CreateEntryPanel) - mode is still
        // "appointment" or "shift" here (which calendar it files under),
        // never "custom"/CustomCalendar-backed. See Appointment.customTitle.
        quickCustom?: boolean;
      }
    | null
  >(null);
  // "Group by staff" - splits a single combined column/day into one lane per
  // staff member instead of cramming every shift together as narrow slivers
  // once there are more than a handful at once. Meaningful for Day (one
  // column per staff, react-big-calendar's native resource view) and Week
  // (StaffWeekRosterView below - a roster grid, staff as rows x the 7 days
  // as columns, NOT react-big-calendar's resource view: a resourced Week
  // would render staff x 7 columns, e.g. 80 staff x 7 = 560, unusable even
  // scrolling - see TimeGrid's renderResourcesFirst). Not meaningful for
  // Month (no sensible per-staff shape for a month grid) or Agenda (already
  // a flat list), so switching to either of those turns it back off - see
  // handleViewChange below.
  const [groupByStaff, setGroupByStaff] = useState(false);
  // Narrows the Week view to show only a specific set of days - either
  // picked by dragging across the Week view's day headers (DayHeaderCell,
  // startDayDrag/enterDayDrag below) or by the "Show days" toolbar input
  // (handleDayCountChange below). Null means no filter - react-big-
  // calendar's own full-week default. Drives a real custom view
  // (createFilteredDaysView) rather than hiding columns with CSS, so
  // data-fetching (onRangeChange) and Back/Next/Today navigation all stay
  // correct for whatever's actually shown - see that function's doc comment.
  const [visibleDayFilter, setVisibleDayFilter] = useState<Date[] | null>(null);
  // In-progress drag state for DayHeaderCell - `dragDays` is reactive
  // (drives the highlight while dragging); the refs track the gesture
  // itself without forcing a render on every mouseenter, and survive past
  // the mouseup that clears `dragDays` so the "click" event that always
  // fires right after mouseup can still tell a real drag apart from a
  // plain click (see consumeDragFlag).
  const [dragDays, setDragDays] = useState<Date[] | null>(null);
  const dragAnchorRef = useRef<Date | null>(null);
  const dragActiveRef = useRef(false);
  const dragCommittedRef = useRef(false);

  const startDayDrag = useCallback((date: Date) => {
    dragAnchorRef.current = date;
    dragActiveRef.current = true;
    setDragDays([date]);
  }, []);

  const enterDayDrag = useCallback((date: Date) => {
    const anchor = dragAnchorRef.current;
    if (!dragActiveRef.current || !anchor) return;
    const [from, to] = anchor <= date ? [anchor, date] : [date, anchor];
    setDragDays(eachDayOfInterval({ start: from, end: to }));
  }, []);

  const consumeDragFlag = useCallback(() => {
    const was = dragCommittedRef.current;
    dragCommittedRef.current = false;
    return was;
  }, []);

  // Commits the drag on mouseup wherever it happens to end (not just over a
  // header cell) - document-level so releasing the mouse off the grid
  // entirely still ends the gesture instead of leaving it stuck active.
  useEffect(() => {
    function handleMouseUp() {
      if (!dragActiveRef.current) return;
      dragActiveRef.current = false;
      setDragDays((days) => {
        if (days && days.length > 1) {
          setVisibleDayFilter(days);
          dragCommittedRef.current = true;
        } else {
          dragCommittedRef.current = false;
        }
        return null;
      });
    }
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const dayDragContextValue = useMemo(
    () => ({
      enabled: currentView === "week",
      dragDays,
      onStart: startDayDrag,
      onEnter: enterDayDrag,
      consumeDragFlag,
    }),
    [currentView, dragDays, startDayDrag, enterDayDrag, consumeDragFlag]
  );

  // "Show days" toolbar input - an empty/invalid value clears the filter
  // back to the normal full week; any other value becomes "the next N days
  // starting today" and switches into Week view to actually show it (same
  // as applying a drag selection does via the mouseup handler above).
  const handleDayCountChange = useCallback(
    (raw: string) => {
      const n = Number(raw);
      if (!raw || !Number.isFinite(n) || n < 1) {
        setVisibleDayFilter(null);
        return;
      }
      const clamped = Math.min(60, Math.max(1, Math.round(n)));
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      setVisibleDayFilter(Array.from({ length: clamped }, (_, i) => addDays(start, i)));
      if (currentView !== "week") setCurrentView("week");
    },
    [currentView]
  );
  // Whether the create modal has finished its entrance transition - kept
  // separate from `creating` itself so the modal doesn't just snap into
  // view the instant a slot is selected. The draft "ghost" event on the
  // calendar (driven by `creating` directly) shows the selection
  // immediately; this flips to true after a short hold so the modal fades/
  // scales in over the calendar afterward instead of popping in in front of
  // it right away.
  const [panelVisible, setPanelVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Minutes per row in the Week/Day time gutter. react-big-calendar renders
  // `timeslots` subdivisions per `step`-minute row, so an hour-tall row with
  // 1 timeslot is "60 minute blocks", a 30-minute row is "30 minute blocks",
  // and a 15-minute row is "15 minute blocks" - one slot each, just a
  // smaller step, so the gutter labels stay one-per-row either way.
  const [timeStep, setTimeStep] = useState<15 | 30 | 60>(60);
  // Which half of the day the Week/Day time gutter shows - react-big-calendar's
  // `min`/`max` props take Date objects where only the time-of-day portion is
  // read (the date part is ignored and merged onto whichever day is actually
  // rendered), so any reference date works here. No effect in Month view,
  // same as the time-grid granularity switcher above.
  const [amPmHalf, setAmPmHalf] = useState<"AM" | "PM">("AM");
  const [creationCount, setCreationCount] = useState(() => readCreationCount());
  // Separate from the generic `error` state above (used by the unrelated
  // staff/settings/reschedule loaders) so a retry button here can target
  // just this one fetch without ambiguity over which failure it's retrying.
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);

  const loadAppointments = useCallback(async (r: { start: Date; end: Date }) => {
    setAppointmentsLoading(true);
    setAppointmentsError(null);
    try {
      const params = new URLSearchParams({ start: r.start.toISOString(), end: r.end.toISOString() });
      if (viewScope === "mine") params.set("view", "mine");
      const data = await fetchJson<{ appointments: ApiAppointment[] }>(`/api/appointments?${params.toString()}`);
      setEvents(data.appointments.map(toEvent));
    } catch {
      setAppointmentsError("Couldn't load appointments.");
    } finally {
      setAppointmentsLoading(false);
    }
  }, [viewScope]);

  const loadStaff = useCallback(async () => {
    try {
      const data = await fetchJson<{ staff: StaffOption[] }>("/api/staff");
      setStaff(data.staff);
    } catch {
      setError("Couldn't load staff.");
    }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const data = await fetchJson<{ clients: ClientOption[] }>("/api/clients");
      setClients(data.clients);
    } catch {
      // Not fatal - VIEW_CLIENTS may legitimately be denied for this role,
      // in which case the create panel just won't offer existing clients.
    }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const data = await fetchJson<{ tags: TagOption[] }>("/api/event-tags");
      setTags(data.tags);
    } catch {
      // Not fatal - tags are a nice-to-have coloring layer, missing them
      // shouldn't block the rest of the calendar from loading.
    }
  }, []);

  const loadHolidays = useCallback(async () => {
    try {
      const data = await fetchJson<{ holidays: HolidayOption[] }>("/api/holidays");
      setHolidays(data.holidays);
    } catch {
      // Not fatal - same reasoning as loadTags.
    }
  }, []);

  const loadBlockedTimes = useCallback(async () => {
    try {
      const data = await fetchJson<{ blockedTimes: BlockedTimeOption[] }>("/api/blocked-time");
      setBlockedTimes(data.blockedTimes);
    } catch {
      // Not fatal - same reasoning as loadTags.
    }
  }, []);

  const loadCalendarTextSize = useCallback(async () => {
    try {
      const data = await fetchJson<{ calendarTextSize: CalendarTextSize }>("/api/me/calendar-text-size");
      setCalendarTextSize(data.calendarTextSize);
    } catch {
      // Not fatal - same reasoning as loadTags; just keeps the default size.
    }
  }, []);

  const loadTimeFormat = useCallback(async () => {
    try {
      const data = await fetchJson<{ timeFormat: TimeFormat }>("/api/me/time-format");
      setTimeFormat(data.timeFormat);
    } catch {
      // Not fatal - same reasoning as loadCalendarTextSize; just keeps the 12-hour default.
    }
  }, []);

  const loadRoles = useCallback(async () => {
    try {
      const data = await fetchJson<{ roles: TenantRoleOption[] }>("/api/roles");
      setRoles(data.roles);
    } catch {
      // Not fatal - the inline "+ Add new staff member" role dropdown just stays empty until retried.
    }
  }, []);

  const loadTeams = useCallback(async () => {
    try {
      const data = await fetchJson<{ teams: TeamOption[] }>("/api/teams");
      setTeams(data.teams);
    } catch {
      // Not fatal - the team filter just stays hidden/empty until retried.
    }
  }, []);

  const loadCustomCalendars = useCallback(async () => {
    try {
      const data = await fetchJson<{ customCalendars: CustomCalendarOption[] }>("/api/custom-calendars");
      setCustomCalendars(data.customCalendars);
    } catch {
      // Not fatal - same reasoning as loadTags; a "custom" page with no list
      // loaded yet just can't resolve its field settings until this retries.
    }
  }, []);

  const loadEventPresets = useCallback(async () => {
    try {
      const data = await fetchJson<{ eventPresets: EventPresetOption[] }>("/api/event-presets");
      setEventPresets(data.eventPresets);
    } catch {
      // Not fatal - same reasoning as loadTags; the create form's presets
      // row just stays empty until this retries.
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [appointmentServiceData, shiftServiceData, permData, settingsData] = await Promise.all([
          fetchJson<{ serviceTypes: ServiceTypeOption[] }>("/api/appointment-service-types?activeOnly=true"),
          fetchJson<{ serviceTypes: ServiceTypeOption[] }>("/api/shift-service-types?activeOnly=true"),
          fetchJson<{ permissions: Record<PermissionKey, boolean> }>("/api/me/permissions"),
          fetchJson<{
            settings: {
              requireClientForAppointments: boolean;
              enableMapsNavigation: boolean;
              showPaymentStatus: boolean;
              eventColors: Record<EventColorKey, string>;
              enabledHolidayNames: string[];
              blockedHolidayNames: string[];
              showJobTypeOnShiftForm: boolean;
              showJobEstimateOnShiftForm: boolean;
              showColorKeyOnShiftForm: boolean;
              calendarStartMinute: number;
              calendarEndMinute: number;
              allowEditingBookedEvents: boolean;
            };
          }>("/api/tenant-settings"),
        ]);
        setAppointmentServiceTypes(appointmentServiceData.serviceTypes);
        setShiftServiceTypes(shiftServiceData.serviceTypes);
        setPermissions(permData.permissions);
        setRequireClientForAppointments(settingsData.settings.requireClientForAppointments);
        setEnableMapsNavigation(settingsData.settings.enableMapsNavigation);
        setShowPaymentStatus(settingsData.settings.showPaymentStatus);
        setColorTriples(buildColorTriples(resolveEventColors(settingsData.settings.eventColors)));
        setEnabledHolidayNames(settingsData.settings.enabledHolidayNames);
        setBlockedHolidayNames(settingsData.settings.blockedHolidayNames);
        setShowJobTypeOnShiftForm(settingsData.settings.showJobTypeOnShiftForm);
        setShowJobEstimateOnShiftForm(settingsData.settings.showJobEstimateOnShiftForm);
        setShowColorKeyOnShiftForm(settingsData.settings.showColorKeyOnShiftForm);
        setCalendarStartMinute(settingsData.settings.calendarStartMinute);
        setCalendarEndMinute(settingsData.settings.calendarEndMinute);
        setAllowEditingBookedEvents(settingsData.settings.allowEditingBookedEvents);
      } catch {
        setError("Couldn't load service data.");
      }
      await Promise.all([
        loadStaff(),
        loadClients(),
        loadTags(),
        loadHolidays(),
        loadBlockedTimes(),
        loadRoles(),
        loadTeams(),
        loadCalendarTextSize(),
        loadTimeFormat(),
        loadCustomCalendars(),
        loadEventPresets(),
      ]);
    })();
  }, [
    loadStaff,
    loadClients,
    loadTags,
    loadHolidays,
    loadBlockedTimes,
    loadRoles,
    loadTeams,
    loadCalendarTextSize,
    loadTimeFormat,
    loadCustomCalendars,
    loadEventPresets,
  ]);

  useEffect(() => {
    (async () => {
      await loadAppointments(range);
    })();
  }, [range, loadAppointments]);

  // Depends on whether a creation is open at all, not on `creating` itself -
  // `creating` gets a new object identity on every drag/resize of the draft
  // event, and re-running this on each of those would hide/re-show the
  // panel mid-adjustment instead of holding it steady once it's visible.
  const creatingOpen = creating !== null;
  useEffect(() => {
    if (!creatingOpen) return;
    const timer = setTimeout(() => setPanelVisible(true), 800);
    // Cleanup (not the effect body) resets visibility once creatingOpen
    // flips back to false, or on unmount - keeps the only setState call on
    // this branch out of the synchronous effect body itself.
    return () => {
      clearTimeout(timer);
      setPanelVisible(false);
    };
  }, [creatingOpen]);

  // Switching to Month or Agenda (via the toolbar, or onView below) turns
  // "Group by staff" back off, since neither has a by-staff rendering (see
  // groupByStaff's declaration) - staying on or moving between Day/Week
  // keeps it on, since both do. Done in this handler rather than an effect
  // so it's a direct response to the nav click, not a synchronized
  // derived-state update.
  const handleViewChange = useCallback((view: View) => {
    setCurrentView(view);
    if (view !== "day" && view !== "week") setGroupByStaff(false);
  }, []);

  const handleRangeChange = useCallback((r: Date[] | { start: Date; end: Date }) => {
    if (Array.isArray(r)) {
      if (r.length === 0) return;
      // r's last element is the *start* of the last visible day (midnight),
      // not its end - using it directly as `end` made every fetch exclude
      // that whole last day, and collapsed to a zero-width (start === end)
      // range entirely for any single-day array (Day view, Agenda's default
      // length), which silently fetched no appointments at all every time
      // you switched to Day view via the toolbar. +1 day matches the
      // exclusive-end convention `range`'s own initial value already uses
      // (see its useState above: `end = start + 7 days` for a Sun-Sat week).
      setRange({ start: r[0], end: addDays(r[r.length - 1], 1) });
    } else {
      setRange(r);
    }
  }, []);

  // staffId is only passed in "Group by staff" Day view, when a drag lands
  // in a different person's column than the event started in - reassigns in
  // the same request as the reschedule, rather than two round trips.
  async function applyReschedule(id: string, start: Date, end: Date, staffId?: string) {
    try {
      await fetchJson(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: toNearestMinute(start).toISOString(),
          endTime: toNearestMinute(end).toISOString(),
          ...(staffId ? { staffId } : {}),
        }),
      });
      await loadAppointments(range);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reschedule.");
      await loadAppointments(range); // revert any optimistic UI by refetching truth
    }
  }

  // Dragging/resizing the draft event just adjusts the pending creation's
  // start/end in place - nothing to persist until the form is submitted.
  // Dragging/resizing a real event reschedules it immediately, as before.
  // `resourceId` is only present in "Group by staff" Day view - dragging a
  // shift into another person's column reassigns it to them.
  const handleEventDrop = useCallback(
    ({ event, start, end, resourceId }: EventInteractionArgs<CalendarEvent>) => {
      const newStaffId = typeof resourceId === "string" ? resourceId : undefined;
      if (event.id === DRAFT_EVENT_ID) {
        setCreating((prev) =>
          prev ? { ...prev, start: start as Date, end: end as Date, defaultStaffId: newStaffId ?? prev.defaultStaffId } : prev
        );
        return;
      }
      void applyReschedule(
        event.id,
        start as Date,
        end as Date,
        newStaffId && newStaffId !== event.resource.staffId ? newStaffId : undefined
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range]
  );

  const handleEventResize = useCallback(
    ({ event, start, end }: EventInteractionArgs<CalendarEvent>) => {
      if (event.id === DRAFT_EVENT_ID) {
        setCreating((prev) => (prev ? { ...prev, start: start as Date, end: end as Date } : prev));
        return;
      }
      void applyReschedule(event.id, start as Date, end as Date);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range]
  );

  // readOnly always wins, regardless of what the viewer's actual permissions
  // would otherwise allow - this is what makes the dedicated read-only
  // calendar view (see the /calendar/view route) genuinely non-interactive
  // rather than just "happens to be viewed by someone without edit rights".
  //
  // Shifts and appointments are independently gated (ISSUES.md #6) - each
  // action is two separate permissions, not one combined key, so every
  // button/drag/resize check below picks the right one for the specific
  // event (or mode) it applies to via canEditEvent/canCancelEvent below,
  // rather than a single flat canEdit/canCancel/canCreate boolean.
  const canCreateShift = !readOnly && (permissions?.CREATE_SHIFTS ?? false);
  const canCreateAppointment = !readOnly && (permissions?.CREATE_APPOINTMENTS ?? false);
  const canCreateCustom = !readOnly && (permissions?.CREATE_CUSTOM_ENTRIES ?? false);
  // Also ANDed with Settings > Calendar > "Allow editing booked events" - a
  // tenant-wide master switch that can lock booked events in place for
  // everyone regardless of role, independent of the per-role EDIT_SHIFTS/
  // EDIT_APPOINTMENTS/EDIT_CUSTOM_ENTRIES permissions themselves.
  const canEditShift = !readOnly && allowEditingBookedEvents && (permissions?.EDIT_SHIFTS ?? false);
  const canEditAppointment = !readOnly && allowEditingBookedEvents && (permissions?.EDIT_APPOINTMENTS ?? false);
  const canEditCustom = !readOnly && allowEditingBookedEvents && (permissions?.EDIT_CUSTOM_ENTRIES ?? false);
  const canCancelShift = !readOnly && (permissions?.CANCEL_SHIFTS ?? false);
  const canCancelAppointment = !readOnly && (permissions?.CANCEL_APPOINTMENTS ?? false);
  const canCancelCustom = !readOnly && (permissions?.CANCEL_CUSTOM_ENTRIES ?? false);
  const canDeleteShift = !readOnly && (permissions?.DELETE_SHIFTS ?? false);
  const canDeleteAppointment = !readOnly && (permissions?.DELETE_APPOINTMENTS ?? false);
  const canDeleteCustom = !readOnly && (permissions?.DELETE_CUSTOM_ENTRIES ?? false);
  // Generic "is the Create group worth showing at all" / "can anything on
  // this grid ever be dragged" checks - the specific buttons/accessors below
  // still each gate on their own specific permission, not this.
  const canCreate = canCreateShift || canCreateAppointment || canCreateCustom;
  const canEdit = canEditShift || canEditAppointment || canEditCustom;
  const canEditEvent = useCallback(
    (appt: ApiAppointment) => (isShift(appt) ? canEditShift : isCustomEntry(appt) ? canEditCustom : canEditAppointment),
    [canEditShift, canEditAppointment, canEditCustom]
  );
  const canCancelEvent = useCallback(
    (appt: ApiAppointment) =>
      isShift(appt) ? canCancelShift : isCustomEntry(appt) ? canCancelCustom : canCancelAppointment,
    [canCancelShift, canCancelAppointment, canCancelCustom]
  );
  const canDeleteEvent = useCallback(
    (appt: ApiAppointment) =>
      isShift(appt) ? canDeleteShift : isCustomEntry(appt) ? canDeleteCustom : canDeleteAppointment,
    [canDeleteShift, canDeleteAppointment, canDeleteCustom]
  );
  const canCreateForMode = useCallback(
    (mode: EntryMode) => (mode === "shift" ? canCreateShift : mode === "custom" ? canCreateCustom : canCreateAppointment),
    [canCreateShift, canCreateAppointment, canCreateCustom]
  );
  const canViewAllShifts = permissions?.VIEW_ALL_SHIFTS ?? false;
  const canViewAllAppointments = permissions?.VIEW_ALL_APPOINTMENTS ?? false;
  // Whether the Everyone/Just mine toggle is worth showing for whatever
  // this page shows - no point offering it for a kind the viewer can never
  // see beyond their own anyway. Custom entries have no VIEW_ALL_* concept of
  // their own yet, so they don't affect this toggle's visibility.
  const canToggleViewScope =
    calendarKind === "shift"
      ? canViewAllShifts
      : calendarKind === "appointment"
        ? canViewAllAppointments
        : canViewAllShifts || canViewAllAppointments;

  // Whether dragging a new selection on the grid as currently shown is
  // allowed at all - same ternary-on-calendarKind shape as canToggleViewScope
  // above. "all" can't know which kind a drag means (a default is guessed
  // from modeOptions below; the create form's own switcher lets the viewer
  // correct it), so it's allowed as long as any shown kind is creatable.
  const canCreateForCurrentType =
    calendarKind === "shift"
      ? canCreateShift
      : calendarKind === "appointment"
        ? canCreateAppointment
        : calendarKind === "custom"
          ? canCreateCustom
          : (showShiftUI && canCreateShift) || (showAppointmentUI && canCreateAppointment) || (showCustomUI && canCreateCustom);

  // Which of the fetched custom calendars this "custom" page is actually
  // showing - resolved by id rather than assuming the list has only one, now
  // that a tenant can have several. Undefined until the list has loaded or
  // if the id doesn't match anything (e.g. it was just deleted elsewhere).
  const activeCustomCalendar = useMemo(
    () => customCalendars.find((c) => c.id === customCalendarId),
    [customCalendars, customCalendarId]
  );

  // Every kind/calendar this viewer could create an entry as *right now*, in
  // a fixed preference order (Appointment, Shift, then each custom calendar)
  // - modeOptions[0] is the default guess a fresh "+ Add" click or slot-drag
  // opens the create form with; the form's own type switcher (only rendered
  // when this has more than one entry) is how the viewer corrects it from
  // there, rather than a separate "which kind is this?" popup beforehand. On
  // a fixed-kind page (calendarKind !== "all") this always resolves to
  // exactly one entry - that page's own kind - so the switcher never shows.
  const modeOptions = useMemo(() => {
    const opts: Array<{ mode: EntryMode; customCalendarId?: string; label: string }> = [];
    if (showAppointmentUI && canCreateAppointment) opts.push({ mode: "appointment", label: "Appointment" });
    if (showShiftUI && canCreateShift) opts.push({ mode: "shift", label: "Shift" });
    if (showCustomUI && canCreateCustom) {
      if (calendarKind === "custom") {
        if (activeCustomCalendar) opts.push({ mode: "custom", customCalendarId: activeCustomCalendar.id, label: activeCustomCalendar.name });
      } else if (calendarKind === "all") {
        for (const cc of customCalendars) opts.push({ mode: "custom", customCalendarId: cc.id, label: cc.name });
      }
    }
    return opts;
  }, [
    showAppointmentUI,
    canCreateAppointment,
    showShiftUI,
    canCreateShift,
    showCustomUI,
    canCreateCustom,
    calendarKind,
    activeCustomCalendar,
    customCalendars,
  ]);

  // Only the presets this viewer could actually use *on this page* - a
  // preset whose kind/calendar isn't in modeOptions (e.g. a Custom-calendar
  // preset shown on the fixed-kind Shifts page) is filtered out rather than
  // shown and failing when picked.
  const presetOptions = useMemo(
    () =>
      eventPresets.filter((p) =>
        modeOptions.some(
          (o) => o.mode === p.entryKind.toLowerCase() && (o.customCalendarId ?? null) === p.customCalendarId
        )
      ),
    [eventPresets, modeOptions]
  );

  // Resolves a given custom calendar id's field-visibility settings for the
  // create/detail panels, with a safe fallback (all fields shown, no client)
  // for the brief window before the list has loaded or if the id no longer
  // matches anything (e.g. the calendar was just deleted elsewhere).
  const customSettingsFor = useCallback(
    (id: string | null | undefined) => {
      const found = customCalendars.find((c) => c.id === id);
      return {
        showClient: found?.showClient ?? false,
        requireClient: found?.requireClient ?? false,
        showJobType: found?.showJobType ?? true,
        showJobEstimate: found?.showJobEstimate ?? true,
        showColorKey: found?.showColorKey ?? true,
        showPaymentStatus: found?.showPaymentStatus ?? false,
      };
    },
    [customCalendars]
  );

  // staffProfileIds of the selected team's members, or null when "All teams"
  // is selected - ANDed into visibleEvents/resourceStaff below rather than
  // replacing the staff filter.
  const teamStaffIds = useMemo(() => {
    if (teamFilter === "all") return null;
    const team = teams.find((t) => t.id === teamFilter);
    return new Set(team?.members.map((m) => m.staffProfileId) ?? []);
  }, [teams, teamFilter]);

  const visibleEvents = useMemo(() => {
    let list = staffFilter === "all" ? events : events.filter((e) => e.resource.staffId === staffFilter);
    if (teamStaffIds) list = list.filter((e) => teamStaffIds.has(e.resource.staffId));
    if (calendarKind === "all") {
      list = list.filter(
        (e) =>
          (showAppointmentUI && !isShift(e.resource) && !isCustomEntry(e.resource)) ||
          (showShiftUI && isShift(e.resource)) ||
          (showCustomUI && isCustomEntry(e.resource))
      );
    } else if (calendarKind === "appointment") list = list.filter((e) => !isShift(e.resource) && !isCustomEntry(e.resource));
    else if (calendarKind === "shift") list = list.filter((e) => isShift(e.resource));
    else if (calendarKind === "custom")
      list = list.filter((e) => isCustomEntry(e.resource) && e.resource.customCalendarId === customCalendarId);
    return list;
  }, [events, staffFilter, teamStaffIds, calendarKind, showAppointmentUI, showShiftUI, showCustomUI, customCalendarId]);

  // The pending create/shift form is rendered as a real calendar event (a
  // dashed "ghost" block) so its selection stays visible and can be dragged/
  // resized directly on the grid, instead of disappearing the moment the
  // mouse is released (react-big-calendar's own slot-selection highlight is
  // only ever momentary).
  const draftSlot = creating;

  // Day view only (see groupByStaff's declaration above for why) - the
  // staff filter dropdown still narrows which column(s) show, same as it
  // narrows the normal combined view.
  const resourceViewActive = groupByStaff && currentView === "day" && staff.length > 1;

  // How many lanes one day column has room for (see condenseEvents.ts and
  // columnDayLayout.ts), from the column's real width. A lane needs ~30px to
  // show a staff avatar at all (maxLanes - past that the rest become "+N
  // more") and ~50px to show a name (nameLanes - past that, people on the
  // same shift share one labelled block instead of becoming avatar-only
  // bars). Roughly 3 and 2 in a 7-day week, 12 and 12 in Day view.
  const dayColumnCount = currentView === "day" ? 1 : (visibleDayFilter?.length ?? 7);
  const dayColumnWidth = Math.max(0, gridWidth - 90) / dayColumnCount;
  const maxLanes = Math.min(12, Math.max(2, Math.floor(dayColumnWidth / 30)));
  const nameLanes = Math.min(maxLanes, Math.max(1, Math.floor(dayColumnWidth / 50)));

  // What actually goes on the grid. With 50-80 staff a single day can hold
  // 15 people on each of several overlapping shifts - drawn one box each,
  // that's unreadable slivers no layout can rescue. So wherever a day is
  // too crowded to show every entry, identical ones collapse into one block
  // per shift and any remaining excess into "+N more"; clicking either
  // lists everyone in it. The per-staff views (Group by staff) and Agenda
  // already give every entry its own row, so they're left untouched.
  const displayEvents = useMemo(() => {
    const gridIsCombined =
      (currentView === "day" && !resourceViewActive) || (currentView === "week" && !(groupByStaff && staff.length > 1));
    if (currentView !== "month" && !gridIsCombined) return visibleEvents;
    return condenseEvents(visibleEvents, {
      mode: currentView === "month" ? "day" : "time",
      limit: currentView === "month" ? 3 : maxLanes,
      groupLimit: currentView === "month" ? 3 : nameLanes,
      groupKey: groupKeyOf,
      makeGroup: makeGroupEvent,
    });
  }, [visibleEvents, currentView, resourceViewActive, groupByStaff, staff.length, maxLanes, nameLanes]);

  const calendarEvents = useMemo(() => {
    if (!draftSlot) return displayEvents;
    const draft: CalendarEvent = {
      id: DRAFT_EVENT_ID,
      // The "(drag to adjust)" hint itself is appended by EventContent, not
      // baked in here, so it can render smaller than the rest of the label
      // and be dropped once creationCount passes the onboarding threshold.
      title: draftSlot.mode === "shift" ? "New shift" : draftSlot.mode === "custom" ? "New custom entry" : "New appointment",
      start: draftSlot.start,
      end: draftSlot.end,
      // In "Group by staff" Day view, resourceAccessor reads staffId off
      // this to place the draft in the right column - whichever column was
      // clicked/dragged into (see onSelectSlot/handleEventDrop), falling
      // back to DRAFT_RESOURCE's empty id (no column) otherwise.
      resource: draftSlot.defaultStaffId ? { ...DRAFT_RESOURCE, staffId: draftSlot.defaultStaffId } : DRAFT_RESOURCE,
    };
    return [...displayEvents, draft];
  }, [displayEvents, draftSlot]);

  const resourceStaff = useMemo(() => {
    let list = staffFilter === "all" ? staff : staff.filter((s) => s.id === staffFilter);
    if (teamStaffIds) list = list.filter((s) => teamStaffIds.has(s.id));
    return list;
  }, [staff, staffFilter, teamStaffIds]);

  // react-big-calendar's `views` prop, as an object rather than the plain
  // array it used to be - letting a view name map to a real component
  // (rather than `true`, meaning "use the built-in one") is how
  // StaffWeekRosterView gets registered as Week's body when "Group by
  // staff" is on, while Month/Day/Agenda keep their built-in rendering
  // untouched. CalendarToolbar.tsx already handles both shapes of `views`.
  const views = useMemo(
    () => ({
      month: true,
      week:
        groupByStaff && staff.length > 1
          ? StaffWeekRosterView
          : visibleDayFilter
            ? createFilteredDaysView(visibleDayFilter, setVisibleDayFilter)
            : true,
      day: true,
      agenda: true,
    }),
    [groupByStaff, staff.length, visibleDayFilter]
  );

  // Extra, non-standard props forwarded straight through react-big-calendar
  // to whichever view is active (confirmed via Calendar.js's render() and
  // withDragAndDrop.js - neither strips unrecognized props) - the built-in
  // views just ignore these; StaffWeekRosterView is the only one that reads
  // them, for the staff list/colors it needs beyond react-big-calendar's
  // standard per-view prop contract. Spread as a variable rather than
  // inlined as JSX attributes so TypeScript's excess-property check (which
  // only fires for object literals written directly on a JSX tag) doesn't
  // flag them against DnDCalendar's typed props.
  const rosterViewProps = {
    rosterStaff: resourceStaff,
    rosterColorTriples: colorTriples,
    rosterCanCreate: canCreateForCurrentType,
    rosterTimeFormat: timeFormat,
  };

  // Week/Day's per-event time label (react-big-calendar's own
  // `.rbc-event-label`, separate from the staff name/title EventContent
  // renders below it) - honors the viewer's 12-hour/24-hour preference
  // (Settings > Account, same as everywhere else this calendar shows a
  // time) via formatClockTime/formatClockRange. Always the real, full time
  // - a previous version of this abbreviated it (dropping ":00", "9a"
  // instead of "9:00 AM") to fight truncation in narrow boxes, which read
  // as confusing shorthand rather than a real time; that narrow a box just
  // truncates the real time with an ellipsis now, same as any other text
  // here, rather than inventing a shorter notation of its own.
  const calendarFormats = useMemo(
    () => ({
      eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) => formatClockRange(start, end, timeFormat),
      eventTimeRangeStartFormat: ({ start }: { start: Date }) => `${formatClockTime(start, timeFormat)} – `,
      eventTimeRangeEndFormat: ({ end }: { end: Date }) => ` – ${formatClockTime(end, timeFormat)}`,
    }),
    [timeFormat]
  );

  // Hover text - the full story for an event whose lane is too narrow to
  // show more than an avatar.
  const eventTooltip = useCallback(
    (event: CalendarEvent) =>
      event.id.startsWith(BLOCKED_EVENT_ID_PREFIX)
        ? event.title
        : `${formatClockRange(event.start, event.end, timeFormat)} · ${event.title}`,
    [timeFormat]
  );

  const eventPropGetter = useCallback(
    (event: CalendarEvent) => {
      if (event.id.startsWith(BLOCKED_EVENT_ID_PREFIX)) {
        return {
          style: {
            backgroundColor: "color-mix(in srgb, #6b7280 25%, transparent)",
            backgroundImage:
              "repeating-linear-gradient(45deg, color-mix(in srgb, #6b7280 18%, transparent) 0, color-mix(in srgb, #6b7280 18%, transparent) 6px, transparent 6px, transparent 12px)",
            border: "none",
            color: "#4b5563",
            boxShadow: "none",
            // Decorative only (see BLOCKED_RESOURCE's doc comment) - never
            // intercepts a click meant for the real slot/grid underneath.
            pointerEvents: "none" as const,
          },
        };
      }
      if (event.id === DRAFT_EVENT_ID) {
        // Shift/appointment get their usual colors; a custom entry (and the
        // brief instant before the create form's own default mode guess
        // resolves) falls through to the same neutral gray the custom-
        // calendar quick-create buttons use elsewhere.
        const draftMode = draftSlot?.mode;
        return {
          style: {
            backgroundColor:
              draftMode === "shift"
                ? "color-mix(in srgb, var(--color-shift-500) 15%, transparent)"
                : draftMode === "appointment"
                  ? "color-mix(in srgb, var(--color-primary-500) 15%, transparent)"
                  : "color-mix(in srgb, #6b7280 15%, transparent)",
            border: `2px dashed ${
              draftMode === "shift" ? "var(--color-shift-600)" : draftMode === "appointment" ? "var(--color-primary-600)" : "#4b5563"
            }`,
            color: draftMode === "shift" ? "var(--color-shift-700)" : draftMode === "appointment" ? "var(--color-primary-700)" : "#374151",
            // Always above every real event, regardless of duration - the
            // slot being created should never get buried behind something
            // it happens to overlap.
            zIndex: 10081,
          },
        };
      }

      if (event.group?.kind === "overflow") {
        // A mix of unrelated entries, so no one entry's color - neutral, and
        // visibly not a booking itself.
        return {
          style: {
            backgroundColor: "#f3f4f6",
            borderColor: "#9ca3af",
            color: "#374151",
            zIndex: stackingZIndex(event.start, event.end),
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.25)",
          },
        };
      }

      const appt = event.resource;
      const c = resolveAppointmentColor(appt, colorTriples);

      return {
        style: {
          backgroundColor: c.bg,
          borderColor: c.border,
          color: c.text,
          textDecoration: appt.status === "CANCELLED" ? "line-through" : undefined,
          // Only matters in Month view, where a multi-day bar can sit under
          // a shorter chip - Week/Day lanes never overlap (columnDayLayout).
          zIndex: stackingZIndex(event.start, event.end),
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.25)",
        },
      };
    },
    [draftSlot, colorTriples]
  );

  // Whichever catalog holidays (US federal + European, individually
  // enabled/disabled per-holiday - see Settings > Calendar) are enabled,
  // merged with tenant-added custom holidays (recurring or one-off) for the
  // visible range - drives both the day-cell tint below and the "holidays
  // in view" list rendered next to the legend. The catalog never has two
  // entries sharing a name (see european.ts's dedup note), so no merge-time
  // dedup is needed here.
  const holidaysInView = useMemo<ComputedHoliday[]>(() => {
    const enabled = getEnabledHolidaysInRange(enabledHolidayNames, range.start, range.end);
    const custom = getCustomHolidaysInRange(holidays, range.start, range.end);
    return [...enabled, ...custom].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [range, enabledHolidayNames, holidays]);

  const holidayDateKeys = useMemo(
    () => new Set(holidaysInView.map((h) => h.date.toDateString())),
    [holidaysInView]
  );

  // Same merge as holidaysInView above, narrowed to just the ones also
  // marked "Block" (Tenant.blockedHolidayNames for catalog holidays,
  // Holiday.blocked for custom ones) - a blocked-but-not-enabled catalog
  // name has no effect (see blockedHolidayNames' schema doc comment), so
  // this only ever intersects with what's already enabled.
  const blockedHolidaysInView = useMemo<ComputedHoliday[]>(() => {
    const blockedEnabledNames = enabledHolidayNames.filter((n) => blockedHolidayNames.includes(n));
    const enabled = getEnabledHolidaysInRange(blockedEnabledNames, range.start, range.end);
    const custom = getCustomHolidaysInRange(holidays.filter((h) => h.blocked), range.start, range.end);
    return [...enabled, ...custom];
  }, [range, enabledHolidayNames, blockedHolidayNames, holidays]);

  const blockedHolidayDateKeys = useMemo(
    () => new Set(blockedHolidaysInView.map((h) => h.date.toDateString())),
    [blockedHolidaysInView]
  );

  // Settings > Calendar > "Blocked time" entries that actually fall within
  // the visible range - narrowed here (rather than sending all of them to
  // the grid) for the same reason loadAppointments scopes to `range`.
  const blockedTimesInView = useMemo(
    () =>
      blockedTimes.filter(
        (b) => new Date(b.startTime) < range.end && new Date(b.endTime) > range.start
      ),
    [blockedTimes, range]
  );

  // Rendered as backgroundEvents (Week/Day only - Month has no such concept,
  // it only ever tints a whole day via dayPropGetter below) so a partial-day
  // block (e.g. a lunch closure) shows as the actual hour range rather than
  // tinting the entire day.
  const blockedBackgroundEvents = useMemo<CalendarEvent[]>(() => {
    const fromHolidays = blockedHolidaysInView.map((h) => ({
      id: `${BLOCKED_EVENT_ID_PREFIX}holiday-${h.name}-${h.date.toISOString()}`,
      title: `${h.name} (closed)`,
      start: h.date,
      end: addDays(h.date, 1),
      resource: BLOCKED_RESOURCE,
    }));
    const fromBlockedTime = blockedTimesInView.map((b) => ({
      id: `${BLOCKED_EVENT_ID_PREFIX}${b.id}`,
      title: b.label || "Blocked",
      start: new Date(b.startTime),
      end: new Date(b.endTime),
      resource: BLOCKED_RESOURCE,
    }));
    return [...fromHolidays, ...fromBlockedTime];
  }, [blockedHolidaysInView, blockedTimesInView]);

  const dayPropGetter = useCallback(
    (date: Date) => {
      const blocked =
        blockedHolidayDateKeys.has(date.toDateString()) ||
        blockedTimesInView.some((b) => new Date(b.startTime) < addDays(date, 1) && new Date(b.endTime) > date);
      if (blocked) {
        return {
          style: { backgroundColor: "color-mix(in srgb, #6b7280 14%, white)" },
        };
      }
      if (!holidayDateKeys.has(date.toDateString())) return {};
      return {
        style: { backgroundColor: "color-mix(in srgb, #f59e0b 8%, white)" },
      };
    },
    [holidayDateKeys, blockedHolidayDateKeys, blockedTimesInView]
  );

  // Base status/type colors plus one legend entry per custom tag, so a tag's
  // color is explained on the legend the same way the 5 built-in colors are.
  const legendItems = useMemo(() => {
    const base = BASE_LEGEND_KEYS.filter(
      (key) => (key !== "appointment" || showAppointmentUI || showCustomUI) && (key !== "shift" || showShiftUI)
    ).map((key) => ({ key, label: EVENT_COLOR_LABELS[key], color: colorTriples[key].bg }));
    const tagItems = tags
      .filter(
        (t) =>
          t.appliesTo === "BOTH" ||
          (t.appliesTo === "APPOINTMENT" && showAppointmentUI) ||
          (t.appliesTo === "SHIFT" && showShiftUI)
      )
      .map((t) => ({ key: t.id, label: t.name, color: t.color }));
    return [...base, ...tagItems];
  }, [showAppointmentUI, showShiftUI, showCustomUI, colorTriples, tags]);

  // Bounds the Week/Day grid to the tenant's configured calendarStartMinute/
  // calendarEndMinute range (Settings > Calendar > "Calendar hours",
  // minutes-from-midnight, defaults to the full day). react-big-calendar's
  // min/max only read the time-of-day portion of these Date objects (the
  // date itself is ignored, merged onto whichever day is actually
  // rendered), so a fixed reference date (2000-01-01) is fine here. Hour 24
  // doesn't exist on a Date (it'd roll into the next day), so a full-day end
  // (1440) maps to 23:59:59 instead.
  const minutesToGridTime = useCallback(
    (minutes: number) =>
      minutes >= 1440
        ? new Date(2000, 0, 1, 23, 59, 59)
        : new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60, 0),
    []
  );
  const gridMinTime = useMemo(() => minutesToGridTime(calendarStartMinute), [minutesToGridTime, calendarStartMinute]);
  const gridMaxTime = useMemo(() => minutesToGridTime(calendarEndMinute), [minutesToGridTime, calendarEndMinute]);

  // Only affects where the grid starts scrolled to on first mount -
  // react-big-calendar doesn't re-read this prop after mount, so switching
  // halves afterward is handled imperatively in scrollToAmPmHalf below.
  // "AM" scrolls to the top of the configured range, "PM" to its midpoint -
  // same 0%/50% split scrollToAmPmHalf applies on later toggles.
  const initialScrollToTime = useMemo(
    () =>
      minutesToGridTime(
        amPmHalf === "PM" ? calendarStartMinute + (calendarEndMinute - calendarStartMinute) / 2 : calendarStartMinute
      ),
    [minutesToGridTime, amPmHalf, calendarStartMinute, calendarEndMinute]
  );

  // Smoothly scrolls the Week/Day time gutter to the top (AM) or the
  // midpoint (PM) of whatever range is currently rendered (the tenant's
  // configured calendarStartMinute/calendarEndMinute, see gridMinTime/
  // gridMaxTime above). Scrolls the actual DOM node directly since
  // react-big-calendar's `scrollToTime` prop only takes effect on first
  // mount, not on later prop changes.
  const scrollToAmPmHalf = useCallback((half: "AM" | "PM") => {
    const content = calendarWrapperRef.current?.querySelector<HTMLElement>(".rbc-time-content");
    if (!content) return;
    content.scrollTo({ top: content.scrollHeight * (half === "PM" ? 0.5 : 0), behavior: "smooth" });
  }, []);

  const showDragHint = creationCount < 10;

  // Custom event-content renderer. Gives the draft event's "(drag to
  // adjust)" hint its own smaller, lighter styling (a plain `title` string
  // can't be partially styled) and drops that hint once the viewer has
  // created enough entries to not need it. For every real appointment/shift,
  // also leads with a small colored initials badge + the staff member's name
  // (bold) ahead of the client/service text - react-big-calendar's own CSS
  // forces event content onto one truncated line (`.rbc-event-content`:
  // white-space: nowrap + text-overflow: ellipsis), which used to eat the
  // "(staff name)" suffix first on anything but a wide event box. The badge
  // is a flex-shrink-0 sibling so it's never clipped, and the name now comes
  // first in the text that does truncate.
  const EventContent = useCallback(
    ({ event }: { event: CalendarEvent }) => {
      // Week/Day draw the time here rather than through react-big-calendar's
      // own one-line label (hidden in globals.css), so it can wrap onto a
      // second line in a narrow lane instead of being cut off mid-time.
      const time =
        currentView === "week" || currentView === "day" ? (
          <span className="cal-time">
            <span>
              {formatClockTime(event.start, timeFormat)}
              <span className="cal-dash"> –</span>
            </span>
            <span>{formatClockTime(event.end, timeFormat)}</span>
          </span>
        ) : null;

      if (event.id === DRAFT_EVENT_ID) {
        return (
          <>
            {time}
            <span className="cal-text">
              {event.title}
              {showDragHint && <span className="ml-1 text-[10px] opacity-75">(drag to adjust)</span>}
            </span>
          </>
        );
      }
      if (event.id.startsWith(BLOCKED_EVENT_ID_PREFIX)) return <>{event.title}</>;

      // A summary block (see condenseEvents.ts): what it is and how many
      // people are in it lead, since that's what has to survive a narrow
      // box; the initials underneath wrap to fill whatever room is left and
      // are simply clipped by the box when there isn't any.
      if (event.group) {
        const { kind, members } = event.group;
        const label = groupLabel(members, kind);
        if (currentView === "month") {
          return (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="flex-shrink-0 rounded-full border border-current px-1 text-[10px] font-bold leading-tight">
                {members.length}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{label}</span>
                <span className="opacity-80"> · {formatClockRange(event.start, event.end, timeFormat)}</span>
              </span>
            </span>
          );
        }
        const shown = members.slice(0, 12);
        return (
          <span className="flex min-w-0 flex-col gap-1">
            {time}
            <span className="flex min-w-0 items-center gap-1">
              {/* The count is what survives the narrowest lane - the label
                  beside it is hidden there (cal-text, see globals.css). */}
              <span
                className={`flex-shrink-0 text-[10px] font-bold leading-tight ${
                  kind === "same" ? "rounded-full border border-current px-1" : ""
                }`}
              >
                {kind === "same" ? members.length : `+${members.length}`}
              </span>
              <span className="cal-text min-w-0 flex-1 truncate font-semibold leading-tight">
                {kind === "same" ? label : "more"}
              </span>
            </span>
            <span className="flex flex-wrap gap-0.5">
              {shown.map((m) => (
                <span
                  key={m.id}
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold leading-none text-white"
                  style={{ backgroundColor: staffAvatarColor(m.resource.staffId) }}
                >
                  {staffInitials(m.resource.staff.displayName)}
                </span>
              ))}
              {members.length > shown.length && (
                <span className="flex h-4 items-center text-[10px] font-semibold leading-none opacity-80">
                  +{members.length - shown.length}
                </span>
              )}
            </span>
          </span>
        );
      }

      const appt = event.resource;
      const staffName = appt.staff.displayName;

      // Month view's day cells are narrow and only fit a couple of rows
      // before "+N more" kicks in (see the `popup` prop below) - the
      // avatar-badge treatment below reads fine in Week/Day's wider slots,
      // but in Month it's mostly what eats the space that would otherwise
      // fit another event. Google Calendar's month cells use a plain
      // colored dot instead, so this drops the badge there in favor of one.
      if (currentView === "month") {
        return (
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: staffAvatarColor(appt.staffId) }}
            />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{staffName}</span>
              <span className="opacity-80"> · {formatClockRange(new Date(appt.startTime), new Date(appt.endTime), timeFormat)}</span>
              <span className="opacity-80"> · {appointmentTitle(appt)}</span>
            </span>
          </span>
        );
      }

      // Week/Day's day-column width is shared between however many events
      // overlap (one lane each, see columnDayLayout.ts), so what's shown
      // adapts to the lane's width - the cal-* classes are switched by
      // container queries in globals.css. A wide lane shows everything; a
      // medium one drops the avatar so the name gets the room; the
      // narrowest shows just the avatar (who) in a bar whose position on the
      // grid already says when, with the rest in the hover tooltip. Name and
      // title truncate as separate lines so a long title never eats the name.
      return (
        <>
          {time}
          <span className="cal-who flex min-w-0 items-start gap-1">
            <span
              className="cal-avatar mt-px flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold leading-none text-white"
              style={{ backgroundColor: staffAvatarColor(appt.staffId) }}
            >
              {staffInitials(staffName)}
            </span>
            <span className="cal-text min-w-0 flex-1 overflow-hidden">
              <span className="block truncate leading-tight font-semibold">{staffName}</span>
              <span className="block truncate leading-tight opacity-80">{appointmentTitle(appt)}</span>
            </span>
          </span>
        </>
      );
    },
    [showDragHint, currentView, timeFormat]
  );

  return (
    // --calendar-event-font-size drives .rbc-event's font-size in globals.css - set here,
    // on the outermost wrapper, so it cascades down to every event box regardless of view.
    <div
      className="flex flex-col gap-4"
      style={{ "--calendar-event-font-size": CALENDAR_TEXT_SIZE_REM[calendarTextSize] } as React.CSSProperties}
    >
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {readOnly && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-600">
          <span className="h-2 w-2 rounded-full bg-gray-400" />
          View only — this link can&apos;t create, reschedule, or cancel anything.
        </div>
      )}

      {/* Controls (filters, create buttons) and the legend stay above the
          calendar; the actual create/edit "fillout" opens in a modal over
          the grid once you've picked a slot or hit a button, rather than
          living inline in the page.
          `sticky top-14` pins this bar directly under AppHeader (~56px tall)
          once it scrolls to that point, instead of scrolling away with the
          page - switching a filter or hitting "Add appointment" no longer
          means scrolling all the way back up past the calendar grid first. */}
      <div
        ref={toolbarRef}
        className="sticky top-14 z-[9] flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 shadow-sm"
      >
        {/* One cohesive settings panel for every control (view toggles plus
            the create buttons) - grouped with a micro-label per control, all
            sharing the same pill shape, instead of the create buttons sitting
            in their own visually disconnected bordered box next to this one. */}
        {staff.length > 1 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Staff</span>
              <select
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="all">All staff</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {teams.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Team</span>
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="all">All teams</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Splits a single combined column/day into one lane per staff
              member so it stays readable once there are more than a handful
              of shifts at once, and makes it easy to spot who's working
              alongside whom. Wired up for Day (one column per staff) and
              Week (StaffWeekRosterView - one row per staff) - see
              groupByStaff's declaration. The button still shows on Month/
              Agenda too so switching views doesn't hide the control, but
              clicking it there jumps to Week (a more useful default than
              Day for seeing the whole roster) rather than doing nothing. */}
          {staff.length > 1 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Layout</span>
              <div className="inline-flex gap-0.5 rounded-full bg-white p-0.5 text-xs shadow-sm">
                {(["combined", "staff"] as const).map((layout) => (
                  <button
                    key={layout}
                    type="button"
                    onClick={() => {
                      if (layout === "staff" && currentView !== "day" && currentView !== "week") setCurrentView("week");
                      setGroupByStaff(layout === "staff");
                    }}
                    title={
                      layout === "staff"
                        ? "One column per staff member (Day) or one row per staff member (Week)"
                        : "Everyone in one combined view"
                    }
                    className={`rounded-full px-2.5 py-1 font-medium transition-all duration-150 ${
                      (layout === "staff") === groupByStaff
                        ? "bg-primary-500 text-white shadow-sm"
                        : "text-gray-600 hover:text-primary-600"
                    }`}
                  >
                    {layout === "staff" ? "By staff" : "Combined"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Settings > Permissions > VIEW_ALL_SHIFTS/VIEW_ALL_APPOINTMENTS -
              only rendered when the viewer actually holds the relevant
              permission for whatever's currently shown; without it they're
              always scoped to their own regardless of this control. */}
          {canToggleViewScope && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Viewing</span>
              <div className="inline-flex gap-0.5 rounded-full bg-white p-0.5 text-xs shadow-sm">
                {(["all", "mine"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setViewScope(v)}
                    className={`rounded-full px-2.5 py-1 font-medium transition-all duration-150 ${
                      viewScope === v
                        ? "bg-primary-500 text-white shadow-sm"
                        : "text-gray-600 hover:text-primary-600"
                    }`}
                  >
                    {v === "all" ? "Everyone" : "Just mine"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Controls the Week/Day time gutter's row size - hour, half-hour,
              or 15-minute blocks. No effect in Month view, which doesn't
              show a time gutter at all. */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Show days</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={60}
                placeholder="All"
                value={visibleDayFilter ? visibleDayFilter.length : ""}
                onChange={(e) => handleDayCountChange(e.target.value)}
                title="Show only the next N days, starting today - or drag across the Week view's day headers to pick a specific range"
                className="w-14 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              {visibleDayFilter && (
                <button
                  type="button"
                  onClick={() => setVisibleDayFilter(null)}
                  title="Clear day filter"
                  className="rounded-full bg-white px-2 py-1 text-xs font-medium text-gray-400 shadow-sm hover:text-red-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Time grid</span>
            <div className="inline-flex gap-0.5 rounded-full bg-white p-0.5 text-xs shadow-sm">
              {([60, 30, 15] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTimeStep(s)}
                  title="Time grid granularity"
                  className={`rounded-full px-2.5 py-1 font-medium transition-all duration-150 ${
                    timeStep === s
                      ? "bg-primary-500 text-white shadow-sm"
                      : "text-gray-600 hover:text-primary-600"
                  }`}
                >
                  {s === 60 ? "1 hr" : s === 30 ? "30 min" : "15 min"}
                </button>
              ))}
            </div>
          </div>

          {/* The Week/Day time gutter always renders the full 24 hours now -
              this just scrolls it to the morning or afternoon/evening half
              instead of hiding the other one. No effect in Month view. */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Hours</span>
            <div className="inline-flex gap-0.5 rounded-full bg-white p-0.5 text-xs shadow-sm">
              {(["AM", "PM"] as const).map((half) => (
                <button
                  key={half}
                  type="button"
                  onClick={() => {
                    setAmPmHalf(half);
                    scrollToAmPmHalf(half);
                  }}
                  title={half === "AM" ? "Scroll up to 12 AM" : "Scroll down to 12 PM"}
                  className={`rounded-full px-2.5 py-1 font-medium transition-all duration-150 ${
                    amPmHalf === half
                      ? "bg-primary-500 text-white shadow-sm"
                      : "text-gray-600 hover:text-primary-600"
                  }`}
                >
                  {half}
                </button>
              ))}
            </div>
          </div>

        {canCreate && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Create</span>
            {/* No pill/track behind these - they're solid brand-color action
                buttons, not toggles, so they don't need the white rounded-full
                container the toggle-pill groups elsewhere in this bar use. */}
            <div className="inline-flex items-center gap-1.5 text-xs">
              {calendarKind === "all" ? (
                // The combined "All" page can create any of several kinds -
                // one button per kind/custom-calendar used to stack up here;
                // now it's a single "+ Add event" that opens the create form
                // straight away with a default-guessed type (modeOptions[0]),
                // which the form's own type switcher lets the viewer correct
                // - instead of either hunting for the right one of N buttons,
                // or answering a separate "which kind is this?" popup first.
                modeOptions[0] && (
                  <button
                    type="button"
                    onClick={() => {
                      const first = modeOptions[0];
                      setCreating({
                        ...nextHourSlot(),
                        mode: first.mode,
                        customCalendarId: first.customCalendarId,
                        defaultStaffId: resourceStaff[0]?.id,
                      });
                    }}
                    className="rounded-full bg-primary-500 px-2.5 py-1 font-medium text-white shadow-sm transition-all duration-150 hover:bg-primary-600"
                  >
                    + Add event
                  </button>
                )
              ) : (
                <>
                  {showAppointmentUI && canCreateAppointment && (
                    <button
                      onClick={() =>
                        setCreating({ ...nextHourSlot(), mode: "appointment", defaultStaffId: resourceStaff[0]?.id })
                      }
                      className="rounded-full bg-primary-500 px-2.5 py-1 font-medium text-white shadow-sm transition-all duration-150 hover:bg-primary-600"
                    >
                      + Add event
                    </button>
                  )}
                  {showShiftUI && canCreateShift && (
                    <button
                      onClick={() => setCreating({ ...nextHourSlot(), mode: "shift", defaultStaffId: resourceStaff[0]?.id })}
                      className="rounded-full bg-shift-500 px-2.5 py-1 font-medium text-white shadow-sm transition-all duration-150 hover:bg-shift-600"
                    >
                      + Add event
                    </button>
                  )}
                  {/* Only ever reached on the fixed-kind "custom" page - "all"
                      is handled by the single "+ Add event" button above instead. */}
                  {showCustomUI && canCreateCustom && calendarKind === "custom" && activeCustomCalendar && (
                    <button
                      onClick={() =>
                        setCreating({
                          ...nextHourSlot(),
                          mode: "custom",
                          defaultStaffId: resourceStaff[0]?.id,
                          customCalendarId: activeCustomCalendar.id,
                        })
                      }
                      className="rounded-full bg-gray-600 px-2.5 py-1 font-medium text-white shadow-sm transition-all duration-150 hover:bg-gray-700"
                    >
                      + Add event
                    </button>
                  )}
                </>
              )}
              {/* Always rendered (space reserved via `invisible`, not conditionally
                  mounted) so this button appearing doesn't grow the row's content
                  width and reflow the rest of the toolbar - that reflow was the
                  actual cause of the "everything shifts left" bug, not the
                  page-height/scrollbar effect originally suspected. */}
              <button
                type="button"
                onClick={() => setCreating(null)}
                className={`rounded-full border border-[#BD3039] px-2.5 py-1 font-medium text-[#BD3039] transition-all duration-150 hover:bg-[#BD3039]/10 ${
                  creating ? "" : "invisible"
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div
            ref={calendarWrapperRef}
            style={{ height: 650 }}
            // `isolate` contains the event stacking z-indexes below (up into
            // the thousands, for the overlap-layering effect) to *this*
            // element - without it they have no ancestor stacking context to
            // stop at, so they compete directly with the page's own
            // z-indexed elements, including the create/detail Modal's
            // backdrop (z-50) elsewhere on the page - a 2000+ event z-index
            // easily outranks that and paints straight through it. Fixed-
            // position elements like the Modal still paint above this div's
            // own (unraised, auto) stacking position regardless.
            className="relative isolate rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            {appointmentsLoading && events.length === 0 ? (
              <div className="flex h-full animate-pulse flex-col gap-3 p-2">
                <div className="h-8 w-full rounded-md bg-gray-100" />
                <div className="h-full w-full rounded-md bg-gray-100" />
              </div>
            ) : appointmentsError && events.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-gray-600">{appointmentsError}</p>
                <button
                  type="button"
                  onClick={() => void loadAppointments(range)}
                  className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-600"
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                {appointmentsError && (
                  <p className="mb-2 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
                    {appointmentsError} Showing the last loaded data.{" "}
                    <button
                      type="button"
                      onClick={() => void loadAppointments(range)}
                      className="font-medium underline hover:no-underline"
                    >
                      Retry
                    </button>
                  </p>
                )}
                <DayDragContext.Provider value={dayDragContextValue}>
                <DnDCalendar
                  localizer={localizer}
                  events={calendarEvents}
                  backgroundEvents={blockedBackgroundEvents}
                  startAccessor="start"
                  endAccessor="end"
                  date={currentDate}
                  view={currentView}
                  onNavigate={(date) => setCurrentDate(date)}
                  onView={handleViewChange}
                  views={views}
                  // One lane per event, never overlapping (see columnDayLayout.ts).
                  dayLayoutAlgorithm={columnDayLayout}
                  tooltipAccessor={eventTooltip}
                  // Overnight entries (e.g. 8pm-6am) render in the grid on
                  // both days instead of the all-day strip at the top.
                  showMultiDayTimes
                  // Month: "+N more" opens an inline popup listing the rest of
                  // that day's events (Google Calendar's day-cell overflow
                  // behavior) instead of the default of silently navigating to
                  // Day view for that date.
                  popup
                  components={{
                    toolbar: CalendarToolbar,
                    event: EventContent,
                    timeGutterHeader: TimeGutterHeader,
                    header: DayHeaderCell,
                  }}
                  formats={calendarFormats}
                  step={timeStep}
                  timeslots={1}
                  min={gridMinTime}
                  max={gridMaxTime}
                  scrollToTime={initialScrollToTime}
                  // "Group by staff" Day view only - one column per staff
                  // member instead of the combined single-column grid. Never
                  // passed in any other view/mode, which keeps every other
                  // view's plain (non-resourced) rendering exactly as before.
                  {...(resourceViewActive
                    ? {
                        resources: resourceStaff,
                        resourceIdAccessor: "id" as const,
                        resourceTitleAccessor: "displayName" as const,
                        resourceAccessor: (event: CalendarEvent) => event.resource.staffId,
                      }
                    : {})}
                  {...rosterViewProps}
                  // "ignoreEvents" lets a new selection be drawn starting on top of
                  // an existing event instead of the existing event capturing the
                  // click/drag - this is what lets overlapping bookings be created
                  // deliberately rather than being blocked by whatever's already
                  // there.
                  selectable={canCreateForCurrentType ? "ignoreEvents" : false}
                  resizable={canEdit || canCreate}
                  // A summary block stands in for several entries - there's no
                  // single booking to reschedule, so it's click-to-open only.
                  draggableAccessor={(event: CalendarEvent) =>
                    event.group
                      ? false
                      : event.id === DRAFT_EVENT_ID
                        ? (creating ? canCreateForMode(creating.mode) : false)
                        : canEditEvent(event.resource)
                  }
                  resizableAccessor={(event: CalendarEvent) =>
                    event.group
                      ? false
                      : event.id === DRAFT_EVENT_ID
                        ? (creating ? canCreateForMode(creating.mode) : false)
                        : canEditEvent(event.resource)
                  }
                  onRangeChange={handleRangeChange}
                  onSelectSlot={(slot: SlotInfo) => {
                    if (!canCreateForCurrentType) return;
                    // Only set in "Group by staff" Day view - which column
                    // was clicked/dragged into becomes the new entry's
                    // default staff member.
                    const defaultStaffId = typeof slot.resourceId === "string" ? slot.resourceId : undefined;
                    // If a creation is already in progress, a fresh click-drag just
                    // repositions it (same mode) rather than discarding it - the
                    // draft event itself can also be dragged/resized directly, this
                    // is just the other way to move it.
                    setCreating((prev) => {
                      if (prev) return { ...prev, start: slot.start, end: slot.end, defaultStaffId: defaultStaffId ?? prev.defaultStaffId };
                      // A fixed-kind page always knows which kind a click/drag
                      // means. "all" shows every kind together, so there's no
                      // single answer to infer - default-guess the first
                      // available option (modeOptions[0]) and let the create
                      // form's own type switcher correct it, same as the
                      // toolbar's "+ Add" button.
                      if (calendarKind === "all") {
                        const first = modeOptions[0];
                        if (!first) return prev;
                        return { start: slot.start, end: slot.end, mode: first.mode, customCalendarId: first.customCalendarId, defaultStaffId };
                      }
                      return {
                        start: slot.start,
                        end: slot.end,
                        mode: calendarKind,
                        defaultStaffId,
                        ...(calendarKind === "custom" ? { customCalendarId } : {}),
                      };
                    });
                  }}
                  onSelectEvent={(event: CalendarEvent) => {
                    if (event.id === DRAFT_EVENT_ID) return;
                    if (event.group) {
                      setOpenGroup(event);
                      return;
                    }
                    setSelected(event.resource);
                  }}
                  onEventDrop={handleEventDrop}
                  onEventResize={handleEventResize}
                  eventPropGetter={eventPropGetter}
                  dayPropGetter={dayPropGetter}
                />
                </DayDragContext.Provider>
              </>
            )}
          </div>
        </div>

        {/* Pinned the same way the toolbar above is (`sticky top-14`) so it
            doesn't scroll away with the (often much taller) calendar grid -
            `lg:self-start` is required alongside `lg:sticky` here because
            this row's flex items otherwise stretch to match the grid's
            height, which would leave nothing for "sticky" to actually do. */}
        <div
          className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0 lg:sticky lg:self-start"
          style={{ top: `calc(3.5rem + ${toolbarHeight}px + 1rem)` }}
        >
          <MiniMonthCalendar currentDate={currentDate} range={range} onNavigateToDate={setCurrentDate} />
          <CalendarLegend
            legendItems={legendItems}
            holidaysInView={holidaysInView}
            blockedInView={blockedBackgroundEvents}
          />
        </div>
      </div>

      {creating && (
        // Selecting a slot shouldn't snap the form into view instantly - the
        // draft "ghost" event on the calendar shows the selection right
        // away, and this modal holds briefly (see the panelVisible delay
        // above) before fading/scaling in over it, so the selection itself
        // gets a beat to register before the form appears.
        <Modal onClose={() => setCreating(null)} visible={panelVisible} panelRef={panelRef}>
          {creating.quickCustom ? (
            <CustomEventPanel
              // Remounts on a mode switch, same reasoning as CreateEntryPanel's key below.
              key={`quick:${creating.mode}`}
              start={creating.start}
              end={creating.end}
              mode={creating.mode === "shift" ? "shift" : "appointment"}
              defaultStaffId={creating.defaultStaffId}
              modeOptions={modeOptions}
              onModeSelect={(opt) =>
                setCreating((prev) =>
                  prev ? { ...prev, mode: opt.mode, customCalendarId: opt.customCalendarId, quickCustom: false } : prev
                )
              }
              onFileUnderChange={(mode) => setCreating((prev) => (prev ? { ...prev, mode } : prev))}
              canCreateAppointment={canCreateAppointment}
              canCreateShift={canCreateShift}
              onRangeChange={(start, end) => setCreating((prev) => (prev ? { ...prev, start, end } : prev))}
              staff={staff}
              onClose={() => setCreating(null)}
              onCreated={() => {
                setCreating(null);
                setCreationCount(bumpCreationCount());
                void loadAppointments(range);
              }}
            />
          ) : (
            <CreateEntryPanel
              // Remounts (clearing whatever's been typed into mode-specific
              // fields) whenever the type switcher below picks a different
              // kind/custom calendar - simpler and safer than hand-resetting
              // every piece of local state the panel owns.
              key={`${creating.mode}:${creating.customCalendarId ?? ""}`}
              start={creating.start}
              end={creating.end}
              mode={creating.mode}
              customCalendarId={creating.customCalendarId}
              defaultStaffId={creating.defaultStaffId}
              modeOptions={modeOptions}
              onModeSelect={(opt) =>
                setCreating((prev) =>
                  prev ? { ...prev, mode: opt.mode, customCalendarId: opt.customCalendarId, quickCustom: false } : prev
                )
              }
              quickCustomAvailable={canCreateAppointment || canCreateShift}
              onQuickCustomSelect={() =>
                setCreating((prev) =>
                  prev
                    ? {
                        ...prev,
                        // Keep the current appointment/shift choice if it's
                        // already one of those; otherwise (coming from a
                        // named custom calendar) default to whichever of the
                        // two the viewer can actually create.
                        mode:
                          prev.mode === "shift" || prev.mode === "appointment"
                            ? prev.mode
                            : canCreateAppointment
                              ? "appointment"
                              : "shift",
                        customCalendarId: undefined,
                        quickCustom: true,
                      }
                    : prev
                )
              }
              presetOptions={presetOptions}
              onPresetSelect={(preset) =>
                setCreating((prev) =>
                  prev
                    ? {
                        ...prev,
                        mode: preset.entryKind.toLowerCase() as EntryMode,
                        customCalendarId: preset.customCalendarId ?? undefined,
                        end: new Date(prev.start.getTime() + preset.durationMinutes * 60000),
                      }
                    : prev
                )
              }
              onRangeChange={(start, end) =>
                setCreating((prev) => (prev ? { ...prev, start, end } : prev))
              }
              staff={staff}
              // Custom entries pick from the shift service-type list (no price/
              // payment concept, same as a shift) rather than needing a third
              // ServiceType table - see the schema's entryKind doc comment.
              serviceTypes={creating.mode === "appointment" ? appointmentServiceTypes : shiftServiceTypes}
              clients={clients}
              tags={tags}
              roles={roles}
              requireClient={requireClientForAppointments}
              showJobType={showJobTypeOnShiftForm}
              showJobEstimate={showJobEstimateOnShiftForm}
              showColorKey={showColorKeyOnShiftForm}
              customSettings={customSettingsFor(creating.customCalendarId)}
              canEditEstimates={permissions?.EDIT_JOB_ESTIMATES ?? false}
              canCreateStaff={permissions?.CREATE_STAFF ?? false}
              canCreateClient={permissions?.CREATE_CLIENTS ?? false}
              canCreateTag={canCreateForMode(creating.mode)}
              onStaffCreated={loadStaff}
              onClientCreated={loadClients}
              onTagCreated={loadTags}
              onClose={() => setCreating(null)}
              onCreated={() => {
                setCreating(null);
                setCreationCount(bumpCreationCount());
                void loadAppointments(range);
              }}
            />
          )}
        </Modal>
      )}

      {openGroup?.group && (
        <Modal onClose={() => setOpenGroup(null)}>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-gray-900">
                  {openGroup.group.kind === "same"
                    ? appointmentTitle(openGroup.resource)
                    : `${openGroup.group.members.length} entries`}
                </h2>
                <p className="text-sm text-gray-500">
                  {format(openGroup.start, "EEE, MMM d")} · {formatClockRange(openGroup.start, openGroup.end, timeFormat)}
                  {openGroup.group.kind === "same" && ` · ${openGroup.group.members.length} staff`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenGroup(null)}
                className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
            <ul className="mt-3 max-h-[55vh] divide-y divide-gray-100 overflow-y-auto">
              {openGroup.group.members.map((m) => {
                const c = resolveAppointmentColor(m.resource, colorTriples);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenGroup(null);
                        setSelected(m.resource);
                      }}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-gray-50"
                    >
                      <span
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ backgroundColor: staffAvatarColor(m.resource.staffId) }}
                      >
                        {staffInitials(m.resource.staff.displayName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900">
                          {m.resource.staff.displayName}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {formatClockRange(m.start, m.end, timeFormat)} · {appointmentTitle(m.resource)}
                        </span>
                      </span>
                      <span
                        className="h-3 w-3 flex-shrink-0 rounded-full border"
                        style={{ backgroundColor: c.bg, borderColor: c.border }}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </Modal>
      )}

      {selected && (
        <Modal onClose={() => setSelected(null)}>
          <AppointmentDetailPanel
            appointment={selected}
            permissions={permissions}
            allowEditingBookedEvents={allowEditingBookedEvents}
            canCancel={canCancelEvent(selected)}
            canDelete={canDeleteEvent(selected)}
            canEdit={canEditEvent(selected)}
            canFindCoverage={canEditEvent(selected)}
            readOnly={readOnly}
            enableMapsNavigation={enableMapsNavigation}
            showPaymentStatus={showPaymentStatus}
            showJobType={showJobTypeOnShiftForm}
            showJobEstimate={showJobEstimateOnShiftForm}
            showColorKey={showColorKeyOnShiftForm}
            customSettings={customSettingsFor(selected.customCalendarId)}
            colorTriples={colorTriples}
            timeFormat={timeFormat}
            tags={tags}
            staff={staff}
            serviceTypes={isShift(selected) || isCustomEntry(selected) ? shiftServiceTypes : appointmentServiceTypes}
            clients={clients}
            canCreateTag={isShift(selected) ? canCreateShift : isCustomEntry(selected) ? canCreateCustom : canCreateAppointment}
            onTagCreated={loadTags}
            onClose={() => setSelected(null)}
            onChanged={() => {
              setSelected(null);
              void loadAppointments(range);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function StatusPill({
  appointment,
  colorTriples,
}: {
  appointment: ApiAppointment;
  colorTriples: Record<EventColorKey, ColorTriple>;
}) {
  const c = resolveAppointmentColor(appointment, colorTriples);

  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {appointment.status}
    </span>
  );
}

export function AppointmentDetailPanel({
  appointment,
  permissions,
  allowEditingBookedEvents,
  canCancel,
  canDelete,
  canEdit,
  canFindCoverage,
  readOnly = false,
  enableMapsNavigation,
  showPaymentStatus,
  showJobType,
  showJobEstimate,
  showColorKey,
  customSettings,
  colorTriples,
  timeFormat,
  tags,
  staff,
  serviceTypes,
  clients,
  canCreateTag,
  onTagCreated,
  onClose,
  onChanged,
}: {
  appointment: ApiAppointment;
  permissions: Record<PermissionKey, boolean> | null;
  // Settings > Calendar > "Allow editing booked events" - see its schema
  // doc comment. ANDed into canEditEstimates below the same way the parent
  // already ANDs it into canEdit itself (via canEditEvent).
  allowEditingBookedEvents: boolean;
  // Also gates un-cancelling - restoring is the inverse of cancelling and
  // shares its CANCEL_* permission server-side.
  canCancel: boolean;
  canDelete: boolean;
  canEdit: boolean;
  canFindCoverage: boolean;
  readOnly?: boolean;
  enableMapsNavigation: boolean;
  // Admin-configurable (Settings > "Appointment form") - never shown for a
  // shift regardless of this setting, since a shift has no client/price to
  // begin with. Custom entries use customSettings.showPaymentStatus instead.
  showPaymentStatus: boolean;
  // Admin-configurable (Settings > "Shift form") - only applies to shift
  // entries; appointments always show these fields regardless, and custom
  // entries use customSettings' equivalents instead.
  showJobType: boolean;
  showJobEstimate: boolean;
  showColorKey: boolean;
  // Admin-configurable (Settings > Calendars > "Custom form") - the same
  // show/hide shape as the shift-form toggles above, just for the third
  // entry kind, plus showClient/requireClient since a custom entry doesn't
  // inherently need a client the way an appointment does.
  customSettings: {
    showClient: boolean;
    requireClient: boolean;
    showJobType: boolean;
    showJobEstimate: boolean;
    showColorKey: boolean;
    showPaymentStatus: boolean;
  };
  colorTriples: Record<EventColorKey, ColorTriple>;
  timeFormat: TimeFormat;
  tags: TagOption[];
  staff: StaffOption[];
  serviceTypes: ServiceTypeOption[];
  clients: ClientOption[];
  canCreateTag: boolean;
  onTagCreated: () => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const canViewEstimates = permissions?.VIEW_JOB_ESTIMATES ?? false;
  const canEditEstimates = !readOnly && allowEditingBookedEvents && (permissions?.EDIT_JOB_ESTIMATES ?? false);
  const [editing, setEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editClientId, setEditClientId] = useState(appointment.clientId ?? "");
  const [editServiceTypeId, setEditServiceTypeId] = useState(appointment.serviceTypeId ?? "");
  const [editStaffId, setEditStaffId] = useState(appointment.staffId);
  const [editLocationType, setEditLocationType] = useState(appointment.locationType);
  const [editLocation, setEditLocation] = useState(appointment.location ?? "");
  const [editPriceCharged, setEditPriceCharged] = useState(appointment.priceCharged ?? "");
  const [editPaymentStatus, setEditPaymentStatus] = useState(appointment.paymentStatus);
  const [editStart, setEditStart] = useState(() => toInputValue(new Date(appointment.startTime)));
  const [editEnd, setEditEnd] = useState(() => toInputValue(new Date(appointment.endTime)));
  const [includeEstimate, setIncludeEstimate] = useState(
    appointment.estimatedDurationMinutes != null || appointment.estimatedValue != null
  );
  const [durationValue, setDurationValue] = useState(
    () => minutesToDuration(appointment.estimatedDurationMinutes).value
  );
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(
    () => minutesToDuration(appointment.estimatedDurationMinutes).unit
  );
  const [value, setValue] = useState(appointment.estimatedValue ?? "");
  const [saving, setSaving] = useState(false);
  const entryMode: EntryMode = entryModeOf(appointment);
  const entryNoun = entryMode === "shift" ? "shift" : entryMode === "custom" ? "entry" : "appointment";
  const visibleTags = tagsForMode(tags, entryMode);
  // Resolves each shift-only toggle (showJobType etc.) against the right
  // settings source for this entry's actual kind: appointments always show
  // (today's existing behavior), shifts use the shift-form toggles, and
  // custom entries use their own independently-configured toggles.
  const effectiveShowClient = entryMode === "appointment" ? true : entryMode === "custom" ? customSettings.showClient : false;
  const effectiveShowJobType = entryMode === "shift" ? showJobType : entryMode === "custom" ? customSettings.showJobType : true;
  const effectiveShowJobEstimate =
    entryMode === "shift" ? showJobEstimate : entryMode === "custom" ? customSettings.showJobEstimate : true;
  const effectiveShowColorKey = entryMode === "shift" ? showColorKey : entryMode === "custom" ? customSettings.showColorKey : true;
  const effectiveShowPaymentStatus =
    entryMode === "appointment" ? showPaymentStatus : entryMode === "custom" ? customSettings.showPaymentStatus : false;
  const [colorValue, setColorValue] = useState(() => colorValueFor(appointment));
  const [savingTag, setSavingTag] = useState(false);
  const [showNewTagForm, setShowNewTagForm] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#2563eb");
  const [coverageCandidates, setCoverageCandidates] = useState<
    Array<{ staffId: string; displayName: string; hoursThisWeek: number }> | null
  >(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [outcomeSaving, setOutcomeSaving] = useState(false);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  // Shared by cancel/restore/delete - only one of them can be in flight at a time.
  const [lifecycleSaving, setLifecycleSaving] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  async function saveColorValue(value: string) {
    setSavingTag(true);
    try {
      await fetchJson(`/api/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parseColorValue(value)),
      });
      onChanged();
    } finally {
      setSavingTag(false);
    }
  }

  async function createTag() {
    if (!newTagName.trim()) return;
    const { tag } = await fetchJson<{ tag: TagOption }>("/api/event-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newTagName.trim(),
        color: newTagColor,
        appliesTo: entryMode === "shift" ? "SHIFT" : entryMode === "custom" ? "BOTH" : "APPOINTMENT",
      }),
    });
    onTagCreated();
    setShowNewTagForm(false);
    setNewTagName("");
    setColorValue(tag.id);
    await saveColorValue(tag.id);
  }

  async function findCoverage() {
    setCoverageLoading(true);
    setCoverageError(null);
    try {
      const { candidates } = await fetchJson<{
        candidates: Array<{ staffId: string; displayName: string; hoursThisWeek: number }>;
      }>(`/api/appointments/${appointment.id}/coverage`);
      setCoverageCandidates(candidates);
    } catch (err) {
      setCoverageError(err instanceof Error ? err.message : "Couldn't find coverage.");
    } finally {
      setCoverageLoading(false);
    }
  }

  async function assignCoverage(staffId: string) {
    setAssigning(staffId);
    try {
      await fetchJson(`/api/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId }),
      });
      onChanged();
    } catch (err) {
      setCoverageError(err instanceof Error ? err.message : "Couldn't assign coverage.");
      setAssigning(null);
    }
  }

  async function saveEstimates() {
    setSaving(true);
    try {
      await fetchJson(`/api/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimatedDurationMinutes: includeEstimate ? durationToMinutes(durationValue, durationUnit) : null,
          estimatedValue: includeEstimate && value !== "" ? Number(value) : null,
        }),
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function cancelAppointment() {
    await fetchJson(`/api/appointments/${appointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    onChanged();
  }

  async function restoreAppointment() {
    setLifecycleSaving(true);
    setLifecycleError(null);
    try {
      await fetchJson(`/api/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "BOOKED" }),
      });
      onChanged();
    } catch (err) {
      setLifecycleError(err instanceof Error ? err.message : `Couldn't restore this ${entryNoun}.`);
      setLifecycleSaving(false);
    }
  }

  async function deleteAppointment() {
    if (!window.confirm(`Permanently delete this ${entryNoun}? It will be removed from the calendar and reports. This can't be undone.`)) return;
    setLifecycleSaving(true);
    setLifecycleError(null);
    try {
      await fetchJson(`/api/appointments/${appointment.id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setLifecycleError(err instanceof Error ? err.message : `Couldn't delete this ${entryNoun}.`);
      setLifecycleSaving(false);
    }
  }

  async function setOutcomeStatus(status: "BOOKED" | "COMPLETED" | "NO_SHOW") {
    setOutcomeSaving(true);
    setOutcomeError(null);
    try {
      await fetchJson(`/api/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onChanged();
    } catch (err) {
      setOutcomeError(err instanceof Error ? err.message : "Couldn't update status.");
      setOutcomeSaving(false);
    }
  }

  async function saveEdits(e: React.FormEvent) {
    e.preventDefault();
    const start = new Date(editStart);
    const end = new Date(editEnd);
    if (end <= start) {
      setEditError("End time must be after start time.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await fetchJson(`/api/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          staffId: editStaffId,
          // Only sent when the client field actually shows for this entry's
          // kind - never for a shift, and for a custom entry only when
          // customSettings.showClient is on.
          ...(effectiveShowClient ? { clientId: editClientId || null } : {}),
          serviceTypeId: editServiceTypeId || null,
          locationType: editLocationType,
          location: editLocation.trim() || null,
          priceCharged: editPriceCharged === "" ? null : Number(editPriceCharged),
          paymentStatus: editPaymentStatus,
        }),
      });
      onChanged();
    } catch (err) {
      setEditError(
        err instanceof ApiError && err.status === 409
          ? "That time overlaps another booking for this staff member."
          : err instanceof Error
            ? err.message
            : "Couldn't save changes."
      );
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-primary-100 bg-linear-to-br from-primary-50 to-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-medium">
            {entryMode === "shift"
              ? "Shift details"
              : entryMode === "custom"
                ? `${appointment.customCalendar?.name ?? "Custom"} details`
                : "Appointment details"}
          </h2>
          <div className="mt-1">
            <StatusPill appointment={appointment} colorTriples={colorTriples} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm font-medium text-primary-600 hover:underline"
            >
              Edit
            </button>
          )}
          <button onClick={onClose} className="text-sm text-gray-500 hover:underline">
            Close
          </button>
        </div>
      </div>

      {editing ? (
        <form onSubmit={saveEdits} className="grid grid-cols-2 gap-3 text-sm">
          {effectiveShowClient && (
            <label className="col-span-2 flex flex-col gap-1">
              Client
              <select
                value={editClientId}
                onChange={(e) => setEditClientId(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1"
              >
                <option value="">— (internal/shift)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {effectiveShowJobType && (
            <label className="flex flex-col gap-1">
              Service
              <select
                value={editServiceTypeId}
                onChange={(e) => setEditServiceTypeId(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1"
              >
                <option value="">—</option>
                {serviceTypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1">
            Staff
            <select
              value={editStaffId}
              onChange={(e) => setEditStaffId(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1"
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Starts
            <input
              type="datetime-local"
              value={editStart}
              onChange={(e) => setEditStart(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            Ends
            <input
              type="datetime-local"
              value={editEnd}
              onChange={(e) => setEditEnd(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            Meeting
            <select
              value={editLocationType}
              onChange={(e) => setEditLocationType(e.target.value as "IN_PERSON" | "ONLINE")}
              className="rounded-md border border-gray-300 px-2 py-1"
            >
              <option value="IN_PERSON">In person</option>
              <option value="ONLINE">Online</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            {editLocationType === "ONLINE" ? "Link" : "Address"}
            <input
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            Price charged ($)
            <input
              type="number"
              min={0}
              step="0.01"
              value={editPriceCharged}
              onChange={(e) => setEditPriceCharged(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1"
            />
          </label>
          {effectiveShowPaymentStatus && (
            <label className="flex flex-col gap-1">
              Payment
              <select
                value={editPaymentStatus}
                onChange={(e) => setEditPaymentStatus(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1"
              >
                <option value="UNPAID">Unpaid</option>
                <option value="PAID">Paid</option>
                <option value="WAIVED">Waived</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </label>
          )}

          {editError && <p className="col-span-2 text-sm text-red-600">{editError}</p>}

          <div className="col-span-2 mt-1 flex gap-2">
            <button
              type="submit"
              disabled={editSaving}
              className="rounded-md bg-primary-500 px-3 py-1 text-sm text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {editSaving ? "Saving..." : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEditError(null);
              }}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500">When</dt>
          <dd>
            {format(new Date(appointment.startTime), "EEE, MMM d")} &middot;{" "}
            {formatClockRange(new Date(appointment.startTime), new Date(appointment.endTime), timeFormat)}
          </dd>
          {effectiveShowClient && (
            <>
              <dt className="text-gray-500">Client</dt>
              <dd>{appointment.client?.name ?? "— (internal/shift)"}</dd>
            </>
          )}
          {appointment.client?.email && (
            <>
              <dt className="text-gray-500">Email</dt>
              <dd>{appointment.client.email}</dd>
            </>
          )}
          {appointment.client?.phone && (
            <>
              <dt className="text-gray-500">Phone</dt>
              <dd>{appointment.client.phone}</dd>
            </>
          )}
          {effectiveShowJobType && (
            <>
              <dt className="text-gray-500">Service</dt>
              <dd>{appointment.serviceType?.name ?? "—"}</dd>
            </>
          )}
          <dt className="text-gray-500">Staff</dt>
          <dd>{appointment.staff.displayName}</dd>
          <dt className="text-gray-500">Meeting</dt>
          <dd>{appointment.locationType === "ONLINE" ? "Online" : "In person"}</dd>
          {appointment.location && (
            <>
              <dt className="text-gray-500">
                {appointment.locationType === "ONLINE" ? "Link" : "Address"}
              </dt>
              <dd className="flex items-center gap-2">
                <span>{appointment.location}</span>
                {appointment.locationType === "IN_PERSON" && enableMapsNavigation && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(appointment.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary-300 px-2 py-0.5 text-xs text-primary-700 hover:bg-primary-50"
                  >
                    Open in Google Maps
                  </a>
                )}
              </dd>
            </>
          )}
          {effectiveShowPaymentStatus && (
            <>
              <dt className="text-gray-500">Payment</dt>
              <dd>{appointment.paymentStatus}</dd>
            </>
          )}
        </dl>
      )}

      {!editing && effectiveShowColorKey && (
      <div className="mt-4 border-t border-primary-100 pt-3">
        <h3 className="mb-2 text-sm font-medium text-primary-700">Color key</h3>
        {canEdit ? (
          <select
            value={colorValue}
            onChange={(e) => {
              const next = e.target.value;
              if (next === NEW_TAG_VALUE) {
                setShowNewTagForm(true);
                return;
              }
              setColorValue(next);
              setShowNewTagForm(false);
              void saveColorValue(next);
            }}
            disabled={savingTag}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">No color key</option>
            <optgroup label="Built-in">
              {baseColorOptionsFor(entryMode).map((key) => (
                <option key={key} value={`${BASE_COLOR_VALUE_PREFIX}${key}`}>
                  {EVENT_COLOR_LABELS[key]}
                </option>
              ))}
            </optgroup>
            {visibleTags.length > 0 && (
              <optgroup label="Custom">
                {visibleTags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
            {canCreateTag && <option value={NEW_TAG_VALUE}>+ Add new color key</option>}
          </select>
        ) : appointment.tag ? (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: appointment.tag.color }} />
            {appointment.tag.name}
          </span>
        ) : appointment.colorKey && isEventColorKey(appointment.colorKey) ? (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colorTriples[appointment.colorKey].bg }}
            />
            {EVENT_COLOR_LABELS[appointment.colorKey]}
          </span>
        ) : (
          <span className="text-sm text-gray-400">No color key</span>
        )}

        {showNewTagForm && (
          <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white/60 p-3">
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              Name
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              Color
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className="h-8 w-14 rounded-md border border-gray-300"
              />
            </label>
            <button
              type="button"
              onClick={() => void createTag()}
              disabled={savingTag || !newTagName.trim()}
              className="rounded-md bg-primary-500 px-3 py-1 text-sm text-white hover:bg-primary-600 disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowNewTagForm(false)}
              className="text-xs text-gray-400 hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      )}

      {!editing && canViewEstimates && effectiveShowJobEstimate && (
        <div className="mt-4 border-t border-primary-100 pt-3">
          <h3 className="mb-2 text-sm font-medium text-primary-700">Job estimate</h3>
          {canEditEstimates ? (
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={includeEstimate}
                  onChange={(e) => setIncludeEstimate(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Include a job estimate
              </label>
              {includeEstimate && (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col text-xs text-gray-600">
                    Est. duration
                    <div className="flex gap-1">
                      <input
                        type="number"
                        min={0}
                        value={durationValue}
                        onChange={(e) => setDurationValue(e.target.value)}
                        className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                      <select
                        value={durationUnit}
                        onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      >
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </select>
                    </div>
                  </label>
                  <label className="flex flex-col text-xs text-gray-600">
                    Est. value ($)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                  </label>
                </div>
              )}
              <button
                onClick={saveEstimates}
                disabled={saving}
                className="self-start rounded-md bg-primary-500 px-3 py-1 text-sm text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save estimate"}
              </button>
            </div>
          ) : (
            <p className="text-sm">
              {formatDuration(appointment.estimatedDurationMinutes)} · $
              {appointment.estimatedValue ?? "—"}
            </p>
          )}
        </div>
      )}

      {!editing && canFindCoverage && appointment.status !== "CANCELLED" && (
        <div className="mt-4 border-t border-primary-100 pt-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-primary-700">Need this covered?</h3>
            <button
              onClick={findCoverage}
              disabled={coverageLoading}
              className="rounded-md border border-primary-300 px-3 py-1 text-xs text-primary-700 hover:bg-primary-50 disabled:opacity-50"
            >
              {coverageLoading ? "Searching..." : "Find coverage"}
            </button>
          </div>
          {coverageError && <p className="mt-2 text-sm text-red-600">{coverageError}</p>}
          {coverageCandidates && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {coverageCandidates.length === 0 ? (
                <li className="text-sm text-gray-500">No one is free for this slot.</li>
              ) : (
                coverageCandidates.map((c) => (
                  <li
                    key={c.staffId}
                    className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm"
                  >
                    <span>
                      {c.displayName}{" "}
                      <span className="text-xs text-gray-400">({c.hoursThisWeek}h this week)</span>
                    </span>
                    <button
                      onClick={() => assignCoverage(c.staffId)}
                      disabled={assigning !== null}
                      className="rounded-md bg-primary-500 px-2 py-1 text-xs text-white hover:bg-primary-600 disabled:opacity-50"
                    >
                      {assigning === c.staffId ? "Assigning..." : "Assign"}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      {!editing && canEdit && appointment.status !== "CANCELLED" && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            {appointment.status !== "COMPLETED" && (
              <button
                onClick={() => setOutcomeStatus("COMPLETED")}
                disabled={outcomeSaving}
                className="rounded-md border border-green-300 px-3 py-1 text-sm text-green-700 hover:bg-green-50 disabled:opacity-50"
              >
                Mark completed
              </button>
            )}
            {appointment.status !== "NO_SHOW" && (
              <button
                onClick={() => setOutcomeStatus("NO_SHOW")}
                disabled={outcomeSaving}
                className="rounded-md border border-amber-300 px-3 py-1 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                Mark no-show
              </button>
            )}
            {(appointment.status === "COMPLETED" || appointment.status === "NO_SHOW") && (
              <button
                onClick={() => setOutcomeStatus("BOOKED")}
                disabled={outcomeSaving}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Revert to booked
              </button>
            )}
          </div>
          {outcomeError && <p className="mt-1 text-sm text-red-600">{outcomeError}</p>}
        </div>
      )}

      {!editing && (canCancel || canDelete) && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            {canCancel && appointment.status !== "CANCELLED" && (
              <button
                onClick={cancelAppointment}
                disabled={lifecycleSaving}
                className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Cancel {entryNoun}
              </button>
            )}
            {canCancel && appointment.status === "CANCELLED" && (
              <button
                onClick={restoreAppointment}
                disabled={lifecycleSaving}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Restore {entryNoun}
              </button>
            )}
            {canDelete && (
              <button
                onClick={deleteAppointment}
                disabled={lifecycleSaving}
                className="rounded-md bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                Delete {entryNoun}
              </button>
            )}
          </div>
          {lifecycleError && <p className="mt-1 text-sm text-red-600">{lifecycleError}</p>}
        </div>
      )}
    </div>
  );
}

const NEW_STAFF_VALUE = "__new_staff__";
const NEW_TAG_VALUE = "__new_tag__";

/** Thin red "(optional)" suffix for a create-form field label. */
function OptionalTag() {
  return <span className="font-light text-red-400"> (optional)</span>;
}

/**
 * The "This is a..." pill row at the top of the create form - shared between
 * CreateEntryPanel and CustomEventPanel so switching types (Appointment/
 * Shift/a named custom calendar/the generic "Custom event" quick-create)
 * works identically no matter which form is currently open. Self-gates to
 * nothing when there's only one modeOption and no quick-custom option -
 * nothing to choose, matches a fixed-kind page's old single-button behavior.
 */
function EntryTypeSwitcher({
  mode,
  customCalendarId,
  quickCustom,
  modeOptions,
  quickCustomAvailable,
  onModeSelect,
  onQuickCustomSelect,
}: {
  mode: EntryMode;
  customCalendarId?: string;
  quickCustom: boolean;
  modeOptions: Array<{ mode: EntryMode; customCalendarId?: string; label: string }>;
  quickCustomAvailable: boolean;
  onModeSelect: (option: { mode: EntryMode; customCalendarId?: string }) => void;
  onQuickCustomSelect: () => void;
}) {
  if (modeOptions.length <= 1 && !quickCustomAvailable) return null;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-gray-500">This is a...</span>
      <div className="flex flex-wrap gap-1.5">
        {modeOptions.map((opt) => {
          const active = !quickCustom && opt.mode === mode && opt.customCalendarId === customCalendarId;
          return (
            <button
              key={`${opt.mode}:${opt.customCalendarId ?? ""}`}
              type="button"
              onClick={() => onModeSelect(opt)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? opt.mode === "shift"
                    ? "bg-shift-500 text-white"
                    : opt.mode === "custom"
                      ? "bg-gray-600 text-white"
                      : "bg-primary-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
        {/* The generic quick-create path - not tied to any named custom
            calendar, files as a normal SHIFT/APPOINTMENT row with a
            free-text title instead (see Appointment.customTitle). Always
            offered (regardless of calendarKind/page) as long as the viewer
            can create either kind - a custom event "applies to either
            calendar," so it isn't scoped to whichever page happened to open
            this form. */}
        {quickCustomAvailable && (
          <button
            type="button"
            onClick={onQuickCustomSelect}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              quickCustom ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Custom event
          </button>
        )}
      </div>
    </div>
  );
}

function CreateEntryPanel({
  start: startTime,
  end: endTime,
  mode,
  customCalendarId,
  defaultStaffId,
  modeOptions,
  onModeSelect,
  quickCustomAvailable,
  onQuickCustomSelect,
  presetOptions,
  onPresetSelect,
  onRangeChange,
  staff,
  serviceTypes,
  clients,
  tags,
  roles,
  requireClient,
  showJobType,
  showJobEstimate,
  showColorKey,
  customSettings,
  canEditEstimates,
  canCreateStaff,
  canCreateClient,
  canCreateTag,
  onStaffCreated,
  onClientCreated,
  onTagCreated,
  onClose,
  onCreated,
}: {
  start: Date;
  end: Date;
  mode: EntryMode;
  // Only meaningful when mode === "custom" - which of the tenant's named
  // custom calendars this entry is being created on.
  customCalendarId?: string;
  // Set when the slot that opened this panel was selected inside a specific
  // staff member's column ("Group by staff" Day view) - preselects that
  // staff member instead of defaulting to the first one in the list.
  defaultStaffId?: string;
  // Every kind/calendar the viewer could create as - rendered as a type
  // switcher at the top of the form when there's more than one (i.e. on the
  // combined "All" calendar; a fixed-kind page always has exactly one, so
  // nothing renders there). Picking a different one calls onModeSelect,
  // which the parent handles by updating `creating` and remounting this
  // panel (see the `key` at the call site) with the new mode/customCalendarId.
  modeOptions: Array<{ mode: EntryMode; customCalendarId?: string; label: string }>;
  onModeSelect: (option: { mode: EntryMode; customCalendarId?: string }) => void;
  // Whether the "Custom event" pill (generic quick-create, not tied to a
  // named custom calendar - see CustomEventPanel) should show in the type
  // switcher. Always true if the viewer can create either an appointment or
  // a shift, regardless of modeOptions/calendarKind.
  quickCustomAvailable: boolean;
  onQuickCustomSelect: () => void;
  // Admin-defined quick-fill templates (Settings > Calendars > "Preset
  // events"), already narrowed to ones this viewer could use on this page -
  // see presetOptions in the parent. Empty when the tenant hasn't created
  // any, in which case nothing renders here.
  presetOptions: EventPresetOption[];
  onPresetSelect: (preset: EventPresetOption) => void;
  // Lifted to the parent (rather than local state seeded from a one-time
  // `slot` prop) so dragging/resizing the draft event on the calendar and
  // editing these datetime inputs both read/write the same value and stay
  // in sync with each other.
  onRangeChange: (start: Date, end: Date) => void;
  staff: StaffOption[];
  serviceTypes: ServiceTypeOption[];
  clients: ClientOption[];
  tags: TagOption[];
  roles: TenantRoleOption[];
  // Admin-configurable per tenant (Settings > "Appointment & shift
  // form") - whether an appointment must have a client attached. Never
  // applies to mode === "shift", which has no client field at all. Custom
  // entries use customSettings.requireClient instead.
  requireClient: boolean;
  // Admin-configurable (Settings > "Shift form") - only applies when
  // mode === "shift"; the appointment form always shows these. Custom
  // entries use customSettings' equivalents instead.
  showJobType: boolean;
  showJobEstimate: boolean;
  showColorKey: boolean;
  // Admin-configurable (Settings > Calendars > "Custom form") - only
  // consulted when mode === "custom".
  customSettings: {
    showClient: boolean;
    requireClient: boolean;
    showJobType: boolean;
    showJobEstimate: boolean;
    showColorKey: boolean;
    showPaymentStatus: boolean;
  };
  canEditEstimates: boolean;
  canCreateStaff: boolean;
  canCreateClient: boolean;
  canCreateTag: boolean;
  onStaffCreated: () => void;
  onClientCreated: () => void;
  onTagCreated: () => void;
  onClose: () => void;
  onCreated: () => void;
}) {
  // null = no explicit choice made yet, so the effective value below keeps
  // tracking defaultStaffId/staff as they arrive. `staff` is fetched async
  // by the parent and can still be empty on this panel's first render
  // (opening the form right after a page load, before GET /api/staff
  // resolves) - computing the effective id fresh on every render (instead
  // of baking a fallback into useState's one-time initializer) means it
  // keeps up once the real list arrives, with no risk of getting stuck.
  const [staffId, setStaffId] = useState<string | null>(null);
  const effectiveStaffId = staffId ?? defaultStaffId ?? staff[0]?.id ?? (canCreateStaff ? NEW_STAFF_VALUE : "");
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffUsername, setNewStaffUsername] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newStaffRoleId, setNewStaffRoleId] = useState(() => roles[0]?.id ?? "");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const visibleTags = tagsForMode(tags, mode);
  // Resolves each shift-only toggle against the right settings source for
  // this panel's mode, same resolution AppointmentDetailPanel uses.
  const effectiveShowClient = mode === "appointment" ? true : mode === "custom" ? customSettings.showClient : false;
  const effectiveRequireClient = mode === "appointment" ? requireClient : customSettings.requireClient;
  const effectiveShowJobType = mode === "shift" ? showJobType : mode === "custom" ? customSettings.showJobType : true;
  const effectiveShowJobEstimate =
    mode === "shift" ? showJobEstimate : mode === "custom" ? customSettings.showJobEstimate : true;
  const effectiveShowColorKey = mode === "shift" ? showColorKey : mode === "custom" ? customSettings.showColorKey : true;
  const [colorValue, setColorValue] = useState("");
  const [showNewTagForm, setShowNewTagForm] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#2563eb");

  // Client combobox: `clientQuery` is both the search text and (once
  // `showNewClientForm` is true) the new client's name - whatever was typed
  // while searching is almost always what you'd type as the name anyway.
  const [clientQuery, setClientQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientAddress, setNewClientAddress] = useState("");
  const [newClientConfirmAddress, setNewClientConfirmAddress] = useState("");
  const clientBoxRef = useRef<HTMLDivElement>(null);

  const [locationType, setLocationType] = useState<"IN_PERSON" | "ONLINE">("IN_PERSON");
  const [location, setLocation] = useState("");
  const [includeEstimate, setIncludeEstimate] = useState(false);
  const [durationValue, setDurationValue] = useState("");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("hours");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A real double-booking (409, from the DB's EXCLUDE constraint) gets its
  // own prominent banner at the top of the panel instead of just the small
  // red line near the submit button - easy to miss, especially once the
  // panel has grown tall (new-client form open, estimates showing, etc).
  const [conflict, setConflict] = useState(false);
  const conflictBannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conflict) conflictBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [conflict]);

  useEffect(() => {
    if (!clientDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (clientBoxRef.current && !clientBoxRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [clientDropdownOpen]);

  // Filters as each letter is typed - client-side, same pattern as the
  // staff/service-type dropdowns, since a tenant's client list is small
  // enough to load in full up front.
  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    const list = q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
    return list.slice(0, 8);
  }, [clients, clientQuery]);

  function selectClient(c: ClientOption) {
    setSelectedClientId(c.id);
    setClientQuery(c.name);
    setClientDropdownOpen(false);
    setShowNewClientForm(false);
  }

  function openNewClientForm() {
    setSelectedClientId("");
    setShowNewClientForm(true);
    setClientDropdownOpen(false);
  }

  function fail(message: string) {
    setError(message);
    setConflict(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveStaffId) {
      fail("Pick a staff member.");
      return;
    }
    if (
      effectiveStaffId === NEW_STAFF_VALUE &&
      (!newStaffName.trim() ||
        !newStaffEmail.trim() ||
        !newStaffUsername.trim() ||
        !newStaffPassword ||
        !newStaffRoleId)
    ) {
      fail("Fill in the new staff member's name, email, username, password, and role.");
      return;
    }
    if (endTime <= startTime) {
      fail("End time must be after start time.");
      return;
    }
    if (effectiveShowClient) {
      if (showNewClientForm) {
        if (!clientQuery.trim()) {
          fail("Enter the new client's name.");
          return;
        }
        if (newClientAddress.trim() && newClientAddress.trim() !== newClientConfirmAddress.trim()) {
          fail("Address and confirm address don't match.");
          return;
        }
      } else if (effectiveRequireClient && !selectedClientId) {
        fail("Pick a client, or add a new one.");
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    setConflict(false);
    try {
      let resolvedStaffId = effectiveStaffId;
      if (effectiveStaffId === NEW_STAFF_VALUE) {
        const { staff: newStaff } = await fetchJson<{ staff: { id: string } }>("/api/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: newStaffName.trim(),
            email: newStaffEmail.trim(),
            username: newStaffUsername.trim(),
            password: newStaffPassword,
            roleId: newStaffRoleId,
          }),
        });
        resolvedStaffId = newStaff.id;
        onStaffCreated();
      }

      let resolvedTagId: string | null = null;
      let resolvedColorKey: string | null = null;
      if (colorValue === NEW_TAG_VALUE) {
        if (newTagName.trim()) {
          const { tag } = await fetchJson<{ tag: { id: string } }>("/api/event-tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: newTagName.trim(),
              color: newTagColor,
              appliesTo: mode === "shift" ? "SHIFT" : mode === "custom" ? "BOTH" : "APPOINTMENT",
            }),
          });
          resolvedTagId = tag.id;
          onTagCreated();
        }
      } else {
        ({ tagId: resolvedTagId, colorKey: resolvedColorKey } = parseColorValue(colorValue));
      }

      let clientId: string | null = null;
      if (effectiveShowClient && showNewClientForm) {
        const { client } = await fetchJson<{ client: { id: string } }>("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: clientQuery.trim(),
            email: newClientEmail.trim(),
            phone: newClientPhone.trim(),
            address: newClientAddress.trim(),
          }),
        });
        clientId = client.id;
        onClientCreated();
      } else if (effectiveShowClient && selectedClientId) {
        clientId = selectedClientId;
      }

      await fetchJson("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryKind: mode === "shift" ? "SHIFT" : mode === "custom" ? "CUSTOM" : "APPOINTMENT",
          customCalendarId: mode === "custom" ? customCalendarId : undefined,
          staffId: resolvedStaffId,
          clientId,
          serviceTypeId: serviceTypeId || null,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          estimatedDurationMinutes:
            canEditEstimates && includeEstimate ? durationToMinutes(durationValue, durationUnit) : null,
          estimatedValue: canEditEstimates && includeEstimate && estimatedValue ? Number(estimatedValue) : null,
          locationType,
          location: location.trim() || null,
          tagId: resolvedTagId,
          colorKey: resolvedColorKey,
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Couldn't create ${mode === "custom" ? "entry" : mode}.`);
      setConflict(err instanceof ApiError && err.status === 409);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex flex-col gap-3 rounded-xl border p-5 shadow-sm ${
        mode === "shift"
          ? "border-shift-100 bg-linear-to-br from-shift-50 to-white"
          : mode === "custom"
            ? "border-gray-200 bg-linear-to-br from-gray-50 to-white"
            : "border-primary-100 bg-linear-to-br from-primary-50 to-white"
      }`}
    >
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-medium">
          {mode === "shift"
            ? "New shift"
            : mode === "custom"
              ? `New ${modeOptions.find((o) => o.mode === "custom" && o.customCalendarId === customCalendarId)?.label ?? "custom"} entry`
              : "New appointment"}
        </h2>
        <button type="button" onClick={onClose} className="text-sm font-medium text-[#BD3039] hover:underline">
          Cancel
        </button>
      </div>

      <EntryTypeSwitcher
        mode={mode}
        customCalendarId={customCalendarId}
        quickCustom={false}
        modeOptions={modeOptions}
        quickCustomAvailable={quickCustomAvailable}
        onModeSelect={onModeSelect}
        onQuickCustomSelect={onQuickCustomSelect}
      />

      {/* Admin-defined quick-fill templates (Settings > Calendars > "Preset
          events") - picking one sets the type above and the end time below
          in one step. Nothing renders here for a tenant that hasn't created
          any. */}
      {presetOptions.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-gray-500">Presets</span>
          <div className="flex flex-wrap gap-1.5">
            {presetOptions.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onPresetSelect(preset)}
                className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
              >
                {preset.label} <span className="text-gray-400">· {preset.durationMinutes}m</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {conflict && (
        <div
          ref={conflictBannerRef}
          role="alert"
          className="flex items-start gap-3 rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 shadow-sm"
        >
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
            !
          </span>
          <div>
            <p className="text-sm font-semibold text-red-800">Scheduling conflict</p>
            <p className="mt-0.5 text-sm text-red-700">{error}</p>
            <p className="mt-1 text-xs text-red-600">
              Adjust the start/end time or pick a different staff member, then try again.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Start
          <input
            type="datetime-local"
            value={toInputValue(startTime)}
            onChange={(e) => e.target.value && onRangeChange(new Date(e.target.value), endTime)}
            className="rounded-md border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          End
          <input
            type="datetime-local"
            value={toInputValue(endTime)}
            onChange={(e) => e.target.value && onRangeChange(startTime, new Date(e.target.value))}
            className="rounded-md border border-gray-300 px-2 py-1"
          />
        </label>
      </div>

      <label className="flex w-full max-w-xs flex-col gap-1 text-sm">
        Staff
        <select
          value={effectiveStaffId}
          onChange={(e) => setStaffId(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-2 py-1"
        >
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
          {canCreateStaff && <option value={NEW_STAFF_VALUE}>+ Add new staff member</option>}
        </select>
      </label>

      {effectiveStaffId === NEW_STAFF_VALUE && (
        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white/60 p-3">
          <p className="text-xs font-medium text-gray-500">New staff member</p>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Name
              <input
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Email
              <input
                type="email"
                value={newStaffEmail}
                onChange={(e) => setNewStaffEmail(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Username
              <input
                value={newStaffUsername}
                onChange={(e) => setNewStaffUsername(e.target.value)}
                minLength={3}
                maxLength={30}
                pattern="[a-z0-9]+([_-][a-z0-9]+)*"
                title="Lowercase letters, numbers, - and _ only"
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Password
              <input
                type="password"
                value={newStaffPassword}
                onChange={(e) => setNewStaffPassword(e.target.value)}
                minLength={8}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Role
              <select
                value={newStaffRoleId}
                onChange={(e) => setNewStaffRoleId(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {effectiveShowJobType && (
      <label className="flex w-full max-w-xs flex-col gap-1 text-sm">
        <span>
          {mode === "appointment" ? "Service" : "Job type"}
          <OptionalTag />
        </span>
        <select
          value={serviceTypeId}
          onChange={(e) => setServiceTypeId(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-2 py-1"
        >
          <option value="">—</option>
          {serviceTypes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      )}

      {effectiveShowColorKey && (
      <label className="flex w-full max-w-xs flex-col gap-1 text-sm">
        <span>
          Color key
          <OptionalTag />
        </span>
        <select
          value={colorValue}
          onChange={(e) => {
            const next = e.target.value;
            setColorValue(next);
            setShowNewTagForm(next === NEW_TAG_VALUE);
          }}
          className="w-full rounded-md border border-gray-300 px-2 py-1"
        >
          <option value="">—</option>
          <optgroup label="Built-in">
            {baseColorOptionsFor(mode).map((key) => (
              <option key={key} value={`${BASE_COLOR_VALUE_PREFIX}${key}`}>
                {EVENT_COLOR_LABELS[key]}
              </option>
            ))}
          </optgroup>
          {visibleTags.length > 0 && (
            <optgroup label="Custom">
              {visibleTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
          {canCreateTag && <option value={NEW_TAG_VALUE}>+ Add new color key</option>}
        </select>
      </label>
      )}

      {effectiveShowColorKey && showNewTagForm && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white/60 p-3">
          <label className="flex flex-col gap-1 text-sm">
            Color key name
            <input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Color
            <input
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              className="h-8 w-14 rounded-md border border-gray-300"
            />
          </label>
        </div>
      )}

      {effectiveShowClient && (
        <div ref={clientBoxRef} className="relative flex w-full max-w-xs flex-col gap-1 text-sm">
          <span>
            Client
            {!effectiveRequireClient && <OptionalTag />}
          </span>
          <input
            value={clientQuery}
            onChange={(e) => {
              setClientQuery(e.target.value);
              setSelectedClientId("");
              setShowNewClientForm(false);
              setClientDropdownOpen(true);
            }}
            onFocus={() => setClientDropdownOpen(true)}
            placeholder="Search clients by name..."
            autoComplete="off"
            className="w-full rounded-md border border-gray-300 px-2 py-1"
          />
          {selectedClientId && (
            <p className="text-xs text-primary-700">Selected: {clientQuery}</p>
          )}

          {clientDropdownOpen && !showNewClientForm && (
            <div className="absolute top-full left-0 z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
              {filteredClients.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">No matching clients.</p>
              )}
              {filteredClients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectClient(c)}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-primary-50"
                >
                  {c.name}
                  {c.phone ? <span className="text-gray-400"> · {c.phone}</span> : null}
                </button>
              ))}
              {canCreateClient && (
                <button
                  type="button"
                  onClick={openNewClientForm}
                  className="block w-full border-t border-gray-100 px-3 py-1.5 text-left text-sm font-medium text-primary-700 hover:bg-primary-50"
                >
                  + Add new client{clientQuery.trim() ? ` "${clientQuery.trim()}"` : ""}
                </button>
              )}
            </div>
          )}

          {showNewClientForm && (
            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white/60 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">New client</p>
                <button
                  type="button"
                  onClick={() => setShowNewClientForm(false)}
                  className="text-xs text-gray-400 hover:underline"
                >
                  Cancel
                </button>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                Name
                <input
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-1"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span>
                    Email
                    <OptionalTag />
                  </span>
                  <input
                    type="email"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>
                    Phone
                    <OptionalTag />
                  </span>
                  <input
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-1"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span>
                  Address
                  <OptionalTag />
                </span>
                <input
                  value={newClientAddress}
                  onChange={(e) => setNewClientAddress(e.target.value)}
                  placeholder="123 Main St"
                  className="rounded-md border border-gray-300 px-2 py-1"
                />
              </label>
              {newClientAddress.trim() && (
                <label className="flex flex-col gap-1 text-sm">
                  Confirm address
                  <input
                    value={newClientConfirmAddress}
                    onChange={(e) => setNewClientConfirmAddress(e.target.value)}
                    placeholder="Re-enter the address above"
                    className={`rounded-md border px-2 py-1 ${
                      newClientConfirmAddress && newClientConfirmAddress.trim() !== newClientAddress.trim()
                        ? "border-red-300"
                        : "border-gray-300"
                    }`}
                  />
                </label>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1 text-sm">
        Meeting
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setLocationType("IN_PERSON")}
            className={`rounded-md border px-3 py-1 text-sm transition-colors ${
              locationType === "IN_PERSON"
                ? "border-primary-500 bg-primary-50 text-primary-700"
                : "border-gray-300 text-gray-600 hover:border-primary-300"
            }`}
          >
            In person
          </button>
          <button
            type="button"
            onClick={() => setLocationType("ONLINE")}
            className={`rounded-md border px-3 py-1 text-sm transition-colors ${
              locationType === "ONLINE"
                ? "border-primary-500 bg-primary-50 text-primary-700"
                : "border-gray-300 text-gray-600 hover:border-primary-300"
            }`}
          >
            Online
          </button>
        </div>
      </div>

      <label className="flex w-full max-w-sm flex-col gap-1 text-sm">
        <span>
          {locationType === "ONLINE" ? "Meeting link" : "Address"}
          {locationType !== "ONLINE" && <OptionalTag />}
        </span>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={locationType === "ONLINE" ? "https://..." : "123 Main St"}
          className="w-full rounded-md border border-gray-300 px-2 py-1"
        />
      </label>

      {canEditEstimates && effectiveShowJobEstimate && (
        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white/60 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={includeEstimate}
              onChange={(e) => setIncludeEstimate(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Include a job estimate
          </label>
          {includeEstimate && (
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Est. duration
                <div className="flex gap-1">
                  <input
                    type="number"
                    min={0}
                    value={durationValue}
                    onChange={(e) => setDurationValue(e.target.value)}
                    className="w-20 rounded-md border border-gray-300 px-2 py-1"
                  />
                  <select
                    value={durationUnit}
                    onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Est. value ($)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={estimatedValue}
                  onChange={(e) => setEstimatedValue(e.target.value)}
                  className="w-28 rounded-md border border-gray-300 px-2 py-1"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {error && !conflict && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className={`self-start rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 disabled:opacity-50 ${
          mode === "shift"
            ? "bg-shift-500 hover:bg-[radial-gradient(circle_at_center,var(--color-shift-500)_0%,var(--color-shift-700)_100%)] hover:shadow-md"
            : mode === "custom"
              ? "bg-gray-600 hover:bg-[radial-gradient(circle_at_center,#4b5563_0%,#1f2937_100%)] hover:shadow-md"
              : "bg-primary-500 hover:bg-[radial-gradient(circle_at_center,var(--color-primary-500)_0%,var(--color-primary-700)_100%)] hover:shadow-md"
        }`}
      >
        {submitting
          ? "Creating..."
          : mode === "shift"
            ? "Create shift"
            : mode === "custom"
              ? "Create custom entry"
              : "Create appointment"}
      </button>
    </form>
  );
}

/**
 * The generic "Custom event" quick-create (see Appointment.customTitle) -
 * deliberately a separate, much smaller form from CreateEntryPanel rather
 * than one more conditional branch inside it: a quick personal/misc entry
 * ("Lunch outing," "Doctor's appointment") doesn't want a client picker,
 * job-type dropdown, payment fields, or any of the rest of the full
 * appointment/shift form - just a title, who it's for, when, and which
 * calendar (Appointments or Shifts) it should show up on. Still saves as a
 * perfectly normal Appointment row (entryKind SHIFT or APPOINTMENT) - there
 * is no third "custom" entryKind or calendar involved here at all (that's
 * the separate, heavier named-CustomCalendar feature).
 */
function CustomEventPanel({
  start: startTime,
  end: endTime,
  mode,
  defaultStaffId,
  modeOptions,
  onModeSelect,
  onFileUnderChange,
  canCreateAppointment,
  canCreateShift,
  onRangeChange,
  staff,
  onClose,
  onCreated,
}: {
  start: Date;
  end: Date;
  // Which calendar this quick event currently files under - "custom" is
  // never a valid value here (see the component doc comment above).
  mode: "appointment" | "shift";
  defaultStaffId?: string;
  // Passed through to the shared EntryTypeSwitcher so the viewer can jump
  // straight to the full Appointment/Shift/named-calendar form instead -
  // onModeSelect there always means "leave quick-custom mode entirely"
  // (handled by the parent), distinct from onFileUnderChange below.
  modeOptions: Array<{ mode: EntryMode; customCalendarId?: string; label: string }>;
  onModeSelect: (option: { mode: EntryMode; customCalendarId?: string }) => void;
  // Changes which calendar this entry files under *without* leaving
  // quick-custom mode - a small toggle local to this form, distinct from
  // the main type switcher's onModeSelect.
  onFileUnderChange: (mode: "appointment" | "shift") => void;
  canCreateAppointment: boolean;
  canCreateShift: boolean;
  onRangeChange: (start: Date, end: Date) => void;
  staff: StaffOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  // Same "staff can still be empty on first render" reasoning as
  // CreateEntryPanel's effectiveStaffId - computed fresh each render rather
  // than baked into useState's one-time initializer.
  const [staffId, setStaffId] = useState<string | null>(null);
  const effectiveStaffId = staffId ?? defaultStaffId ?? staff[0]?.id ?? "";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give this event a title.");
      return;
    }
    if (!effectiveStaffId) {
      setError("Pick who this is for.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setConflict(false);
    try {
      await fetchJson("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryKind: mode === "shift" ? "SHIFT" : "APPOINTMENT",
          customTitle: title.trim(),
          staffId: effectiveStaffId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create event.");
      setConflict(err instanceof ApiError && err.status === 409);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-gray-300 bg-linear-to-br from-gray-50 to-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-medium">New custom event</h2>
        <button type="button" onClick={onClose} className="text-sm font-medium text-[#BD3039] hover:underline">
          Cancel
        </button>
      </div>

      <EntryTypeSwitcher
        mode={mode}
        quickCustom
        modeOptions={modeOptions}
        quickCustomAvailable
        onModeSelect={onModeSelect}
        onQuickCustomSelect={() => {}}
      />

      <label className="flex w-full max-w-sm flex-col gap-1 text-sm">
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Lunch outing"
          maxLength={200}
          className="rounded-md border border-gray-300 px-2 py-1"
        />
      </label>

      {canCreateAppointment && canCreateShift && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-gray-500">File under</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onFileUnderChange("appointment")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                mode === "appointment" ? "bg-primary-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Appointments calendar
            </button>
            <button
              type="button"
              onClick={() => onFileUnderChange("shift")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                mode === "shift" ? "bg-shift-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Shifts calendar
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Start
          <input
            type="datetime-local"
            value={toInputValue(startTime)}
            onChange={(e) => e.target.value && onRangeChange(new Date(e.target.value), endTime)}
            className="rounded-md border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          End
          <input
            type="datetime-local"
            value={toInputValue(endTime)}
            onChange={(e) => e.target.value && onRangeChange(startTime, new Date(e.target.value))}
            className="rounded-md border border-gray-300 px-2 py-1"
          />
        </label>
      </div>

      <label className="flex w-full max-w-xs flex-col gap-1 text-sm">
        Staff
        <select
          value={effectiveStaffId}
          onChange={(e) => setStaffId(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-2 py-1"
        >
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
      </label>

      {conflict && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 shadow-sm">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
            !
          </span>
          <div>
            <p className="text-sm font-semibold text-red-800">Scheduling conflict</p>
            <p className="mt-0.5 text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}
      {error && !conflict && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-gray-800 disabled:opacity-50"
      >
        {submitting ? "Creating..." : "Create event"}
      </button>
    </form>
  );
}
