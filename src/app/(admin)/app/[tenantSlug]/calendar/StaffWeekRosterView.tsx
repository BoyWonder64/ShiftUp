"use client";

import { useMemo, useState } from "react";
import { addDays, addWeeks, format, isToday, startOfWeek } from "date-fns";
import { enUS } from "date-fns/locale";
import type { NavigateAction, SlotInfo, View } from "react-big-calendar";
import type { ColorTriple, EventColorKey } from "@/lib/colors/eventColors";
import { formatClockRange, type TimeFormat } from "@/lib/calendar/timeFormat";
import {
  DRAFT_EVENT_ID,
  appointmentTitle,
  hourSlotOn,
  resolveAppointmentColor,
  staffAvatarColor,
  staffInitials,
  type ApiAppointment,
  type CalendarEvent,
  type StaffOption,
} from "./SchedulingCalendar";

const MAX_VISIBLE_PER_CELL = 3;

function weekRange(date: Date): Date[] {
  const start = startOfWeek(date, { locale: enUS });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

interface StaffWeekRosterViewProps {
  date: Date;
  events: CalendarEvent[];
  getters: { dayProp: (date: Date) => { style?: React.CSSProperties } };
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectSlot: (slot: SlotInfo) => void;
  onDrillDown?: (date: Date, view: View) => void;
  rosterStaff: StaffOption[];
  rosterColorTriples: Record<EventColorKey, ColorTriple>;
  rosterCanCreate: boolean;
  rosterTimeFormat: TimeFormat;
}

/**
 * The "By staff" Week view - a roster grid (staff as rows, the 7 days of the
 * week as columns) rather than react-big-calendar's native resourced
 * TimeGrid, which would render staff x 7 day-columns (e.g. 80 staff x 7 =
 * 560 - see groupByStaff's doc comment in SchedulingCalendar.tsx). Scales to
 * a large roster via vertical scroll, the same shape Deputy/7shifts/Homebase
 * use for their main weekly schedule screen, instead of ever shrinking event
 * text to fit more columns the way Google Calendar does.
 *
 * Registered as react-big-calendar's custom `views.week` component (see
 * SchedulingCalendar.tsx) - `range`/`navigate`/`title` below satisfy its
 * ViewStatic contract so the existing toolbar (Today/Back/Next, the
 * clickable month/year label) and range-driven data fetching
 * (onRangeChange -> handleRangeChange -> loadAppointments) keep working
 * unchanged; only this view's body differs from the built-in Week grid.
 */
export function StaffWeekRosterView({
  date,
  events,
  getters,
  onSelectEvent,
  onSelectSlot,
  onDrillDown,
  rosterStaff,
  rosterColorTriples,
  rosterCanCreate,
  rosterTimeFormat,
}: StaffWeekRosterViewProps) {
  const days = useMemo(() => weekRange(date), [date]);

  // staffId -> "day.toDateString()" -> that staff's events that day, sorted
  // by start time. The draft "new appointment" ghost is excluded - this view
  // has no drag support (see SchedulingCalendar.tsx's plan notes), so
  // there's nothing meaningful to show for it mid-creation; the create modal
  // itself already makes the target staff/date clear.
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, CalendarEvent[]>>();
    for (const evt of events) {
      if (evt.id === DRAFT_EVENT_ID) continue;
      const staffId = evt.resource.staffId;
      const dayKey = evt.start.toDateString();
      let byDay = map.get(staffId);
      if (!byDay) {
        byDay = new Map();
        map.set(staffId, byDay);
      }
      const list = byDay.get(dayKey);
      if (list) list.push(evt);
      else byDay.set(dayKey, [evt]);
    }
    for (const byDay of map.values()) {
      for (const list of byDay.values()) list.sort((a, b) => a.start.getTime() - b.start.getTime());
    }
    return map;
  }, [events]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleCellClick(staffId: string, day: Date) {
    if (!rosterCanCreate) return;
    const { start, end } = hourSlotOn(day);
    onSelectSlot({ start, end, slots: [start], action: "click", resourceId: staffId } as SlotInfo);
  }

  return (
    <div className="flex max-h-[650px] flex-col overflow-auto rounded-lg border border-gray-200">
      <div className="sticky top-0 z-10 grid grid-cols-[140px_repeat(7,1fr)] border-b border-gray-200 bg-white">
        <div className="border-r border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500">Staff</div>
        {days.map((day) => {
          const today = isToday(day);
          const dayStyle = getters.dayProp(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onDrillDown?.(day, "day")}
              style={dayStyle.style}
              title="View this day"
              className={`border-r border-gray-200 px-2 py-2 text-center text-xs font-semibold last:border-r-0 hover:bg-gray-50 ${
                today ? "text-primary-600" : "text-gray-700"
              }`}
            >
              <div>{format(day, "EEE")}</div>
              <div
                className={`mx-auto mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${
                  today ? "bg-primary-500 text-white" : ""
                }`}
              >
                {format(day, "d")}
              </div>
            </button>
          );
        })}
      </div>

      <div>
        {rosterStaff.map((s) => (
          <div key={s.id} className="grid grid-cols-[140px_repeat(7,1fr)] border-b border-gray-100 last:border-b-0">
            <div className="flex items-center gap-2 border-r border-gray-200 bg-gray-50 px-3 py-2">
              <span
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: staffAvatarColor(s.id) }}
              >
                {staffInitials(s.displayName)}
              </span>
              <span className="truncate text-xs font-medium text-gray-900">{s.displayName}</span>
            </div>
            {days.map((day) => {
              const dayKey = day.toDateString();
              const dayEvents = grouped.get(s.id)?.get(dayKey) ?? [];
              const cellKey = `${s.id}|${dayKey}`;
              const isExpanded = expanded.has(cellKey);
              const visible = isExpanded ? dayEvents : dayEvents.slice(0, MAX_VISIBLE_PER_CELL);
              const hidden = dayEvents.length - visible.length;
              const dayStyle = getters.dayProp(day);
              const today = isToday(day);
              return (
                <div
                  key={cellKey}
                  style={{
                    ...(today && !dayStyle.style?.backgroundColor ? { backgroundColor: "var(--color-primary-50)" } : {}),
                    ...dayStyle.style,
                  }}
                  className={`min-h-[44px] space-y-0.5 border-r border-gray-100 p-1 last:border-r-0 ${
                    rosterCanCreate ? "cursor-pointer hover:bg-gray-50" : ""
                  }`}
                  onClick={() => handleCellClick(s.id, day)}
                >
                  {visible.map((evt) => {
                    const c = resolveAppointmentColor(evt.resource, rosterColorTriples);
                    return (
                      <button
                        key={evt.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent(evt);
                        }}
                        title={`${s.displayName} · ${formatClockRange(evt.start, evt.end, rosterTimeFormat)} · ${appointmentTitle(evt.resource)}`}
                        className="block w-full truncate rounded px-1 py-0.5 text-left text-[length:var(--calendar-event-font-size,0.75rem)]"
                        style={{
                          backgroundColor: c.bg,
                          color: c.text,
                          border: `1px solid ${c.border}`,
                          textDecoration: isCancelled(evt.resource) ? "line-through" : undefined,
                        }}
                      >
                        <span className="font-semibold">{s.displayName}</span> &middot;{" "}
                        {formatClockRange(evt.start, evt.end, rosterTimeFormat)} &middot; {appointmentTitle(evt.resource)}
                      </button>
                    );
                  })}
                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(cellKey);
                      }}
                      className="block text-[10px] font-medium text-primary-600 hover:underline"
                    >
                      +{hidden} more
                    </button>
                  )}
                  {isExpanded && dayEvents.length > MAX_VISIBLE_PER_CELL && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(cellKey);
                      }}
                      className="block text-[10px] font-medium text-gray-400 hover:underline"
                    >
                      Show less
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function isCancelled(appt: ApiAppointment): boolean {
  return appt.status === "CANCELLED";
}

StaffWeekRosterView.range = (date: Date): Date[] => weekRange(date);

StaffWeekRosterView.navigate = (date: Date, action: NavigateAction): Date => {
  switch (action) {
    case "PREV":
      return addWeeks(date, -1);
    case "NEXT":
      return addWeeks(date, 1);
    default:
      return date;
  }
};

StaffWeekRosterView.title = (date: Date): string => {
  const days = weekRange(date);
  const start = days[0];
  const end = days[days.length - 1];
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${format(start, "MMMM dd")} – ${format(end, "dd")}`;
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${format(start, "MMMM dd")} – ${format(end, "MMMM dd")}`;
  }
  return `${format(start, "MMMM dd, yyyy")} – ${format(end, "MMMM dd, yyyy")}`;
};
