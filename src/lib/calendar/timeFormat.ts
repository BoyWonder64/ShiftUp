import { format } from "date-fns";

export const TIME_FORMATS = ["TWELVE_HOUR", "TWENTY_FOUR_HOUR"] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

/**
 * A single clock time, honoring the viewer's 12-hour/24-hour preference
 * (Settings > Account) - "9:00 AM" or "09:00". Always the real, full time -
 * no abbreviating down to e.g. "9a" to save space; a narrow calendar event
 * box just truncates this normally (ellipsis) the same as any other text,
 * rather than this function inventing a shorter notation of its own.
 */
export function formatClockTime(date: Date, timeFormat: TimeFormat): string {
  return format(date, timeFormat === "TWENTY_FOUR_HOUR" ? "HH:mm" : "h:mm a");
}

/** A start-end time range in the same preference - "9:00 AM – 5:00 PM" or "09:00 – 17:00". */
export function formatClockRange(start: Date, end: Date, timeFormat: TimeFormat): string {
  return `${formatClockTime(start, timeFormat)} – ${formatClockTime(end, timeFormat)}`;
}
