"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  type SlotInfo,
  type View,
  type ToolbarProps,
} from "react-big-calendar";
import withDragAndDrop, { type EventInteractionArgs } from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import type { PermissionKey } from "@/lib/permissions/catalog";
import { featuresForTier } from "@/lib/licensing/features";
import type { LicenseTier } from "@/generated/prisma/client";
import {
  DEFAULT_EVENT_COLORS,
  EVENT_COLOR_LABELS,
  buildColorTriples,
  resolveEventColor,
  resolveEventColors,
  type ColorTriple,
  type EventColorKey,
} from "@/lib/colors/eventColors";
import { getCustomHolidaysInRange, getFederalHolidaysInRange, type ComputedHoliday } from "@/lib/holidays/federal";

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

const DnDCalendar = withDragAndDrop<CalendarEvent, object>(Calendar);

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Custom toolbar replacing react-big-calendar's default one, so the current
 * month/year label can be clicked to jump straight to an arbitrary month and
 * year instead of only stepping one view at a time via Back/Next. Calling
 * onNavigate("DATE", target) here goes through the same chain as the
 * library's own Back/Next/Today buttons, which bubbles up to the controlled
 * currentDate/currentView state in SchedulingCalendar.
 */
function CalendarToolbar({
  date,
  view,
  views,
  label,
  onNavigate,
  onView,
}: ToolbarProps<CalendarEvent, object>) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(date.getMonth());
  const [pickerYear, setPickerYear] = useState(date.getFullYear());
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerOpen]);

  function openPicker() {
    setPickerMonth(date.getMonth());
    setPickerYear(date.getFullYear());
    setPickerOpen(true);
  }

  function goToPicked() {
    onNavigate("DATE", new Date(pickerYear, pickerMonth, 1));
    setPickerOpen(false);
  }

  const viewList = Array.isArray(views) ? views : (Object.keys(views) as View[]);

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex gap-1 rounded-full bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => onNavigate("TODAY")}
          className="rounded-full px-4 py-1.5 text-xs font-bold tracking-wide text-gray-600 uppercase transition-all duration-150 hover:bg-white hover:text-primary-600 hover:shadow-sm"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => onNavigate("PREV")}
          className="rounded-full px-4 py-1.5 text-xs font-bold tracking-wide text-gray-600 uppercase transition-all duration-150 hover:bg-white hover:text-primary-600 hover:shadow-sm"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => onNavigate("NEXT")}
          className="rounded-full px-4 py-1.5 text-xs font-bold tracking-wide text-gray-600 uppercase transition-all duration-150 hover:bg-white hover:text-primary-600 hover:shadow-sm"
        >
          Next
        </button>
      </div>

      <div className="relative inline-block">
        <button
          type="button"
          onClick={openPicker}
          className="cursor-pointer rounded-full px-3 py-1 text-lg font-bold tracking-wide text-gray-900 uppercase transition-colors duration-150 hover:text-primary-600"
          title="Click to jump to a specific month and year"
        >
          {label}
        </button>
        {pickerOpen && (
          <div
            ref={popoverRef}
            className="absolute top-full left-1/2 z-20 mt-1 flex -translate-x-1/2 flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
          >
            <div className="flex gap-2">
              <select
                value={pickerMonth}
                onChange={(e) => setPickerMonth(Number(e.target.value))}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm font-normal normal-case"
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={pickerYear}
                onChange={(e) => setPickerYear(Number(e.target.value))}
                className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm font-normal"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-md px-2 py-1 text-xs font-normal normal-case text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={goToPicked}
                className="rounded-md bg-primary-500 px-2 py-1 text-xs font-normal normal-case text-white hover:bg-primary-600"
              >
                Go
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="inline-flex gap-1 rounded-full bg-gray-100 p-1">
        {viewList.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold tracking-wide uppercase transition-all duration-150 ${
              v === view
                ? "bg-primary-500 text-white shadow-sm"
                : "text-gray-600 hover:bg-white hover:text-primary-600 hover:shadow-sm"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

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

type EntryMode = "appointment" | "shift";

/** Thin `ApiAppointment`-shaped wrapper around the shared `resolveEventColor` helper. */
function resolveAppointmentColor(
  appt: ApiAppointment,
  colors: Record<EventColorKey, ColorTriple>
): ColorTriple {
  return resolveEventColor({ status: appt.status, isShift: isShift(appt), tagColor: appt.tag?.color }, colors);
}

const BASE_LEGEND_KEYS: EventColorKey[] = ["appointment", "shift", "completed", "noShow", "cancelled"];

export interface StaffOption {
  id: string;
  displayName: string;
}
export interface TenantRoleOption {
  id: string;
  name: string;
}
interface ServiceTypeOption {
  id: string;
  name: string;
  durationMinutes: number;
  price: string | null;
}
interface ClientOption {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}
export interface TagOption {
  id: string;
  name: string;
  color: string;
}
export interface HolidayOption {
  id: string;
  name: string;
  date: string;
  recurring: boolean;
}
export interface ApiAppointment {
  id: string;
  staffId: string;
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
  client: ClientOption | null;
  serviceType: ServiceTypeOption | null;
  staff: StaffOption;
}
interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: ApiAppointment;
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
const DRAFT_EVENT_ID = "__draft__";
const DRAFT_RESOURCE: ApiAppointment = {
  id: DRAFT_EVENT_ID,
  staffId: "",
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
  client: null,
  serviceType: null,
  staff: { id: "", displayName: "" },
};

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

export function isShift(appt: ApiAppointment): boolean {
  return !appt.clientId;
}

/** Shared with RosterView.tsx, which renders the same chip label without the "(staff name)" suffix - each chip already sits under that staff member's row. */
export function appointmentTitle(appt: ApiAppointment): string {
  return isShift(appt)
    ? `Shift${appt.serviceType ? ` – ${appt.serviceType.name}` : ""}`
    : `${appt.client?.name ?? "Client"}${appt.serviceType ? ` – ${appt.serviceType.name}` : ""}`;
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

function toEvent(appt: ApiAppointment): CalendarEvent {
  const title = isShift(appt)
    ? `${appointmentTitle(appt)} (${appt.staff.displayName})`
    : appointmentTitle(appt);
  return {
    id: appt.id,
    title,
    start: new Date(appt.startTime),
    end: new Date(appt.endTime),
    resource: appt,
  };
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

export function SchedulingCalendar({
  readOnly = false,
  licenseTier = "BOTH",
  initialStaffId,
  initialCalendarType,
  canToggleCalendarType = true,
}: {
  readOnly?: boolean;
  licenseTier?: LicenseTier;
  // Preselects the staff filter - used by the roster drill-down view's
  // "View full calendar" link (?staff=<id>) so landing here already shows
  // just that one employee instead of "All staff".
  initialStaffId?: string;
  // Preselects the appointment/shift filter - used by deep links
  // (?type=appointment or ?type=shift) so landing here already shows just
  // that type instead of "Both". Ignored (falls through to the tier-based
  // default below) if the tenant's license doesn't actually include that
  // type.
  initialCalendarType?: "appointment" | "shift";
  // Settings > Permissions > VIEW_CALENDAR_TOGGLE - whether this role can see
  // and use the Appointments/Shifts/Both switcher at all. Defaults to true
  // so the always-permission-agnostic /calendar/view route (and any other
  // caller that doesn't pass it) keeps today's behavior; the main /calendar
  // page explicitly computes and passes the real per-role value.
  canToggleCalendarType?: boolean;
} = {}) {
  const features = useMemo(() => featuresForTier(licenseTier), [licenseTier]);
  // Default to whichever single calendar the tier actually includes; only
  // tenants on BOTH get a real choice to make (and the switcher UI only
  // renders for them - there's nothing to switch between otherwise).
  const [calendarType, setCalendarType] = useState<"appointment" | "shift" | "both">(() => {
    if (initialCalendarType === "appointment" && features.appointmentManager) return "appointment";
    if (initialCalendarType === "shift" && features.shiftManagement) return "shift";
    return features.appointmentManager && features.shiftManagement
      ? "both"
      : features.shiftManagement
        ? "shift"
        : "appointment";
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean> | null>(null);
  // Admin-configurable (Settings > "Appointment & shift form") - whether
  // the create-appointment form must have a client attached. Defaults to
  // true (the previous, implicit behavior) until the real value loads.
  const [requireClientForAppointments, setRequireClientForAppointments] = useState(true);
  // Same settings section - whether the detail panel shows an "Open in
  // Google Maps" button next to an in-person appointment's address.
  const [enableMapsNavigation, setEnableMapsNavigation] = useState(true);
  // Tenant-personalized event colors (Settings > "Event colors") -
  // defaults to the original hardcoded palette until the real value loads.
  const [colorTriples, setColorTriples] = useState<Record<EventColorKey, ColorTriple>>(() =>
    buildColorTriples(DEFAULT_EVENT_COLORS)
  );
  const [showFederalHolidays, setShowFederalHolidays] = useState(true);
  // Admin-configurable (Settings > "Shift form") - whether the shift
  // create/detail forms show these fields at all. Never applies to
  // mode === "appointment", which has its own always-shown equivalents.
  const [showJobTypeOnShiftForm, setShowJobTypeOnShiftForm] = useState(true);
  const [showJobEstimateOnShiftForm, setShowJobEstimateOnShiftForm] = useState(true);
  const [showColorKeyOnShiftForm, setShowColorKeyOnShiftForm] = useState(true);
  // The tenant's real roles (Settings > "Roles") - used by the inline
  // "+ Add new staff member" role dropdown.
  const [roles, setRoles] = useState<TenantRoleOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [holidays, setHolidays] = useState<HolidayOption[]>([]);
  const [staffFilter, setStaffFilter] = useState<string>(initialStaffId ?? "all");
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
  const [range, setRange] = useState<{ start: Date; end: Date }>(() => {
    const now = new Date();
    const start = startOfWeek(now, { locale: enUS });
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  });
  const [selected, setSelected] = useState<ApiAppointment | null>(null);
  const [creating, setCreating] = useState<{ start: Date; end: Date; mode: EntryMode } | null>(null);
  // Whether the create panel has finished its entrance transition - kept
  // separate from `creating` itself so the panel doesn't just snap into
  // view the instant a slot is selected. The draft "ghost" event on the
  // calendar (driven by `creating` directly) shows the selection
  // immediately; this flips to true after a short hold so the panel fades/
  // slides in afterward instead of popping in.
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

  const loadAppointments = useCallback(async (r: { start: Date; end: Date }) => {
    try {
      const params = new URLSearchParams({ start: r.start.toISOString(), end: r.end.toISOString() });
      if (viewScope === "mine") params.set("view", "mine");
      const data = await fetchJson<{ appointments: ApiAppointment[] }>(`/api/appointments?${params.toString()}`);
      setEvents(data.appointments.map(toEvent));
    } catch {
      setError("Couldn't load appointments.");
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

  const loadRoles = useCallback(async () => {
    try {
      const data = await fetchJson<{ roles: TenantRoleOption[] }>("/api/roles");
      setRoles(data.roles);
    } catch {
      // Not fatal - the inline "+ Add new staff member" role dropdown just stays empty until retried.
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [serviceData, permData, settingsData] = await Promise.all([
          fetchJson<{ serviceTypes: ServiceTypeOption[] }>("/api/service-types?activeOnly=true"),
          fetchJson<{ permissions: Record<PermissionKey, boolean> }>("/api/me/permissions"),
          fetchJson<{
            settings: {
              requireClientForAppointments: boolean;
              enableMapsNavigation: boolean;
              eventColors: Record<EventColorKey, string>;
              showFederalHolidays: boolean;
              showJobTypeOnShiftForm: boolean;
              showJobEstimateOnShiftForm: boolean;
              showColorKeyOnShiftForm: boolean;
            };
          }>("/api/tenant-settings"),
        ]);
        setServiceTypes(serviceData.serviceTypes);
        setPermissions(permData.permissions);
        setRequireClientForAppointments(settingsData.settings.requireClientForAppointments);
        setEnableMapsNavigation(settingsData.settings.enableMapsNavigation);
        setColorTriples(buildColorTriples(resolveEventColors(settingsData.settings.eventColors)));
        setShowFederalHolidays(settingsData.settings.showFederalHolidays);
        setShowJobTypeOnShiftForm(settingsData.settings.showJobTypeOnShiftForm);
        setShowJobEstimateOnShiftForm(settingsData.settings.showJobEstimateOnShiftForm);
        setShowColorKeyOnShiftForm(settingsData.settings.showColorKeyOnShiftForm);
      } catch {
        setError("Couldn't load service data.");
      }
      await Promise.all([loadStaff(), loadClients(), loadTags(), loadHolidays(), loadRoles()]);
    })();
  }, [loadStaff, loadClients, loadTags, loadHolidays, loadRoles]);

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

  // Once the panel starts its fade/slide-in, smoothly scroll it into view too
  // - a selection made further down a tall calendar (or on a small screen)
  // shouldn't require the user to notice and manually scroll down themselves.
  // "smooth" rather than "auto" so this reads as sliding the page over to the
  // form, not an instant jump/snap.
  useEffect(() => {
    if (panelVisible) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [panelVisible]);

  const handleRangeChange = useCallback((r: Date[] | { start: Date; end: Date }) => {
    if (Array.isArray(r)) {
      if (r.length === 0) return;
      setRange({ start: r[0], end: r[r.length - 1] });
    } else {
      setRange(r);
    }
  }, []);

  async function applyReschedule(id: string, start: Date, end: Date) {
    try {
      await fetchJson(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: start.toISOString(), endTime: end.toISOString() }),
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
  const handleEventDrop = useCallback(
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
  const canCreate = !readOnly && (permissions?.CREATE_APPOINTMENTS ?? false);
  const canEdit = !readOnly && (permissions?.EDIT_APPOINTMENTS ?? false);
  const canCancel = !readOnly && (permissions?.CANCEL_APPOINTMENTS ?? false);
  const canViewAllShifts = permissions?.VIEW_ALL_SHIFTS ?? false;
  const canViewAllAppointments = permissions?.VIEW_ALL_APPOINTMENTS ?? false;
  // Whether the Everyone/Just mine toggle is worth showing for whatever the
  // calendar is currently filtered to - no point offering it for a type the
  // viewer can never see beyond their own anyway.
  const canToggleViewScope =
    calendarType === "shift"
      ? canViewAllShifts
      : calendarType === "appointment"
        ? canViewAllAppointments
        : canViewAllShifts || canViewAllAppointments;

  const visibleEvents = useMemo(() => {
    let list = staffFilter === "all" ? events : events.filter((e) => e.resource.staffId === staffFilter);
    if (calendarType === "appointment") list = list.filter((e) => !isShift(e.resource));
    else if (calendarType === "shift") list = list.filter((e) => isShift(e.resource));
    return list;
  }, [events, staffFilter, calendarType]);

  // The pending create/shift form is rendered as a real calendar event (a
  // dashed "ghost" block) so its selection stays visible and can be dragged/
  // resized directly on the grid, instead of disappearing the moment the
  // mouse is released (react-big-calendar's own slot-selection highlight is
  // only ever momentary).
  const calendarEvents = useMemo(() => {
    if (!creating) return visibleEvents;
    const draft: CalendarEvent = {
      id: DRAFT_EVENT_ID,
      // The "(drag to adjust)" hint itself is appended by EventContent, not
      // baked in here, so it can render smaller than the rest of the label
      // and be dropped once creationCount passes the onboarding threshold.
      title: creating.mode === "shift" ? "New shift" : "New appointment",
      start: creating.start,
      end: creating.end,
      resource: DRAFT_RESOURCE,
    };
    return [...visibleEvents, draft];
  }, [visibleEvents, creating]);

  const eventPropGetter = useCallback(
    (event: CalendarEvent) => {
      if (event.id === DRAFT_EVENT_ID) {
        const isShiftDraft = creating?.mode === "shift";
        return {
          style: {
            backgroundColor: isShiftDraft
              ? "color-mix(in srgb, var(--color-shift-500) 15%, transparent)"
              : "color-mix(in srgb, var(--color-primary-500) 15%, transparent)",
            border: `2px dashed ${isShiftDraft ? "var(--color-shift-600)" : "var(--color-primary-600)"}`,
            color: isShiftDraft ? "var(--color-shift-700)" : "var(--color-primary-700)",
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
        },
      };
    },
    [creating, colorTriples]
  );

  // Federal holidays (computed, admin can hide tenant-wide) merged with
  // tenant-added custom holidays (recurring or one-off) for the visible
  // range - drives both the day-cell tint below and the "holidays in view"
  // list rendered next to the legend.
  const holidaysInView = useMemo<ComputedHoliday[]>(() => {
    const federal = showFederalHolidays ? getFederalHolidaysInRange(range.start, range.end) : [];
    const custom = getCustomHolidaysInRange(holidays, range.start, range.end);
    return [...federal, ...custom].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [range, showFederalHolidays, holidays]);

  const holidayDateKeys = useMemo(
    () => new Set(holidaysInView.map((h) => h.date.toDateString())),
    [holidaysInView]
  );

  const dayPropGetter = useCallback(
    (date: Date) => {
      if (!holidayDateKeys.has(date.toDateString())) return {};
      return {
        style: { backgroundColor: "color-mix(in srgb, #f59e0b 8%, white)" },
      };
    },
    [holidayDateKeys]
  );

  // Base status/type colors plus one legend entry per custom tag, so a tag's
  // color is explained on the legend the same way the 5 built-in colors are.
  const legendItems = useMemo(() => {
    const base = BASE_LEGEND_KEYS.filter(
      (key) =>
        (calendarType !== "shift" || key !== "appointment") &&
        (calendarType !== "appointment" || key !== "shift")
    ).map((key) => ({ key, label: EVENT_COLOR_LABELS[key], color: colorTriples[key].bg }));
    const tagItems = tags.map((t) => ({ key: t.id, label: t.name, color: t.color }));
    return [...base, ...tagItems];
  }, [calendarType, colorTriples, tags]);

  // The time grid always renders the full 24 hours now - the AM/PM toggle
  // below no longer hides half the day, it just scrolls the (already fully
  // rendered) grid to that half. react-big-calendar's min/max only read the
  // time-of-day portion of these Date objects (the date itself is ignored,
  // merged onto whichever day is actually rendered), so fixed constants are
  // fine here.
  const gridMinTime = useMemo(() => new Date(2000, 0, 1, 0, 0, 0), []);
  const gridMaxTime = useMemo(() => new Date(2000, 0, 1, 23, 59, 59), []);

  // Only affects where the grid starts scrolled to on first mount -
  // react-big-calendar doesn't re-read this prop after mount, so switching
  // halves afterward is handled imperatively in scrollToAmPmHalf below.
  const initialScrollToTime = useMemo(
    () => new Date(2000, 0, 1, amPmHalf === "PM" ? 12 : 0, 0, 0),
    [amPmHalf]
  );

  const calendarWrapperRef = useRef<HTMLDivElement>(null);

  // Smoothly scrolls the Week/Day time gutter to the top (AM) or the
  // midpoint (PM) of the now-always-full-day grid. Scrolls the actual DOM
  // node directly since react-big-calendar's `scrollToTime` prop only takes
  // effect on first mount, not on later prop changes.
  const scrollToAmPmHalf = useCallback((half: "AM" | "PM") => {
    const content = calendarWrapperRef.current?.querySelector<HTMLElement>(".rbc-time-content");
    if (!content) return;
    content.scrollTo({ top: content.scrollHeight * (half === "PM" ? 0.5 : 0), behavior: "smooth" });
  }, []);

  const showDragHint = creationCount < 10;

  // Custom event-content renderer only exists to give the draft event's
  // "(drag to adjust)" hint its own smaller, lighter styling (a plain
  // `title` string can't be partially styled) and to drop that hint
  // entirely once the viewer has created enough entries to not need it.
  // Every other event just falls back to its plain title.
  const EventContent = useCallback(
    ({ event }: { event: CalendarEvent }) => {
      if (event.id !== DRAFT_EVENT_ID) return <>{event.title}</>;
      return (
        <>
          {event.title}
          {showDragHint && <span className="ml-1 text-[10px] opacity-75">(drag to adjust)</span>}
        </>
      );
    },
    [showDragHint]
  );

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {readOnly && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-600">
          <span className="h-2 w-2 rounded-full bg-gray-400" />
          View only — this link can&apos;t create, reschedule, or cancel anything.
        </div>
      )}

      {/* Controls (filters, create buttons) and the legend stay above the
          calendar; only the actual create-panel "fillout" flows in below
          the calendar grid once you've picked a slot or hit a button. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* A single "settings box" for the view toggles (which staff, which
            calendar type, time-grid granularity) - grouped under one bordered
            panel with a micro-label per control, rather than loose buttons
            floating next to the create buttons, so it reads as one cohesive
            settings panel. */}
        <div className="flex flex-wrap items-end gap-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          {staff.length > 1 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Staff</span>
              <select
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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

          {/* Only worth showing a switcher when the tier actually includes both -
              otherwise there's nothing to switch to, so it's just noise - and
              only when this role holds VIEW_CALENDAR_TOGGLE. */}
          {features.appointmentManager && features.shiftManagement && canToggleCalendarType && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Calendar</span>
              <div className="inline-flex gap-1 rounded-full bg-white p-1 text-sm shadow-sm">
                {(["appointment", "shift", "both"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCalendarType(t)}
                    className={`rounded-full px-3 py-1.5 font-medium capitalize transition-all duration-150 ${
                      calendarType === t
                        ? "bg-primary-500 text-white shadow-sm"
                        : "text-gray-600 hover:text-primary-600"
                    }`}
                  >
                    {t === "appointment" ? "Appointments" : t === "shift" ? "Shifts" : "Both"}
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
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Viewing</span>
              <div className="inline-flex gap-1 rounded-full bg-white p-1 text-sm shadow-sm">
                {(["all", "mine"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setViewScope(v)}
                    className={`rounded-full px-3 py-1.5 font-medium transition-all duration-150 ${
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
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Time grid</span>
            <div className="inline-flex gap-1 rounded-full bg-white p-1 text-sm shadow-sm">
              {([60, 30, 15] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTimeStep(s)}
                  title="Time grid granularity"
                  className={`rounded-full px-3 py-1.5 font-medium transition-all duration-150 ${
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
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Hours</span>
            <div className="inline-flex gap-1 rounded-full bg-white p-1 text-sm shadow-sm">
              {(["AM", "PM"] as const).map((half) => (
                <button
                  key={half}
                  type="button"
                  onClick={() => {
                    setAmPmHalf(half);
                    scrollToAmPmHalf(half);
                  }}
                  title={half === "AM" ? "Scroll up to 12 AM" : "Scroll down to 12 PM"}
                  className={`rounded-full px-3 py-1.5 font-medium transition-all duration-150 ${
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
        </div>

        {canCreate && (
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            {features.appointmentManager && (
              <button
                onClick={() => setCreating({ ...nextHourSlot(), mode: "appointment" })}
                className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-[radial-gradient(circle_at_center,var(--color-primary-500)_0%,var(--color-primary-700)_100%)] hover:shadow-md"
              >
                + Add appointment
              </button>
            )}
            {features.shiftManagement && (
              <button
                onClick={() => setCreating({ ...nextHourSlot(), mode: "shift" })}
                className="rounded-lg bg-shift-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-[radial-gradient(circle_at_center,var(--color-shift-500)_0%,var(--color-shift-700)_100%)] hover:shadow-md"
              >
                + Schedule shift
              </button>
            )}
            {/* Always rendered (space reserved via `invisible`, not conditionally
                mounted) so this button appearing doesn't grow the row's content
                width and reflow the settings box to its left - that reflow was
                the actual cause of the "everything shifts left" bug, not the
                page-height/scrollbar effect originally suspected. */}
            <button
              type="button"
              onClick={() => setCreating(null)}
              className={`rounded-lg border border-[#BD3039] px-4 py-2 text-sm font-medium text-[#BD3039] shadow-sm transition-all duration-200 hover:bg-[#BD3039]/10 ${
                creating ? "" : "invisible"
              }`}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5">
        {legendItems.map((item) => (
          <div key={item.key} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </div>
        ))}
      </div>

      {holidaysInView.length > 0 && (
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-600">Holidays in view:</span>{" "}
          {holidaysInView.map((h, i) => (
            <span key={`${h.name}-${h.date.toISOString()}`}>
              {i > 0 && ", "}
              {h.name} ({h.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })})
            </span>
          ))}
        </p>
      )}

      <div
        ref={calendarWrapperRef}
        style={{ height: 650 }}
        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <DnDCalendar
          localizer={localizer}
          events={calendarEvents}
          startAccessor="start"
          endAccessor="end"
          date={currentDate}
          view={currentView}
          onNavigate={(date) => setCurrentDate(date)}
          onView={(view) => setCurrentView(view)}
          views={["month", "week", "day"]}
          components={{ toolbar: CalendarToolbar, event: EventContent, timeGutterHeader: TimeGutterHeader }}
          step={timeStep}
          timeslots={1}
          min={gridMinTime}
          max={gridMaxTime}
          scrollToTime={initialScrollToTime}
          // "ignoreEvents" lets a new selection be drawn starting on top of
          // an existing event instead of the existing event capturing the
          // click/drag - this is what lets overlapping bookings be created
          // deliberately rather than being blocked by whatever's already
          // there.
          selectable={canCreate ? "ignoreEvents" : false}
          resizable={canEdit || canCreate}
          draggableAccessor={(event: CalendarEvent) => (event.id === DRAFT_EVENT_ID ? canCreate : canEdit)}
          resizableAccessor={(event: CalendarEvent) => (event.id === DRAFT_EVENT_ID ? canCreate : canEdit)}
          onRangeChange={handleRangeChange}
          onSelectSlot={(slot: SlotInfo) => {
            if (!canCreate) return;
            // If a creation is already in progress, a fresh click-drag just
            // repositions it (same mode) rather than discarding it - the
            // draft event itself can also be dragged/resized directly, this
            // is just the other way to move it.
            setCreating((prev) =>
              prev ? { ...prev, start: slot.start, end: slot.end } : { start: slot.start, end: slot.end, mode: "appointment" }
            );
          }}
          onSelectEvent={(event: CalendarEvent) => {
            if (event.id === DRAFT_EVENT_ID) return;
            setSelected(event.resource);
          }}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          eventPropGetter={eventPropGetter}
          dayPropGetter={dayPropGetter}
        />
      </div>

      {creating && (
        // Selecting a slot shouldn't snap the form into view instantly - the
        // draft "ghost" event on the calendar shows the selection right
        // away, and this panel holds briefly (see the panelVisible delay
        // above) before fading/sliding in underneath it, so the selection
        // itself gets a beat to register before the form appears.
        <div
          ref={panelRef}
          className={`transition-all duration-500 ease-out ${
            panelVisible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
          }`}
        >
          <CreateEntryPanel
            start={creating.start}
            end={creating.end}
            mode={creating.mode}
            onRangeChange={(start, end) =>
              setCreating((prev) => (prev ? { ...prev, start, end } : prev))
            }
            staff={staff}
            serviceTypes={serviceTypes}
            clients={clients}
            tags={tags}
            roles={roles}
            requireClient={requireClientForAppointments}
            showJobType={showJobTypeOnShiftForm}
            showJobEstimate={showJobEstimateOnShiftForm}
            showColorKey={showColorKeyOnShiftForm}
            canEditEstimates={permissions?.EDIT_JOB_ESTIMATES ?? false}
            canCreateStaff={permissions?.CREATE_STAFF ?? false}
            canCreateClient={permissions?.CREATE_CLIENTS ?? false}
            canCreateTag={canCreate}
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
        </div>
      )}

      {selected && (
        <AppointmentDetailPanel
          appointment={selected}
          permissions={permissions}
          canCancel={canCancel}
          canEdit={canEdit}
          canFindCoverage={canEdit}
          readOnly={readOnly}
          enableMapsNavigation={enableMapsNavigation}
          showJobType={showJobTypeOnShiftForm}
          showJobEstimate={showJobEstimateOnShiftForm}
          showColorKey={showColorKeyOnShiftForm}
          colorTriples={colorTriples}
          tags={tags}
          canCreateTag={canCreate}
          onTagCreated={loadTags}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            void loadAppointments(range);
          }}
        />
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

function AppointmentDetailPanel({
  appointment,
  permissions,
  canCancel,
  canEdit,
  canFindCoverage,
  readOnly = false,
  enableMapsNavigation,
  showJobType,
  showJobEstimate,
  showColorKey,
  colorTriples,
  tags,
  canCreateTag,
  onTagCreated,
  onClose,
  onChanged,
}: {
  appointment: ApiAppointment;
  permissions: Record<PermissionKey, boolean> | null;
  canCancel: boolean;
  canEdit: boolean;
  canFindCoverage: boolean;
  readOnly?: boolean;
  enableMapsNavigation: boolean;
  // Admin-configurable (Settings > "Shift form") - only applies when this
  // appointment is a shift (isShift(appointment)); appointments always show
  // these fields regardless.
  showJobType: boolean;
  showJobEstimate: boolean;
  showColorKey: boolean;
  colorTriples: Record<EventColorKey, ColorTriple>;
  tags: TagOption[];
  canCreateTag: boolean;
  onTagCreated: () => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const canViewEstimates = permissions?.VIEW_JOB_ESTIMATES ?? false;
  const canEditEstimates = !readOnly && (permissions?.EDIT_JOB_ESTIMATES ?? false);
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
  const [tagId, setTagId] = useState(appointment.tagId ?? "");
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

  async function saveTag(id: string) {
    setSavingTag(true);
    try {
      await fetchJson(`/api/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: id || null }),
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
      body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
    });
    onTagCreated();
    setShowNewTagForm(false);
    setNewTagName("");
    await saveTag(tag.id);
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

  return (
    <div className="rounded-xl border border-primary-100 bg-linear-to-br from-primary-50 to-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-medium">{isShift(appointment) ? "Shift details" : "Appointment details"}</h2>
          <div className="mt-1">
            <StatusPill appointment={appointment} colorTriples={colorTriples} />
          </div>
        </div>
        <button onClick={onClose} className="text-sm text-gray-500 hover:underline">
          Close
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-gray-500">Client</dt>
        <dd>{appointment.client?.name ?? "— (internal/shift)"}</dd>
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
        {(!isShift(appointment) || showJobType) && (
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
        <dt className="text-gray-500">Payment</dt>
        <dd>{appointment.paymentStatus}</dd>
      </dl>

      {(!isShift(appointment) || showColorKey) && (
      <div className="mt-4 border-t border-primary-100 pt-3">
        <h3 className="mb-2 text-sm font-medium text-primary-700">Color key</h3>
        {canEdit ? (
          <select
            value={tagId}
            onChange={(e) => {
              const next = e.target.value;
              if (next === NEW_TAG_VALUE) {
                setShowNewTagForm(true);
                return;
              }
              setTagId(next);
              setShowNewTagForm(false);
              void saveTag(next);
            }}
            disabled={savingTag}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">No color key</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            {canCreateTag && <option value={NEW_TAG_VALUE}>+ Add new color key</option>}
          </select>
        ) : appointment.tag ? (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: appointment.tag.color }} />
            {appointment.tag.name}
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

      {canViewEstimates && (!isShift(appointment) || showJobEstimate) && (
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

      {canFindCoverage && appointment.status !== "CANCELLED" && (
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

      {canCancel && appointment.status !== "CANCELLED" && (
        <button
          onClick={cancelAppointment}
          className="mt-4 rounded-md border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
        >
          Cancel {isShift(appointment) ? "shift" : "appointment"}
        </button>
      )}
    </div>
  );
}

const NEW_STAFF_VALUE = "__new_staff__";
const NEW_TAG_VALUE = "__new_tag__";

function CreateEntryPanel({
  start: startTime,
  end: endTime,
  mode,
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
  // applies to mode === "shift", which has no client field at all.
  requireClient: boolean;
  // Admin-configurable (Settings > "Shift form") - only applies when
  // mode === "shift"; the appointment form always shows these.
  showJobType: boolean;
  showJobEstimate: boolean;
  showColorKey: boolean;
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
  const [staffId, setStaffId] = useState(
    staff[0]?.id ?? (canCreateStaff ? NEW_STAFF_VALUE : "")
  );
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffUsername, setNewStaffUsername] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newStaffRoleId, setNewStaffRoleId] = useState(() => roles[0]?.id ?? "");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [tagId, setTagId] = useState("");
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

  function toInputValue(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fail(message: string) {
    setError(message);
    setConflict(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!staffId) {
      fail("Pick a staff member.");
      return;
    }
    if (
      staffId === NEW_STAFF_VALUE &&
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
    if (mode === "appointment") {
      if (showNewClientForm) {
        if (!clientQuery.trim()) {
          fail("Enter the new client's name.");
          return;
        }
        if (newClientAddress.trim() && newClientAddress.trim() !== newClientConfirmAddress.trim()) {
          fail("Address and confirm address don't match.");
          return;
        }
      } else if (requireClient && !selectedClientId) {
        fail("Pick a client, or add a new one.");
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    setConflict(false);
    try {
      let resolvedStaffId = staffId;
      if (staffId === NEW_STAFF_VALUE) {
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

      let resolvedTagId: string | null = tagId || null;
      if (tagId === NEW_TAG_VALUE) {
        if (newTagName.trim()) {
          const { tag } = await fetchJson<{ tag: { id: string } }>("/api/event-tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
          });
          resolvedTagId = tag.id;
          onTagCreated();
        } else {
          resolvedTagId = null;
        }
      }

      let clientId: string | null = null;
      if (mode === "appointment" && showNewClientForm) {
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
      } else if (mode === "appointment" && selectedClientId) {
        clientId = selectedClientId;
      }

      await fetchJson("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Couldn't create ${mode}.`);
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
          : "border-primary-100 bg-linear-to-br from-primary-50 to-white"
      }`}
    >
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-medium">{mode === "shift" ? "New shift" : "New appointment"}</h2>
        <button type="button" onClick={onClose} className="text-sm font-medium text-[#BD3039] hover:underline">
          Cancel
        </button>
      </div>

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

      <label className="flex flex-col gap-1 text-sm">
        Staff
        <select
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1"
        >
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
          {canCreateStaff && <option value={NEW_STAFF_VALUE}>+ Add new staff member</option>}
        </select>
      </label>

      {staffId === NEW_STAFF_VALUE && (
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

      {(mode !== "shift" || showJobType) && (
      <label className="flex flex-col gap-1 text-sm">
        {mode === "shift" ? "Job type (optional)" : "Service (optional)"}
        <select
          value={serviceTypeId}
          onChange={(e) => setServiceTypeId(e.target.value)}
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

      {(mode !== "shift" || showColorKey) && (
      <label className="flex flex-col gap-1 text-sm">
        Color key (optional)
        <select
          value={tagId}
          onChange={(e) => {
            const next = e.target.value;
            setTagId(next);
            setShowNewTagForm(next === NEW_TAG_VALUE);
          }}
          className="rounded-md border border-gray-300 px-2 py-1"
        >
          <option value="">—</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          {canCreateTag && <option value={NEW_TAG_VALUE}>+ Add new color key</option>}
        </select>
      </label>
      )}

      {(mode !== "shift" || showColorKey) && showNewTagForm && (
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

      {mode === "appointment" && (
        <div ref={clientBoxRef} className="relative flex flex-col gap-1 text-sm">
          Client{requireClient ? "" : " (optional)"}
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
            className="rounded-md border border-gray-300 px-2 py-1"
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
                  Email (optional)
                  <input
                    type="email"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Phone (optional)
                  <input
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-1"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                Address (optional)
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

      <label className="flex flex-col gap-1 text-sm">
        {locationType === "ONLINE" ? "Meeting link" : "Address (optional)"}
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={locationType === "ONLINE" ? "https://..." : "123 Main St"}
          className="rounded-md border border-gray-300 px-2 py-1"
        />
      </label>

      {canEditEstimates && (mode !== "shift" || showJobEstimate) && (
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
            : "bg-primary-500 hover:bg-[radial-gradient(circle_at_center,var(--color-primary-500)_0%,var(--color-primary-700)_100%)] hover:shadow-md"
        }`}
      >
        {submitting ? "Creating..." : mode === "shift" ? "Create shift" : "Create appointment"}
      </button>
    </form>
  );
}
