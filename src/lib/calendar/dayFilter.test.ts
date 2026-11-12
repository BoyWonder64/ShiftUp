import { describe, expect, it } from "vitest";
import { dragDayRange, formatDayFilterTitle, parseDayCountFilter, shiftDayFilter } from "./dayFilter";

const d = (year: number, month: number, day: number, hour = 0, minute = 0) => new Date(year, month, day, hour, minute);

describe("parseDayCountFilter", () => {
  const today = d(2026, 10, 11, 14, 30); // Nov 11, 2026, mid-afternoon

  it("returns null for an empty value - clears the filter", () => {
    expect(parseDayCountFilter("", today)).toBeNull();
  });

  it("returns null for a non-numeric value", () => {
    expect(parseDayCountFilter("abc", today)).toBeNull();
  });

  it("returns null for zero or negative values", () => {
    expect(parseDayCountFilter("0", today)).toBeNull();
    expect(parseDayCountFilter("-3", today)).toBeNull();
  });

  it("returns a single day for 1", () => {
    const days = parseDayCountFilter("1", today);
    expect(days).toHaveLength(1);
    expect(days![0]).toEqual(d(2026, 10, 11));
  });

  it("returns N consecutive days starting at today, with time zeroed out", () => {
    const days = parseDayCountFilter("5", today);
    expect(days).toHaveLength(5);
    expect(days!.map((x) => x.getDate())).toEqual([11, 12, 13, 14, 15]);
    expect(days![0].getHours()).toBe(0);
    expect(days![0].getMinutes()).toBe(0);
  });

  it("rounds a fractional value", () => {
    expect(parseDayCountFilter("3.6", today)).toHaveLength(4);
  });

  it("clamps above the 60-day max", () => {
    expect(parseDayCountFilter("500", today)).toHaveLength(60);
  });

  it("crosses a month boundary correctly", () => {
    const nearMonthEnd = d(2026, 10, 28); // Nov 28, 2026
    const days = parseDayCountFilter("5", nearMonthEnd);
    expect(days!.map((x) => `${x.getMonth()}-${x.getDate()}`)).toEqual(["10-28", "10-29", "10-30", "11-1", "11-2"]);
  });
});

describe("dragDayRange", () => {
  it("returns a single day when anchor and hover are the same date", () => {
    const day = d(2026, 10, 11);
    expect(dragDayRange(day, day)).toHaveLength(1);
  });

  it("returns the inclusive range when dragging forward", () => {
    const range = dragDayRange(d(2026, 10, 11), d(2026, 10, 14));
    expect(range.map((x) => x.getDate())).toEqual([11, 12, 13, 14]);
  });

  it("returns the same inclusive range when dragging backward", () => {
    const range = dragDayRange(d(2026, 10, 14), d(2026, 10, 11));
    expect(range.map((x) => x.getDate())).toEqual([11, 12, 13, 14]);
  });
});

describe("shiftDayFilter", () => {
  it("shifts NEXT forward by the filter's own span", () => {
    const days = [d(2026, 10, 11), d(2026, 10, 12), d(2026, 10, 13)];
    const shifted = shiftDayFilter(days, "NEXT");
    expect(shifted).toHaveLength(3);
    expect(shifted.map((x) => x.getDate())).toEqual([14, 15, 16]);
  });

  it("shifts PREV backward by the filter's own span", () => {
    const days = [d(2026, 10, 11), d(2026, 10, 12), d(2026, 10, 13)];
    const shifted = shiftDayFilter(days, "PREV");
    expect(shifted.map((x) => x.getDate())).toEqual([8, 9, 10]);
  });

  it("preserves a single-day filter's length", () => {
    const shifted = shiftDayFilter([d(2026, 10, 11)], "NEXT");
    expect(shifted).toHaveLength(1);
    expect(shifted[0].getDate()).toBe(12);
  });

  it("is reversible - NEXT then PREV returns to the original window", () => {
    const days = [d(2026, 10, 11), d(2026, 10, 12), d(2026, 10, 13)];
    const roundTrip = shiftDayFilter(shiftDayFilter(days, "NEXT"), "PREV");
    expect(roundTrip.map((x) => x.getTime())).toEqual(days.map((x) => x.getTime()));
  });
});

describe("formatDayFilterTitle", () => {
  it("formats a range within the same month as 'Month d – d'", () => {
    const days = [d(2026, 10, 8), d(2026, 10, 9), d(2026, 10, 10)];
    expect(formatDayFilterTitle(days)).toBe("November 8 – 10");
  });

  it("formats a single-day filter with the same start/end day", () => {
    expect(formatDayFilterTitle([d(2026, 10, 11)])).toBe("November 11 – 11");
  });

  it("formats a range crossing months in the same year as 'Month d – Month d'", () => {
    const days = [d(2026, 10, 29), d(2026, 10, 30), d(2026, 11, 1), d(2026, 11, 2)];
    expect(formatDayFilterTitle(days)).toBe("November 29 – December 2");
  });

  it("formats a range crossing years with the full 'Month d, yyyy' on both ends", () => {
    const days = [d(2026, 11, 30), d(2026, 11, 31), d(2027, 0, 1), d(2027, 0, 2)];
    expect(formatDayFilterTitle(days)).toBe("December 30, 2026 – January 2, 2027");
  });
});
