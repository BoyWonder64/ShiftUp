import { addDays, eachDayOfInterval, format } from "date-fns";

// Matches the "Show days" toolbar input's own `max={60}` in
// SchedulingCalendar.tsx - kept in sync by hand, there's no single shared
// constant both sides can import (one's a React prop, one's plain logic).
const MAX_DAY_COUNT = 60;

/**
 * Parses the calendar's "Show days" toolbar input into a day-filter array -
 * `null` for an empty/invalid value, which clears the filter back to the
 * normal full week. `today` is injected (rather than read internally) so
 * this stays deterministic to test; the real call site always passes
 * `new Date()`. The returned days start at `today`'s own calendar day
 * (midnight local time), regardless of what time of day `today` carries.
 */
export function parseDayCountFilter(raw: string, today: Date): Date[] | null {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n < 1) return null;
  const clamped = Math.min(MAX_DAY_COUNT, Math.max(1, Math.round(n)));
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: clamped }, (_, i) => addDays(start, i));
}

/**
 * The contiguous day range between a header-drag's anchor and its current
 * hover date, inclusive, regardless of which direction the drag runs.
 */
export function dragDayRange(anchor: Date, hovered: Date): Date[] {
  const [from, to] = anchor <= hovered ? [anchor, hovered] : [hovered, anchor];
  return eachDayOfInterval({ start: from, end: to });
}

/**
 * Shifts an active day filter by its own span, for the Week toolbar's
 * Back/Next while a filter is active - a 3-day filter moves 3 days at a
 * time, keeping the same window width. Not used for "TODAY" - react-big-
 * calendar substitutes today's date directly for that action before a
 * view's own navigation logic ever runs (see SchedulingCalendar's
 * `onNavigate`, which clears the filter for that case instead).
 */
export function shiftDayFilter(days: Date[], direction: "PREV" | "NEXT"): Date[] {
  const delta = direction === "PREV" ? -days.length : days.length;
  return days.map((d) => addDays(d, delta));
}

/**
 * The Week toolbar's title for an active day filter - "November 8 – 10"
 * within a month, "November 29 – December 2" across months in the same
 * year, "December 30, 2026 – January 2, 2027" across years.
 */
export function formatDayFilterTitle(days: Date[]): string {
  const start = days[0];
  const end = days[days.length - 1];
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${format(start, "MMMM d")} – ${format(end, "d")}`;
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${format(start, "MMMM d")} – ${format(end, "MMMM d")}`;
  }
  return `${format(start, "MMMM d, yyyy")} – ${format(end, "MMMM d, yyyy")}`;
}
