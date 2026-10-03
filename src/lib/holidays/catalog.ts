import { getFederalHolidays, type ComputedHoliday } from "./federal";
import { getEuropeanHolidays } from "./european";

export type HolidayRegion = "US" | "EU";

export interface HolidayCatalogEntry extends ComputedHoliday {
  region: HolidayRegion;
}

/**
 * Every computed holiday this product knows about (US federal + major
 * European), tagged by region and dated for `year` - the single source the
 * Settings page reads to render one checkbox per holiday (name + that
 * year's date), and the calendar reads (via `getEnabledHolidaysInRange`) to
 * decide what to actually show. `getFederalHolidays`/`getEuropeanHolidays`
 * never share a holiday name (see the dedup note in european.ts), so this
 * list never needs dedup logic of its own.
 */
export function getHolidayCatalog(year: number): HolidayCatalogEntry[] {
  return [
    ...getFederalHolidays(year).map((h) => ({ ...h, region: "US" as const })),
    ...getEuropeanHolidays(year).map((h) => ({ ...h, region: "EU" as const })),
  ];
}

/** The 11 US federal holiday names - what a brand-new tenant starts with enabled, matching this product's original US-only default (European ones start unchecked). Must stay in sync with `getFederalHolidays`' names, and with `Tenant.enabledHolidayNames`'s `@default` in prisma/schema.prisma. */
export const DEFAULT_ENABLED_HOLIDAY_NAMES = [
  "New Year's Day",
  "Martin Luther King Jr. Day",
  "Washington's Birthday",
  "Memorial Day",
  "Juneteenth",
  "Independence Day",
  "Labor Day",
  "Columbus Day",
  "Veterans Day",
  "Thanksgiving Day",
  "Christmas Day",
] as const;

/** Whichever catalog holidays are in `enabledNames` and fall within [start, end) - spans the boundary years if the range crosses Dec 31. */
export function getEnabledHolidaysInRange(
  enabledNames: readonly string[],
  start: Date,
  end: Date
): ComputedHoliday[] {
  const enabled = new Set(enabledNames);
  const result: ComputedHoliday[] = [];
  for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
    for (const h of getHolidayCatalog(year)) {
      if (enabled.has(h.name) && h.date >= start && h.date < end) result.push(h);
    }
  }
  return result;
}
