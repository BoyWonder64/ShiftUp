import type { ComputedHoliday } from "./federal";

/** Easter Sunday (Gregorian calendar) via the Anonymous/Meeus algorithm - the one date every other moveable European holiday below is computed from. */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Major holidays observed across most of Europe for a given calendar year,
 * computed (not stored) the same way `getFederalHolidays` computes the US
 * set. Not every one of these is a public holiday in every European country
 * (e.g. France doesn't observe Good Friday nationally), but each is widely
 * enough observed to be worth flagging on a "don't double-book this day"
 * calendar - a tenant that wants a specific country's exact statutory list
 * instead of this common-denominator set should use custom holidays
 * (`Holiday` model) for the difference.
 *
 * Deliberately excludes New Year's Day and Christmas Day, even though both
 * are observed across Europe too - they're already in `getFederalHolidays`
 * under the identical name, and a tenant can enable both lists at once (see
 * `catalog.ts`'s per-holiday checkboxes), so keeping this list free of exact
 * name duplicates avoids needing any merge/dedupe logic at the call site.
 */
export function getEuropeanHolidays(year: number): ComputedHoliday[] {
  const easterSunday = getEasterSunday(year);
  return [
    { name: "Epiphany", date: new Date(year, 0, 6) },
    { name: "Good Friday", date: addDays(easterSunday, -2) },
    { name: "Easter Sunday", date: easterSunday },
    { name: "Easter Monday", date: addDays(easterSunday, 1) },
    { name: "Labour Day", date: new Date(year, 4, 1) },
    { name: "Assumption of Mary", date: new Date(year, 7, 15) },
    { name: "All Saints' Day", date: new Date(year, 10, 1) },
    { name: "St. Stephen's Day", date: new Date(year, 11, 26) },
  ];
}
