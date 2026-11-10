import { describe, expect, it } from "vitest";
import { condenseEvents, type CondensedKind } from "./condenseEvents";

interface Ev {
  id: string;
  key: string;
  start: Date;
  end: Date;
  kind?: CondensedKind;
  members?: Ev[];
}

const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);

function ev(id: string, key: string, day: number, from: number, to: number): Ev {
  return { id, key, start: at(day, from), end: at(day, to) };
}

function many(prefix: string, key: string, count: number, day: number, from: number, to: number): Ev[] {
  return Array.from({ length: count }, (_, i) => ev(`${prefix}${i}`, key, day, from, to));
}

const makeGroup = (members: Ev[], kind: CondensedKind): Ev => ({
  id: `${kind}:${members.map((m) => m.id).join(",")}`,
  key: members[0].key,
  start: new Date(Math.min(...members.map((m) => +m.start))),
  end: new Date(Math.max(...members.map((m) => +m.end))),
  kind,
  members,
});

const condense = (events: Ev[], limit: number, mode: "time" | "day" = "time") =>
  condenseEvents(events, { mode, limit, groupKey: (e) => e.key, makeGroup });

/** The most blocks on screen at any one moment. */
function peak(events: Ev[]): number {
  return Math.max(0, ...events.map((a) => events.filter((b) => b.start <= a.start && a.start < b.end).length));
}

const memberCount = (events: Ev[]) => events.reduce((n, e) => n + (e.members?.length ?? 1), 0);

describe("condenseEvents (time grid)", () => {
  it("leaves a day alone when everything fits side by side", () => {
    const events = [...many("a", "shift", 2, 3, 9, 17), ev("b", "appt", 3, 10, 11)];
    expect(condense(events, 3)).toEqual(events);
  });

  it("turns 15 people on the same shift into one block", () => {
    const out = condense(many("a", "shift", 15, 3, 9, 17), 3);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("same");
    expect(out[0].members).toHaveLength(15);
  });

  it("shows a full 60-person day as one block per shift", () => {
    const events = [
      ...many("m", "morning", 15, 3, 6, 14),
      ...many("d", "day", 15, 3, 9, 17),
      ...many("e", "evening", 15, 3, 14, 22),
      ...many("n", "night", 15, 3, 18, 23),
    ];
    const out = condense(events, 3);
    expect(out).toHaveLength(4);
    expect(out.every((e) => e.kind === "same")).toBe(true);
    expect(peak(out)).toBeLessThanOrEqual(3);
  });

  it("does not merge entries that differ in kind or time", () => {
    const events = [...many("a", "shift", 5, 3, 9, 17), ...many("b", "other", 5, 3, 9, 17), ...many("c", "shift", 5, 3, 9, 16)];
    const out = condense(events, 3);
    expect(out).toHaveLength(3);
    expect(out.map((e) => e.members?.length)).toEqual([5, 5, 5]);
  });

  it("rolls what still doesn't fit into a '+N more' block, losing nothing", () => {
    // 12 one-off appointments, all different, all overlapping.
    const events = Array.from({ length: 12 }, (_, i) => ev(`a${i}`, `client${i}`, 3, 9, 10 + (i % 3)));
    const out = condense(events, 4);
    expect(peak(out)).toBeLessThanOrEqual(4);
    expect(out.filter((e) => e.kind === "overflow")).toHaveLength(1);
    expect(memberCount(out)).toBe(12);
  });

  it("groups identical entries earlier when groupLimit is lower than the lane limit", () => {
    const events = [...many("a", "shift", 3, 3, 9, 17), ev("b", "appt", 3, 10, 11)];
    expect(condense(events, 4)).toEqual(events);
    const out = condenseEvents(events, { mode: "time", limit: 4, groupLimit: 2, groupKey: (e) => e.key, makeGroup });
    expect(out).toHaveLength(2);
    expect(out.find((e) => e.kind === "same")?.members).toHaveLength(3);
  });

  it("only condenses the crowded day", () => {
    const quiet = many("q", "shift", 2, 4, 9, 17);
    const out = condense([...many("b", "shift", 10, 3, 9, 17), ...quiet], 3);
    expect(out.filter((e) => e.kind)).toHaveLength(1);
    expect(out).toEqual(expect.arrayContaining(quiet));
  });

  it("keeps overflow blocks to one day each", () => {
    const events = [3, 4].flatMap((day) =>
      Array.from({ length: 8 }, (_, i) => ({ id: `${day}-${i}`, key: `k${day}-${i}`, start: at(day, 20), end: at(day + 1, 21 + (i % 2)) }))
    );
    const overflow = condense(events, 3).filter((e) => e.kind === "overflow");
    expect(overflow).toHaveLength(2);
    expect(overflow.map((e) => e.start.getDate()).sort()).toEqual([3, 4]);
  });
});

describe("condenseEvents (month)", () => {
  it("groups identical entries on a busy day and never makes overflow blocks", () => {
    const quiet = many("q", "shift", 2, 4, 9, 17);
    const out = condense([...many("a", "shift", 15, 3, 9, 17), ev("b", "appt", 3, 10, 11), ...quiet], 3, "day");
    expect(out.filter((e) => e.kind === "same")).toHaveLength(1);
    expect(out.some((e) => e.kind === "overflow")).toBe(false);
    expect(out).toHaveLength(4);
  });
});
