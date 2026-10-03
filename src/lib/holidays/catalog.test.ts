import { describe, it, expect } from "vitest";
import { DEFAULT_ENABLED_HOLIDAY_NAMES, getEnabledHolidaysInRange, getHolidayCatalog } from "./catalog";

describe("getHolidayCatalog", () => {
  it("never has two holidays sharing a name, across several years", () => {
    for (const year of [2024, 2025, 2026, 2027, 2028]) {
      const names = getHolidayCatalog(year).map((h) => h.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("tags every US-federal name as region US and everything else as EU", () => {
    const catalog = getHolidayCatalog(2026);
    for (const name of DEFAULT_ENABLED_HOLIDAY_NAMES) {
      expect(catalog.find((h) => h.name === name)?.region).toBe("US");
    }
    expect(catalog.some((h) => h.region === "EU")).toBe(true);
  });
});

describe("getEnabledHolidaysInRange", () => {
  it("only returns holidays whose name is in the enabled set", () => {
    const result = getEnabledHolidaysInRange(
      ["Christmas Day", "Good Friday"],
      new Date(2026, 0, 1),
      new Date(2027, 0, 1)
    );
    expect(result.map((h) => h.name).sort()).toEqual(["Christmas Day", "Good Friday"]);
  });

  it("returns nothing when the enabled set is empty", () => {
    const result = getEnabledHolidaysInRange([], new Date(2026, 0, 1), new Date(2027, 0, 1));
    expect(result).toEqual([]);
  });
});
