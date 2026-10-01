import { describe, it, expect } from "vitest";
import { getCustomHolidaysInRange, getFederalHolidays } from "./federal";

function find(holidays: ReturnType<typeof getFederalHolidays>, name: string) {
  const h = holidays.find((h) => h.name === name);
  if (!h) throw new Error(`${name} not found`);
  return h.date;
}

describe("getFederalHolidays", () => {
  it("returns 11 holidays", () => {
    expect(getFederalHolidays(2026)).toHaveLength(11);
  });

  it("computes known fixed and floating dates correctly for 2026", () => {
    // Verified against the official OPM 2026 federal holiday schedule.
    const holidays = getFederalHolidays(2026);
    expect(find(holidays, "New Year's Day")).toEqual(new Date(2026, 0, 1));
    expect(find(holidays, "Martin Luther King Jr. Day")).toEqual(new Date(2026, 0, 19));
    expect(find(holidays, "Washington's Birthday")).toEqual(new Date(2026, 1, 16));
    expect(find(holidays, "Memorial Day")).toEqual(new Date(2026, 4, 25));
    expect(find(holidays, "Juneteenth")).toEqual(new Date(2026, 5, 19));
    expect(find(holidays, "Independence Day")).toEqual(new Date(2026, 6, 4));
    expect(find(holidays, "Labor Day")).toEqual(new Date(2026, 8, 7));
    expect(find(holidays, "Columbus Day")).toEqual(new Date(2026, 9, 12));
    expect(find(holidays, "Veterans Day")).toEqual(new Date(2026, 10, 11));
    expect(find(holidays, "Thanksgiving Day")).toEqual(new Date(2026, 10, 26));
    expect(find(holidays, "Christmas Day")).toEqual(new Date(2026, 11, 25));
  });

  it("every computed date falls in the requested year", () => {
    for (const { name, date } of getFederalHolidays(2027)) {
      expect(date.getFullYear(), name).toBe(2027);
    }
  });
});

describe("getCustomHolidaysInRange", () => {
  it("repeats a recurring holiday every year the range spans", () => {
    const result = getCustomHolidaysInRange(
      [{ name: "Company Founding Day", date: "2020-03-15T00:00:00.000Z", recurring: true }],
      new Date(2026, 0, 1),
      new Date(2028, 0, 1)
    );
    expect(result.map((h) => h.date)).toEqual([new Date(2026, 2, 15), new Date(2027, 2, 15)]);
  });

  it("only occurs once for a one-off (non-recurring) holiday", () => {
    const result = getCustomHolidaysInRange(
      [{ name: "Office Closed", date: "2026-11-15T00:00:00.000Z", recurring: false }],
      new Date(2026, 0, 1),
      new Date(2028, 0, 1)
    );
    expect(result).toEqual([{ name: "Office Closed", date: new Date(2026, 10, 15) }]);
  });

  it("excludes a one-off holiday whose exact year falls outside the range", () => {
    const result = getCustomHolidaysInRange(
      [{ name: "Office Closed", date: "2025-11-15T00:00:00.000Z", recurring: false }],
      new Date(2026, 0, 1),
      new Date(2027, 0, 1)
    );
    expect(result).toEqual([]);
  });
});
