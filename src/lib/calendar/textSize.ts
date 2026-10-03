export const CALENDAR_TEXT_SIZES = ["SMALL", "MEDIUM", "LARGE", "XLARGE"] as const;
export type CalendarTextSize = (typeof CALENDAR_TEXT_SIZES)[number];

/**
 * Rendered as the `--calendar-event-font-size` CSS variable on the calendar's
 * wrapper (SchedulingCalendar.tsx), which `.rbc-event` in globals.css reads
 * its font-size from. MEDIUM is the calendar's own default - deliberately
 * smaller than the page's ambient text size, since event boxes get crowded
 * fast - with SMALL/LARGE/XLARGE for anyone who wants it smaller still, or
 * bigger for readability (Settings > Account).
 */
export const CALENDAR_TEXT_SIZE_REM: Record<CalendarTextSize, string> = {
  SMALL: "0.6875rem",
  MEDIUM: "0.75rem",
  LARGE: "0.875rem",
  XLARGE: "1rem",
};
