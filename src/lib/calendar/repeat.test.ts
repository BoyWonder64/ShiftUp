import { describe, expect, it } from "vitest";
import { MAX_REPEAT_OCCURRENCES, parseRepeatCount, repeatResultNotice, repeatStartTimes, repeatSummary } from "./repeat";

const start = new Date(2026, 0, 31, 9, 30);

describe("repeatStartTimes", () => {
  it("returns only the dates after the first", () => {
    expect(repeatStartTimes(start, "WEEKLY", 1)).toEqual([]);
    expect(repeatStartTimes(start, "WEEKLY", 3).map((d) => d.getDate())).toEqual([7, 14]);
    expect(repeatStartTimes(start, "DAILY", 3).map((d) => d.getDate())).toEqual([1, 2]);
  });

  it("keeps the time of day", () => {
    for (const d of repeatStartTimes(start, "WEEKLY", 20)) expect([d.getHours(), d.getMinutes()]).toEqual([9, 30]);
  });

  it("steps months from the first date, not from the previous copy", () => {
    expect(repeatStartTimes(start, "MONTHLY", 4).map((d) => [d.getMonth(), d.getDate()])).toEqual([
      [1, 28],
      [2, 31],
      [3, 30],
    ]);
  });
});

describe("parseRepeatCount", () => {
  it("clamps to a sane whole number", () => {
    expect(parseRepeatCount("")).toBe(1);
    expect(parseRepeatCount("abc")).toBe(1);
    expect(parseRepeatCount("0")).toBe(1);
    expect(parseRepeatCount("4.6")).toBe(5);
    expect(parseRepeatCount("500")).toBe(MAX_REPEAT_OCCURRENCES);
  });
});

describe("repeatSummary", () => {
  it("names the cadence and the real last date", () => {
    expect(repeatSummary(new Date(2026, 10, 2, 9), "WEEKLY", 4)).toBe(
      "4 entries: this one, then again every week, the last on Mon, Nov 23, 2026."
    );
  });
});

describe("repeatResultNotice", () => {
  it("is a plain success when nothing was skipped", () => {
    expect(repeatResultNotice(4, { createdCount: 4, skipped: [] })).toEqual({ text: "Created 4 entries.", tone: "success" });
  });

  it("lists skipped dates and why", () => {
    const n = repeatResultNotice(4, {
      createdCount: 3,
      skipped: [{ startTime: new Date(2026, 10, 16, 9).toISOString(), reason: "CONFLICT" }],
    });
    expect(n.tone).toBe("warning");
    expect(n.text).toBe("Created 3 of 4. Skipped Nov 16: already booked at that time.");
  });

  it("explains a plan-limit stop", () => {
    const n = repeatResultNotice(4, {
      createdCount: 2,
      skipped: [
        { startTime: new Date(2026, 10, 16, 9).toISOString(), reason: "LIMIT" },
        { startTime: new Date(2026, 10, 23, 9).toISOString(), reason: "LIMIT" },
      ],
    });
    expect(n.text).toContain("Stopped before Nov 16");
  });
});
