export interface ComputedHoliday {
  name: string;
  date: Date;
}

/** The nth (1-indexed) occurrence of `weekday` (0=Sun..6=Sat) in `month` (0-indexed) of `year`. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

/** The last occurrence of `weekday` in `month` of `year` (e.g. Memorial Day = last Monday of May). */
function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const lastDay = new Date(year, month + 1, 0); // day 0 of next month = last day of this month
  const offset = (lastDay.getDay() - weekday + 7) % 7;
  return new Date(year, month, lastDay.getDate() - offset);
}

/**
 * The 11 standard US federal holidays for a given calendar year, computed
 * (not stored) from the actual statutory rules - most are a fixed "nth
 * weekday of month" rule, not a fixed calendar date, so they shift year to
 * year (e.g. Thanksgiving is always the 4th Thursday of November). Doesn't
 * apply the Mon/Fri "observed" shift some employers use when a fixed-date
 * holiday falls on a weekend - these are the actual holiday dates, which is
 * what matters for a "don't double-book this day" calendar.
 */
export function getFederalHolidays(year: number): ComputedHoliday[] {
  return [
    { name: "New Year's Day", date: new Date(year, 0, 1) },
    { name: "Martin Luther King Jr. Day", date: nthWeekdayOfMonth(year, 0, 1, 3) },
    { name: "Washington's Birthday", date: nthWeekdayOfMonth(year, 1, 1, 3) },
    { name: "Memorial Day", date: lastWeekdayOfMonth(year, 4, 1) },
    { name: "Juneteenth", date: new Date(year, 5, 19) },
    { name: "Independence Day", date: new Date(year, 6, 4) },
    { name: "Labor Day", date: nthWeekdayOfMonth(year, 8, 1, 1) },
    { name: "Columbus Day", date: nthWeekdayOfMonth(year, 9, 1, 2) },
    { name: "Veterans Day", date: new Date(year, 10, 11) },
    { name: "Thanksgiving Day", date: nthWeekdayOfMonth(year, 10, 4, 4) },
    { name: "Christmas Day", date: new Date(year, 11, 25) },
  ];
}

export interface StoredHoliday {
  name: string;
  /// Stored as a full date at UTC midnight (see the Holiday model's doc
  /// comment) - only the UTC month/day is read here, the stored year is
  /// ignored for `recurring` holidays.
  date: Date | string;
  recurring: boolean;
}

/**
 * Tenant-added custom holidays falling within [start, end), same `ComputedHoliday`
 * shape as `getEnabledHolidaysInRange` (see catalog.ts) so the two can be
 * merged for display. A `recurring` holiday repeats every year on its stored
 * month/day; a one-off only occurs on its exact stored date.
 */
export function getCustomHolidaysInRange(
  holidays: StoredHoliday[],
  start: Date,
  end: Date
): ComputedHoliday[] {
  const result: ComputedHoliday[] = [];
  for (const h of holidays) {
    const stored = new Date(h.date);
    if (h.recurring) {
      for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
        const occurrence = new Date(year, stored.getUTCMonth(), stored.getUTCDate());
        if (occurrence >= start && occurrence < end) result.push({ name: h.name, date: occurrence });
      }
    } else {
      const occurrence = new Date(stored.getUTCFullYear(), stored.getUTCMonth(), stored.getUTCDate());
      if (occurrence >= start && occurrence < end) result.push({ name: h.name, date: occurrence });
    }
  }
  return result;
}
