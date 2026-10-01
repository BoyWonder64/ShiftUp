import { describe, it, expect } from "vitest";
import { buildColorTriples, DEFAULT_EVENT_COLORS, resolveEventColor, resolveEventColors } from "./eventColors";

describe("resolveEventColors", () => {
  it("falls back to defaults when overrides are malformed", () => {
    expect(resolveEventColors(undefined)).toEqual(DEFAULT_EVENT_COLORS);
    expect(resolveEventColors("not an object")).toEqual(DEFAULT_EVENT_COLORS);
    expect(resolveEventColors({ appointment: "not-a-hex-color" })).toEqual(DEFAULT_EVENT_COLORS);
  });

  it("merges valid overrides over the defaults, leaving other keys untouched", () => {
    const resolved = resolveEventColors({ appointment: "#123456" });
    expect(resolved.appointment).toBe("#123456");
    expect(resolved.shift).toBe(DEFAULT_EVENT_COLORS.shift);
  });
});

describe("resolveEventColor", () => {
  const colors = buildColorTriples(DEFAULT_EVENT_COLORS);

  it("picks the shift or appointment default based on isShift when there's no tag or terminal status", () => {
    expect(resolveEventColor({ status: "BOOKED", isShift: false }, colors)).toEqual(colors.appointment);
    expect(resolveEventColor({ status: "BOOKED", isShift: true }, colors)).toEqual(colors.shift);
  });

  it("a tag color overrides the appointment/shift default", () => {
    const result = resolveEventColor({ status: "BOOKED", isShift: false, tagColor: "#ff0000" }, colors);
    expect(result.bg).toBe("#ff0000");
  });

  it("a terminal status overrides both the default and a tag color", () => {
    expect(
      resolveEventColor({ status: "CANCELLED", isShift: false, tagColor: "#ff0000" }, colors)
    ).toEqual(colors.cancelled);
    expect(
      resolveEventColor({ status: "NO_SHOW", isShift: true, tagColor: "#ff0000" }, colors)
    ).toEqual(colors.noShow);
    expect(
      resolveEventColor({ status: "COMPLETED", isShift: false }, colors)
    ).toEqual(colors.completed);
  });
});
