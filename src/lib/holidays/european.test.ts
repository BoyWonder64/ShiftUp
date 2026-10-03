import { describe, it, expect } from "vitest";
import { getEuropeanHolidays } from "./european";

function find(holidays: ReturnType<typeof getEuropeanHolidays>, name: string) {
  const h = holidays.find((h) => h.name === name);
  if (!h) throw new Error(`${name} not found`);
  return h.date;
}

describe("getEuropeanHolidays", () => {
  it("returns 8 holidays", () => {
    expect(getEuropeanHolidays(2026)).toHaveLength(8);
  });

  it("computes fixed and Easter-derived dates correctly for 2026 (Easter Sunday = Apr 5)", () => {
    const holidays = getEuropeanHolidays(2026);
    expect(find(holidays, "Epiphany")).toEqual(new Date(2026, 0, 6));
    expect(find(holidays, "Good Friday")).toEqual(new Date(2026, 3, 3));
    expect(find(holidays, "Easter Sunday")).toEqual(new Date(2026, 3, 5));
    expect(find(holidays, "Easter Monday")).toEqual(new Date(2026, 3, 6));
    expect(find(holidays, "Labour Day")).toEqual(new Date(2026, 4, 1));
    expect(find(holidays, "Assumption of Mary")).toEqual(new Date(2026, 7, 15));
    expect(find(holidays, "All Saints' Day")).toEqual(new Date(2026, 10, 1));
    expect(find(holidays, "St. Stephen's Day")).toEqual(new Date(2026, 11, 26));
  });

  it("never duplicates New Year's Day or Christmas Day (those stay exclusive to the US federal list)", () => {
    const names = getEuropeanHolidays(2026).map((h) => h.name);
    expect(names).not.toContain("New Year's Day");
    expect(names).not.toContain("Christmas Day");
  });

  it("every computed date falls in the requested year", () => {
    for (const { name, date } of getEuropeanHolidays(2027)) {
      expect(date.getFullYear(), name).toBe(2027);
    }
  });
});
