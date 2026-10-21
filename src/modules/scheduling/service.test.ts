import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runInSystemContext } from "@/lib/tenant-context";
import { createTestTenant, createTestStaff, createTestClient } from "@/lib/test-support/fixtures";
import {
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  reassignAppointmentStaff,
  findCoverageCandidates,
  listAppointmentsInRange,
  getAppointmentById,
  SchedulingConflictError,
  type AppointmentVisibility,
} from "./service";
import { requestTimeOff, reviewTimeOff } from "@/modules/timeoff/service";

function hours(h: number) {
  return h * 3_600_000;
}

/** Integration tests against a real Postgres database, run inside
 * runInSystemContext to bypass RLS - this suite exercises the scheduling
 * business logic itself (overlap checks, coverage finder, visibility
 * filtering), not tenant isolation. */
describe("scheduling/service", () => {
  let tenantId: string;
  let staffAId: string;
  let staffBId: string;
  let createdByUserId: string;
  const base = new Date("2026-06-01T09:00:00.000Z"); // a Monday

  beforeAll(async () => {
    await runInSystemContext(async (tx) => {
      const tenant = await createTestTenant(tx, "sched");
      tenantId = tenant.id;
      const staffA = await createTestStaff(tx, tenantId, null, "staffA");
      const staffB = await createTestStaff(tx, tenantId, null, "staffB");
      staffAId = staffA.staffProfile.id;
      staffBId = staffB.staffProfile.id;
      createdByUserId = staffA.user.id;
    });
  });

  afterAll(async () => {
    await runInSystemContext(async (tx) => {
      await tx.appointment.deleteMany({ where: { tenantId } });
      await tx.timeOff.deleteMany({ where: { tenantId } });
      await tx.staffProfile.deleteMany({ where: { tenantId } });
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.license.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  describe("createAppointment", () => {
    it("rejects endTime <= startTime", async () => {
      await runInSystemContext(async (tx) => {
        await expect(
          createAppointment(tx, tenantId, {
            staffId: staffAId,
            entryKind: "SHIFT",
            startTime: base,
            endTime: base,
            createdByUserId,
            source: "ADMIN",
          })
        ).rejects.toThrow("endTime must be after startTime");
      });
    });

    it("creates a shift (no client) successfully", async () => {
      await runInSystemContext(async (tx) => {
        const start = new Date(base.getTime() + hours(100));
        const end = new Date(start.getTime() + hours(1));
        const appt = await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "SHIFT",
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        expect(appt.clientId).toBeNull();
        expect(appt.staffId).toBe(staffAId);
      });
    });

    it("rejects an overlapping shift for the same staff member when allowOverlappingShifts is off (the default)", async () => {
      await runInSystemContext(async (tx) => {
        const start = new Date(base.getTime() + hours(200));
        const end = new Date(start.getTime() + hours(2));
        await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "SHIFT",
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        const overlapStart = new Date(start.getTime() + hours(1));
        const overlapEnd = new Date(overlapStart.getTime() + hours(2));
        await expect(
          createAppointment(tx, tenantId, {
            staffId: staffAId,
            entryKind: "SHIFT",
            startTime: overlapStart,
            endTime: overlapEnd,
            createdByUserId,
            source: "ADMIN",
          })
        ).rejects.toThrow(SchedulingConflictError);
      });
    });

    it("allows an overlapping shift once the tenant's allowOverlappingShifts is turned on", async () => {
      await runInSystemContext(async (tx) => {
        await tx.tenant.update({ where: { id: tenantId }, data: { allowOverlappingShifts: true } });
        try {
          const start = new Date(base.getTime() + hours(300));
          const end = new Date(start.getTime() + hours(2));
          await createAppointment(tx, tenantId, {
            staffId: staffAId,
            entryKind: "SHIFT",
            startTime: start,
            endTime: end,
            createdByUserId,
            source: "ADMIN",
          });
          const overlapStart = new Date(start.getTime() + hours(1));
          const overlapEnd = new Date(overlapStart.getTime() + hours(2));
          const appt = await createAppointment(tx, tenantId, {
            staffId: staffAId,
            entryKind: "SHIFT",
            startTime: overlapStart,
            endTime: overlapEnd,
            createdByUserId,
            source: "ADMIN",
          });
          expect(appt.id).toBeTruthy();
        } finally {
          await tx.tenant.update({ where: { id: tenantId }, data: { allowOverlappingShifts: false } });
        }
      });
    });

    it("rejects an overlapping client appointment via the DB exclusion constraint, regardless of allowOverlappingShifts", async () => {
      await runInSystemContext(async (tx) => {
        const client = await createTestClient(tx, tenantId, "client");
        const start = new Date(base.getTime() + hours(400));
        const end = new Date(start.getTime() + hours(2));
        await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "APPOINTMENT",
          clientId: client.id,
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        const overlapStart = new Date(start.getTime() + hours(1));
        const overlapEnd = new Date(overlapStart.getTime() + hours(2));
        await expect(
          createAppointment(tx, tenantId, {
            staffId: staffAId,
            entryKind: "APPOINTMENT",
            clientId: client.id,
            startTime: overlapStart,
            endTime: overlapEnd,
            createdByUserId,
            source: "ADMIN",
          })
        ).rejects.toThrow(SchedulingConflictError);
      });
    });

    it("a cancelled appointment no longer blocks a new overlapping shift", async () => {
      await runInSystemContext(async (tx) => {
        const start = new Date(base.getTime() + hours(500));
        const end = new Date(start.getTime() + hours(2));
        const appt = await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "SHIFT",
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        await cancelAppointment(tx, appt.id);
        const overlapping = await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "SHIFT",
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        expect(overlapping.id).toBeTruthy();
      });
    });
  });

  describe("rescheduleAppointment", () => {
    it("rejects endTime <= startTime", async () => {
      await runInSystemContext(async (tx) => {
        const start = new Date(base.getTime() + hours(600));
        const end = new Date(start.getTime() + hours(1));
        const appt = await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "SHIFT",
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        await expect(
          rescheduleAppointment(tx, tenantId, { id: appt.id, startTime: end, endTime: start })
        ).rejects.toThrow("endTime must be after startTime");
      });
    });

    it("moving a shift to its own overlapping slot does not conflict with itself (excludeId)", async () => {
      await runInSystemContext(async (tx) => {
        const start = new Date(base.getTime() + hours(700));
        const end = new Date(start.getTime() + hours(1));
        const appt = await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "SHIFT",
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        const newStart = new Date(start.getTime() + hours(0.5));
        const newEnd = new Date(newStart.getTime() + hours(1));
        const updated = await rescheduleAppointment(tx, tenantId, {
          id: appt.id,
          startTime: newStart,
          endTime: newEnd,
        });
        expect(updated.startTime).toEqual(newStart);
      });
    });

    it("rejects a reschedule that overlaps a different shift for the same staff member", async () => {
      await runInSystemContext(async (tx) => {
        const start = new Date(base.getTime() + hours(800));
        const end = new Date(start.getTime() + hours(1));
        await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "SHIFT",
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        const otherStart = new Date(base.getTime() + hours(810));
        const otherEnd = new Date(otherStart.getTime() + hours(1));
        const other = await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "SHIFT",
          startTime: otherStart,
          endTime: otherEnd,
          createdByUserId,
          source: "ADMIN",
        });
        await expect(
          rescheduleAppointment(tx, tenantId, { id: other.id, startTime: start, endTime: end })
        ).rejects.toThrow(SchedulingConflictError);
      });
    });
  });

  describe("reassignAppointmentStaff", () => {
    it("reassigns to a free staff member", async () => {
      await runInSystemContext(async (tx) => {
        const start = new Date(base.getTime() + hours(900));
        const end = new Date(start.getTime() + hours(1));
        const appt = await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "SHIFT",
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        const updated = await reassignAppointmentStaff(tx, tenantId, appt.id, staffBId);
        expect(updated.staffId).toBe(staffBId);
      });
    });

    it("rejects reassigning onto a staff member who's already busy then", async () => {
      await runInSystemContext(async (tx) => {
        const start = new Date(base.getTime() + hours(1000));
        const end = new Date(start.getTime() + hours(1));
        await createAppointment(tx, tenantId, {
          staffId: staffBId,
          entryKind: "SHIFT",
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        const apptForA = await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "SHIFT",
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        await expect(reassignAppointmentStaff(tx, tenantId, apptForA.id, staffBId)).rejects.toThrow(
          SchedulingConflictError
        );
      });
    });
  });

  describe("CUSTOM entries", () => {
    it("creates a clientless CUSTOM entry tied to a customCalendarId", async () => {
      await runInSystemContext(async (tx) => {
        const calendar = await tx.customCalendar.create({ data: { tenantId, name: "Site Visits" } });
        const start = new Date(base.getTime() + hours(1150));
        const end = new Date(start.getTime() + hours(1));
        const appt = await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "CUSTOM",
          customCalendarId: calendar.id,
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        expect(appt.entryKind).toBe("CUSTOM");
        expect(appt.customCalendarId).toBe(calendar.id);
        expect(appt.clientId).toBeNull();
      });
    });

    it("rejects an overlapping clientless CUSTOM entry even when the tenant's allowOverlappingShifts is on", async () => {
      await runInSystemContext(async (tx) => {
        await tx.tenant.update({ where: { id: tenantId }, data: { allowOverlappingShifts: true } });
        try {
          const calendar = await tx.customCalendar.create({ data: { tenantId, name: "Overlap Test" } });
          const start = new Date(base.getTime() + hours(1160));
          const end = new Date(start.getTime() + hours(2));
          await createAppointment(tx, tenantId, {
            staffId: staffAId,
            entryKind: "CUSTOM",
            customCalendarId: calendar.id,
            startTime: start,
            endTime: end,
            createdByUserId,
            source: "ADMIN",
          });
          const overlapStart = new Date(start.getTime() + hours(1));
          const overlapEnd = new Date(overlapStart.getTime() + hours(2));
          // allowOverlappingShifts only ever relaxes SHIFT entries - a
          // clientless CUSTOM entry has no equivalent escape hatch.
          await expect(
            createAppointment(tx, tenantId, {
              staffId: staffAId,
              entryKind: "CUSTOM",
              customCalendarId: calendar.id,
              startTime: overlapStart,
              endTime: overlapEnd,
              createdByUserId,
              source: "ADMIN",
            })
          ).rejects.toThrow(SchedulingConflictError);
        } finally {
          await tx.tenant.update({ where: { id: tenantId }, data: { allowOverlappingShifts: false } });
        }
      });
    });

    it("a clientless CUSTOM entry does not conflict with an overlapping SHIFT for a different staff member", async () => {
      await runInSystemContext(async (tx) => {
        const calendar = await tx.customCalendar.create({ data: { tenantId, name: "Cross Staff" } });
        const start = new Date(base.getTime() + hours(1170));
        const end = new Date(start.getTime() + hours(1));
        await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "SHIFT",
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        const custom = await createAppointment(tx, tenantId, {
          staffId: staffBId,
          entryKind: "CUSTOM",
          customCalendarId: calendar.id,
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        expect(custom.id).toBeTruthy();
      });
    });

    it("listAppointmentsInRange includes the custom calendar's name on a CUSTOM row", async () => {
      await runInSystemContext(async (tx) => {
        const calendar = await tx.customCalendar.create({ data: { tenantId, name: "Named Calendar" } });
        const start = new Date(base.getTime() + hours(1180));
        const end = new Date(start.getTime() + hours(1));
        await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "CUSTOM",
          customCalendarId: calendar.id,
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        const results = await listAppointmentsInRange(tx, tenantId, { start, end: new Date(end.getTime() + 1) });
        const row = results.find((r) => r.customCalendarId === calendar.id);
        expect(row?.customCalendar?.name).toBe("Named Calendar");
      });
    });

    it("canViewCustom is a hard gate separate from canViewShifts/canViewAppointments", async () => {
      await runInSystemContext(async (tx) => {
        const calendar = await tx.customCalendar.create({ data: { tenantId, name: "Gate Test" } });
        const start = new Date(base.getTime() + hours(1190));
        const end = new Date(start.getTime() + hours(1));
        const custom = await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "CUSTOM",
          customCalendarId: calendar.id,
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });

        const withoutCustomView: AppointmentVisibility = {
          allShifts: true,
          allAppointments: true,
          ownStaffId: staffAId,
          canViewShifts: true,
          canViewAppointments: true,
          canViewCustom: false,
        };
        const hidden = await listAppointmentsInRange(
          tx,
          tenantId,
          { start, end: new Date(end.getTime() + 1) },
          withoutCustomView
        );
        expect(hidden.map((r) => r.id)).not.toContain(custom.id);

        const withCustomView: AppointmentVisibility = { ...withoutCustomView, canViewCustom: true };
        const shown = await listAppointmentsInRange(
          tx,
          tenantId,
          { start, end: new Date(end.getTime() + 1) },
          withCustomView
        );
        expect(shown.map((r) => r.id)).toContain(custom.id);
      });
    });

    it("canViewCustom alone shows every custom entry, even someone else's, with no separate all/own split", async () => {
      await runInSystemContext(async (tx) => {
        const calendar = await tx.customCalendar.create({ data: { tenantId, name: "All Own Test" } });
        const start = new Date(base.getTime() + hours(1200));
        const end = new Date(start.getTime() + hours(1));
        const custom = await createAppointment(tx, tenantId, {
          staffId: staffBId, // not the viewer's own staff id below
          entryKind: "CUSTOM",
          customCalendarId: calendar.id,
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });

        const visibility: AppointmentVisibility = {
          allShifts: false,
          allAppointments: false,
          ownStaffId: staffAId, // viewer is staffA, entry belongs to staffB
          canViewShifts: true,
          canViewAppointments: true,
          canViewCustom: true,
        };
        const results = await listAppointmentsInRange(
          tx,
          tenantId,
          { start, end: new Date(end.getTime() + 1) },
          visibility
        );
        expect(results.map((r) => r.id)).toContain(custom.id);
      });
    });
  });

  describe("findCoverageCandidates", () => {
    it("excludes the current assignee, a busy staff member, and staff on approved leave; sorts by hours ascending", async () => {
      await runInSystemContext(async (tx) => {
        const tenant = await createTestTenant(tx, "coverage");
        const target = await createTestStaff(tx, tenant.id, null, "target");
        const busy = await createTestStaff(tx, tenant.id, null, "busy");
        const onLeave = await createTestStaff(tx, tenant.id, null, "onLeave");
        const free = await createTestStaff(tx, tenant.id, null, "free");
        const loaded = await createTestStaff(tx, tenant.id, null, "loaded");

        const shiftStart = new Date(base.getTime() + hours(2000));
        const shiftEnd = new Date(shiftStart.getTime() + hours(2));
        const targetAppt = await createAppointment(tx, tenant.id, {
          staffId: target.staffProfile.id,
          entryKind: "SHIFT",
          startTime: shiftStart,
          endTime: shiftEnd,
          createdByUserId: target.user.id,
          source: "ADMIN",
        });

        // busy: overlaps the target shift directly.
        await createAppointment(tx, tenant.id, {
          staffId: busy.staffProfile.id,
          entryKind: "SHIFT",
          startTime: shiftStart,
          endTime: shiftEnd,
          createdByUserId: target.user.id,
          source: "ADMIN",
        });

        // onLeave: approved time off covering the shift.
        const timeOff = await requestTimeOff(tx, tenant.id, {
          staffProfileId: onLeave.staffProfile.id,
          requestedByUserId: target.user.id,
          startTime: shiftStart,
          endTime: shiftEnd,
        });
        await reviewTimeOff(tx, timeOff.id, target.user.id, "APPROVED");

        // loaded: free for this shift, but has 10 hours already this week.
        const weekStart = new Date(shiftStart);
        weekStart.setUTCHours(0, 0, 0, 0);
        await createAppointment(tx, tenant.id, {
          staffId: loaded.staffProfile.id,
          entryKind: "SHIFT",
          startTime: weekStart,
          endTime: new Date(weekStart.getTime() + hours(10)),
          createdByUserId: target.user.id,
          source: "ADMIN",
        });

        const candidates = await findCoverageCandidates(tx, tenant.id, targetAppt.id);
        const ids = candidates.map((c) => c.staffId);
        expect(ids).not.toContain(target.staffProfile.id);
        expect(ids).not.toContain(busy.staffProfile.id);
        expect(ids).not.toContain(onLeave.staffProfile.id);
        expect(ids).toContain(free.staffProfile.id);
        expect(ids).toContain(loaded.staffProfile.id);

        // free (0 hours) should sort before loaded (10 hours).
        expect(ids.indexOf(free.staffProfile.id)).toBeLessThan(ids.indexOf(loaded.staffProfile.id));
        const loadedCandidate = candidates.find((c) => c.staffId === loaded.staffProfile.id);
        expect(loadedCandidate?.hoursThisWeek).toBe(10);

        await tx.appointment.deleteMany({ where: { tenantId: tenant.id } });
        await tx.timeOff.deleteMany({ where: { tenantId: tenant.id } });
        await tx.staffProfile.deleteMany({ where: { tenantId: tenant.id } });
        await tx.user.deleteMany({ where: { tenantId: tenant.id } });
        await tx.license.deleteMany({ where: { tenantId: tenant.id } });
        await tx.tenant.delete({ where: { id: tenant.id } });
      });
    });
  });

  describe("listAppointmentsInRange visibility filtering", () => {
    it("with no visibility arg, returns every appointment in range regardless of type or owner", async () => {
      await runInSystemContext(async (tx) => {
        const start = new Date(base.getTime() + hours(3000));
        const end = new Date(start.getTime() + hours(1));
        const client = await createTestClient(tx, tenantId, "visclient");
        await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "SHIFT",
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        }); // shift
        await createAppointment(tx, tenantId, {
          staffId: staffBId,
          entryKind: "APPOINTMENT",
          clientId: client.id,
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        }); // appointment

        const results = await listAppointmentsInRange(tx, tenantId, { start, end: new Date(end.getTime() + 1) });
        expect(results.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("canViewShifts/canViewAppointments is a hard gate - lacking it hides that type entirely, even your own", async () => {
      await runInSystemContext(async (tx) => {
        const start = new Date(base.getTime() + hours(3100));
        const end = new Date(start.getTime() + hours(1));
        const shift = await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "SHIFT",
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });

        const visibility: AppointmentVisibility = {
          allShifts: true,
          allAppointments: true,
          ownStaffId: staffAId,
          canViewShifts: false, // gate closed, even though allShifts is true
          canViewAppointments: true,
          canViewCustom: false,
        };
        const results = await listAppointmentsInRange(tx, tenantId, { start, end: new Date(end.getTime() + 1) }, visibility);
        expect(results.map((r) => r.id)).not.toContain(shift.id);
      });
    });

    it("the all/own axis: without allShifts, only ownStaffId's own shifts show", async () => {
      await runInSystemContext(async (tx) => {
        const start = new Date(base.getTime() + hours(3200));
        const end = new Date(start.getTime() + hours(1));
        const ownShift = await createAppointment(tx, tenantId, {
          staffId: staffAId,
          entryKind: "SHIFT",
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });
        const othersShift = await createAppointment(tx, tenantId, {
          staffId: staffBId,
          entryKind: "SHIFT",
          startTime: start,
          endTime: end,
          createdByUserId,
          source: "ADMIN",
        });

        const visibility: AppointmentVisibility = {
          allShifts: false,
          allAppointments: false,
          ownStaffId: staffAId,
          canViewShifts: true,
          canViewAppointments: true,
          canViewCustom: false,
        };
        const results = await listAppointmentsInRange(tx, tenantId, { start, end: new Date(end.getTime() + 1) }, visibility);
        const ids = results.map((r) => r.id);
        expect(ids).toContain(ownShift.id);
        expect(ids).not.toContain(othersShift.id);
      });
    });
  });

  describe("getAppointmentById", () => {
    it("returns null for an id that doesn't exist", async () => {
      await runInSystemContext(async (tx) => {
        const result = await getAppointmentById(tx, "00000000-0000-0000-0000-000000000000");
        expect(result).toBeNull();
      });
    });
  });
});
