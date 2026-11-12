import { addDays, addMonths, addWeeks, format } from "date-fns";

/** Mirrors MAX_REPEAT_OCCURRENCES in src/modules/scheduling/recurrence.ts (server-only module, not importable here). */
export const MAX_REPEAT_OCCURRENCES = 52;

/** `label` reads as the unit in "Every [Week]"; `plural` follows the count in "for [4] weeks". */
export const REPEAT_CADENCES = [
  { value: "DAILY", label: "Day", plural: "days" },
  { value: "WEEKLY", label: "Week", plural: "weeks" },
  { value: "MONTHLY", label: "Month", plural: "months" },
] as const;
export type RepeatCadence = (typeof REPEAT_CADENCES)[number]["value"];

/** Clamps whatever's typed in the count box to a whole number in 1..MAX_REPEAT_OCCURRENCES. */
export function parseRepeatCount(raw: string): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(MAX_REPEAT_OCCURRENCES, Math.max(1, n)) : 1;
}

/**
 * Start of the nth occurrence. Always stepped from the first one (not
 * chained from the previous), so a monthly repeat from Jan 31 reads Jan 31,
 * Feb 28, Mar 31 rather than getting stuck on the 28th. Done on local
 * calendar dates, so 9:00 stays 9:00 across a daylight-saving change.
 */
export function occurrenceStart(start: Date, cadence: RepeatCadence, index: number): Date {
  return cadence === "DAILY" ? addDays(start, index) : cadence === "WEEKLY" ? addWeeks(start, index) : addMonths(start, index);
}

/** Every start time *after* the first - what the API's `repeatStartTimes` takes. */
export function repeatStartTimes(start: Date, cadence: RepeatCadence, total: number): Date[] {
  return Array.from({ length: Math.max(0, total - 1) }, (_, i) => occurrenceStart(start, cadence, i + 1));
}

/** The chosen repeat, read back as one plain sentence with the real last date. */
export function repeatSummary(start: Date, cadence: RepeatCadence, total: number): string {
  if (total <= 1) return "Only this one will be created. Raise the number to add repeats.";
  const unit = REPEAT_CADENCES.find((c) => c.value === cadence)?.label.toLowerCase() ?? "week";
  const last = occurrenceStart(start, cadence, total - 1);
  return `${total} entries: this one, then again every ${unit}, the last on ${format(last, "EEE, MMM d, yyyy")}.`;
}

/** What to tell the user after a repeat was saved, or undefined when there's nothing beyond "it worked". */
export function repeatResultNotice(
  total: number,
  repeat: { createdCount: number; skipped: { startTime: string; reason: "CONFLICT" | "LIMIT" }[] } | undefined
): { text: string; tone: "success" | "warning" } {
  if (!repeat || repeat.skipped.length === 0) {
    return { text: `Created ${repeat?.createdCount ?? total} entries.`, tone: "success" };
  }
  const dates = (reason: "CONFLICT" | "LIMIT") =>
    repeat.skipped
      .filter((s) => s.reason === reason)
      .map((s) => format(new Date(s.startTime), "MMM d"))
      .join(", ");
  const parts = [`Created ${repeat.createdCount} of ${total}.`];
  if (repeat.skipped.some((s) => s.reason === "CONFLICT")) {
    parts.push(`Skipped ${dates("CONFLICT")}: already booked at that time.`);
  }
  if (repeat.skipped.some((s) => s.reason === "LIMIT")) {
    parts.push(`Stopped before ${dates("LIMIT").split(", ")[0]}: the free plan's monthly limit was reached.`);
  }
  return { text: parts.join(" "), tone: "warning" };
}
