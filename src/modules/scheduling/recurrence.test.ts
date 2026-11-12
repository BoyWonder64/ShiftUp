import { describe, expect, it } from "vitest";
import type { Tx } from "@/lib/tenant-context";
import { SchedulingConflictError, type CreateAppointmentInput } from "./service";
import { createRepeatingAppointments } from "./recurrence";

interface Row {
  id: string;
  staffId: string;
  clientId: string | null;
  status: string;
  startTime: Date;
  endTime: Date;
}

/** Just enough of a Prisma transaction for createAppointment + the repeat pre-check, kept in memory. */
function fakeTx(existing: Row[] = []) {
  const rows = [...existing];
  const overlaps = (r: Row, where: { staffId?: string; startTime: { lt: Date }; endTime: { gt: Date } }) =>
    r.staffId === where.staffId && r.status !== "CANCELLED" && r.startTime < where.startTime.lt && r.endTime > where.endTime.gt;
  const tx = {
    tenant: { findUniqueOrThrow: async () => ({ allowOverlappingShifts: false }) },
    appointment: {
      findFirst: async ({ where }: { where: { staffId?: string; clientId?: unknown; startTime: { lt: Date }; endTime: { gt: Date } } }) =>
        rows.find((r) => overlaps(r, where) && (where.clientId === undefined || r.clientId !== null)) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = { ...data, id: `new-${rows.length}`, status: "SCHEDULED" };
        rows.push(row);
        return row;
      },
    },
  };
  return { tx: tx as unknown as Tx, rows };
}

const at = (day: number, hour: number) => new Date(2026, 10, day, hour);
const input = (over: Partial<CreateAppointmentInput> = {}): CreateAppointmentInput => ({
  staffId: "s1",
  entryKind: "APPOINTMENT",
  clientId: "c1",
  startTime: at(2, 9),
  endTime: at(2, 10),
  createdByUserId: "u1",
  source: "ADMIN",
  ...over,
});
const weekly = (count: number) => Array.from({ length: count }, (_, i) => at(9 + 7 * i, 9));

describe("createRepeatingAppointments", () => {
  it("creates the first entry plus a copy on every extra date, keeping its length", async () => {
    const { tx, rows } = fakeTx();
    const res = await createRepeatingAppointments(tx, "t1", input({ endTime: at(2, 11) }), weekly(3));
    expect(res.created).toHaveLength(4);
    expect(res.skipped).toEqual([]);
    expect(rows.map((r) => r.startTime.getDate())).toEqual([2, 9, 16, 23]);
    expect(rows.every((r) => r.endTime.getTime() - r.startTime.getTime() === 2 * 3_600_000)).toBe(true);
  });

  it("skips a double-booked date, creates the rest, and reports it", async () => {
    const { tx } = fakeTx([{ id: "x", staffId: "s1", clientId: "c9", status: "SCHEDULED", startTime: at(16, 9), endTime: at(16, 10) }]);
    const res = await createRepeatingAppointments(tx, "t1", input(), weekly(3));
    expect(res.created).toHaveLength(3);
    expect(res.skipped).toEqual([{ startTime: at(16, 9), reason: "CONFLICT" }]);
  });

  it("skips conflicts for clientless entries too (the app-level overlap check)", async () => {
    const { tx } = fakeTx([{ id: "x", staffId: "s1", clientId: null, status: "SCHEDULED", startTime: at(9, 8), endTime: at(9, 12) }]);
    const res = await createRepeatingAppointments(tx, "t1", input({ entryKind: "CUSTOM", clientId: null }), weekly(2));
    expect(res.created).toHaveLength(2);
    expect(res.skipped.map((s) => s.startTime.getDate())).toEqual([9]);
  });

  it("ignores a cancelled entry", async () => {
    const { tx } = fakeTx([{ id: "x", staffId: "s1", clientId: "c9", status: "CANCELLED", startTime: at(9, 9), endTime: at(9, 10) }]);
    const res = await createRepeatingAppointments(tx, "t1", input(), weekly(1));
    expect(res.created).toHaveLength(2);
  });

  it("throws a conflict only when nothing could be created", async () => {
    const { tx } = fakeTx([{ id: "x", staffId: "s1", clientId: "c9", status: "SCHEDULED", startTime: at(2, 8), endTime: at(2, 11) }]);
    await expect(createRepeatingAppointments(tx, "t1", input(), [])).rejects.toBeInstanceOf(SchedulingConflictError);
  });

  it("stops at the plan limit and reports the remaining dates", async () => {
    const { tx } = fakeTx();
    let calls = 0;
    const res = await createRepeatingAppointments(tx, "t1", input(), weekly(4), async () => {
      if (++calls > 2) throw new Error("limit");
    });
    expect(res.created).toHaveLength(2);
    expect(res.skipped.map((s) => [s.startTime.getDate(), s.reason])).toEqual([
      [16, "LIMIT"],
      [23, "LIMIT"],
      [30, "LIMIT"],
    ]);
  });

  it("lets a limit error through when it hits before anything is created", async () => {
    const { tx } = fakeTx();
    await expect(
      createRepeatingAppointments(tx, "t1", input(), weekly(2), async () => {
        throw new Error("limit");
      })
    ).rejects.toThrow("limit");
  });
});
