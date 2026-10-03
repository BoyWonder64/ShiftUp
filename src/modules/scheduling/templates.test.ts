import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runInSystemContext } from "@/lib/tenant-context";
import { createTestTenant, createTestStaff } from "@/lib/test-support/fixtures";
import {
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  cloneTemplate,
  addTemplateShift,
  updateTemplateShift,
  deleteTemplateShift,
  planTemplateApply,
  applyTemplate,
} from "./templates";
import { createAppointment } from "./service";

describe("scheduling/templates", () => {
  let tenantId: string;
  let staffAId: string;
  let staffBId: string;
  let userId: string;
  let serviceTypeId: string;

  beforeAll(async () => {
    await runInSystemContext(async (tx) => {
      const tenant = await createTestTenant(tx, "tmpl");
      tenantId = tenant.id;
      const staffA = await createTestStaff(tx, tenantId, null, "tmplA");
      const staffB = await createTestStaff(tx, tenantId, null, "tmplB");
      staffAId = staffA.staffProfile.id;
      staffBId = staffB.staffProfile.id;
      userId = staffA.user.id;
      const serviceType = await tx.serviceType.create({
        data: { tenantId, name: "Test Service", durationMinutes: 60 },
      });
      serviceTypeId = serviceType.id;
    });
  });

  afterAll(async () => {
    await runInSystemContext(async (tx) => {
      await tx.appointment.deleteMany({ where: { tenantId } });
      await tx.scheduleTemplateShift.deleteMany({ where: { tenantId } });
      await tx.scheduleTemplate.deleteMany({ where: { tenantId } });
      await tx.serviceType.deleteMany({ where: { tenantId } });
      await tx.staffProfile.deleteMany({ where: { tenantId } });
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.license.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  describe("createTemplate / listTemplates / getTemplate", () => {
    it("creates a template with no shifts, and lists/gets it back", async () => {
      await runInSystemContext(async (tx) => {
        const template = await createTemplate(tx, tenantId, { name: "Weekly A", periodLengthDays: 7 });
        const fetched = await getTemplate(tx, tenantId, template.id);
        expect(fetched?.shifts).toEqual([]);

        const listed = await listTemplates(tx, tenantId);
        expect(listed.some((t) => t.id === template.id)).toBe(true);

        await tx.scheduleTemplate.delete({ where: { id: template.id } });
      });
    });
  });

  describe("addTemplateShift", () => {
    it("rejects a dayOffset outside the template's period", async () => {
      await runInSystemContext(async (tx) => {
        const template = await createTemplate(tx, tenantId, { name: "Short", periodLengthDays: 7 });
        await expect(
          addTemplateShift(tx, tenantId, template.id, {
            staffId: staffAId,
            dayOffset: 7, // period has days 0..6
            startMinute: 9 * 60,
            endMinute: 17 * 60,
          })
        ).rejects.toThrow("INVALID_DAY_OFFSET");
        await tx.scheduleTemplate.delete({ where: { id: template.id } });
      });
    });

    it("rejects an invalid time range (end <= start, or beyond 24h)", async () => {
      await runInSystemContext(async (tx) => {
        const template = await createTemplate(tx, tenantId, { name: "Short2", periodLengthDays: 7 });
        await expect(
          addTemplateShift(tx, tenantId, template.id, {
            staffId: staffAId,
            dayOffset: 0,
            startMinute: 17 * 60,
            endMinute: 9 * 60,
          })
        ).rejects.toThrow("INVALID_TIME_RANGE");
        await tx.scheduleTemplate.delete({ where: { id: template.id } });
      });
    });

    it("rejects a staff member or service type that doesn't belong to this tenant", async () => {
      await runInSystemContext(async (tx) => {
        const template = await createTemplate(tx, tenantId, { name: "Foreign", periodLengthDays: 7 });
        await expect(
          addTemplateShift(tx, tenantId, template.id, {
            staffId: "00000000-0000-0000-0000-000000000000",
            dayOffset: 0,
            startMinute: 0,
            endMinute: 60,
          })
        ).rejects.toThrow("INVALID_STAFF");
        await expect(
          addTemplateShift(tx, tenantId, template.id, {
            staffId: staffAId,
            dayOffset: 0,
            startMinute: 0,
            endMinute: 60,
            serviceTypeId: "00000000-0000-0000-0000-000000000000",
          })
        ).rejects.toThrow("INVALID_SERVICE_TYPE");
        await tx.scheduleTemplate.delete({ where: { id: template.id } });
      });
    });

    it("creates a valid shift", async () => {
      await runInSystemContext(async (tx) => {
        const template = await createTemplate(tx, tenantId, { name: "Valid", periodLengthDays: 7 });
        const shift = await addTemplateShift(tx, tenantId, template.id, {
          staffId: staffAId,
          dayOffset: 0,
          startMinute: 9 * 60,
          endMinute: 17 * 60,
          serviceTypeId,
        });
        expect(shift.staffId).toBe(staffAId);
        await tx.scheduleTemplate.delete({ where: { id: template.id } });
      });
    });
  });

  describe("updateTemplateShift / deleteTemplateShift", () => {
    it("merges partial updates and re-validates against the template's period", async () => {
      await runInSystemContext(async (tx) => {
        const template = await createTemplate(tx, tenantId, { name: "Update", periodLengthDays: 7 });
        const shift = await addTemplateShift(tx, tenantId, template.id, {
          staffId: staffAId,
          dayOffset: 0,
          startMinute: 9 * 60,
          endMinute: 17 * 60,
        });
        const updated = await updateTemplateShift(tx, tenantId, template.id, shift.id, { dayOffset: 2 });
        expect(updated.dayOffset).toBe(2);
        expect(updated.startMinute).toBe(9 * 60); // untouched fields preserved

        await expect(
          updateTemplateShift(tx, tenantId, template.id, shift.id, { dayOffset: 99 })
        ).rejects.toThrow("INVALID_DAY_OFFSET");

        await deleteTemplateShift(tx, tenantId, template.id, shift.id);
        await expect(deleteTemplateShift(tx, tenantId, template.id, shift.id)).rejects.toThrow("NOT_FOUND");

        await tx.scheduleTemplate.delete({ where: { id: template.id } });
      });
    });
  });

  describe("updateTemplate", () => {
    it("rejects shrinking periodLengthDays below an existing shift's dayOffset", async () => {
      await runInSystemContext(async (tx) => {
        const template = await createTemplate(tx, tenantId, { name: "Shrink", periodLengthDays: 7 });
        await addTemplateShift(tx, tenantId, template.id, {
          staffId: staffAId,
          dayOffset: 5,
          startMinute: 0,
          endMinute: 60,
        });
        await expect(updateTemplate(tx, tenantId, template.id, { periodLengthDays: 5 })).rejects.toThrow(
          "PERIOD_TOO_SHORT"
        );
        const ok = await updateTemplate(tx, tenantId, template.id, { periodLengthDays: 6 });
        expect(ok?.periodLengthDays).toBe(6);

        await tx.scheduleTemplateShift.deleteMany({ where: { templateId: template.id } });
        await tx.scheduleTemplate.delete({ where: { id: template.id } });
      });
    });

    it("throws NOT_FOUND for a template id that doesn't belong to this tenant", async () => {
      await runInSystemContext(async (tx) => {
        await expect(
          updateTemplate(tx, tenantId, "00000000-0000-0000-0000-000000000000", { name: "x" })
        ).rejects.toThrow("NOT_FOUND");
      });
    });
  });

  describe("deleteTemplate", () => {
    it("deletes an existing template and throws NOT_FOUND for a repeat delete", async () => {
      await runInSystemContext(async (tx) => {
        const template = await createTemplate(tx, tenantId, { name: "ToDelete", periodLengthDays: 7 });
        await deleteTemplate(tx, tenantId, template.id);
        await expect(deleteTemplate(tx, tenantId, template.id)).rejects.toThrow("NOT_FOUND");
      });
    });
  });

  describe("cloneTemplate", () => {
    it("copies the template and all its shifts under a new name", async () => {
      await runInSystemContext(async (tx) => {
        const template = await createTemplate(tx, tenantId, { name: "Original", periodLengthDays: 7 });
        await addTemplateShift(tx, tenantId, template.id, {
          staffId: staffAId,
          dayOffset: 1,
          startMinute: 60,
          endMinute: 120,
        });

        const clone = await cloneTemplate(tx, tenantId, template.id, "Cloned");
        expect(clone?.name).toBe("Cloned");
        expect(clone?.periodLengthDays).toBe(7);
        expect(clone?.shifts).toHaveLength(1);
        expect(clone?.shifts[0].staffId).toBe(staffAId);
        expect(clone?.id).not.toBe(template.id);

        await tx.scheduleTemplateShift.deleteMany({ where: { templateId: { in: [template.id, clone!.id] } } });
        await tx.scheduleTemplate.deleteMany({ where: { id: { in: [template.id, clone!.id] } } });
      });
    });
  });

  describe("planTemplateApply / applyTemplate", () => {
    it("flags a conflict against an existing appointment, and against an earlier shift in the same template for the same staff member", async () => {
      await runInSystemContext(async (tx) => {
        const template = await createTemplate(tx, tenantId, { name: "Plan", periodLengthDays: 7 });
        // Local midnight, not UTC - computeShiftRange builds off date-fns
        // startOfDay/addDays, which snap to local-timezone day boundaries.
        const periodStart = new Date(2026, 8, 7); // a Monday

        // Shift 1: staffA, day 0, 9am-5pm - will conflict with a pre-existing appointment.
        await addTemplateShift(tx, tenantId, template.id, {
          staffId: staffAId,
          dayOffset: 0,
          startMinute: 9 * 60,
          endMinute: 17 * 60,
        });
        // Shift 2: staffB, day 1, 9am-5pm - no conflict.
        await addTemplateShift(tx, tenantId, template.id, {
          staffId: staffBId,
          dayOffset: 1,
          startMinute: 9 * 60,
          endMinute: 17 * 60,
        });
        // Shift 3: staffB, day 1, 10am-6pm - overlaps shift 2 for the same staff within this plan.
        await addTemplateShift(tx, tenantId, template.id, {
          staffId: staffBId,
          dayOffset: 1,
          startMinute: 10 * 60,
          endMinute: 18 * 60,
        });

        // Pre-existing appointment for staffA on day 0 that overlaps shift 1.
        await createAppointment(tx, tenantId, {
          staffId: staffAId,
          startTime: new Date(2026, 8, 7, 10, 0, 0),
          endTime: new Date(2026, 8, 7, 11, 0, 0),
          createdByUserId: userId,
          source: "ADMIN",
        });

        const plan = await planTemplateApply(tx, tenantId, template.id, periodStart);
        expect(plan.items).toHaveLength(3);

        const shift1Plan = plan.items.find((i) => i.staffId === staffAId);
        expect(shift1Plan?.conflict).toBe(true);

        const staffBItems = plan.items.filter((i) => i.staffId === staffBId);
        // First staffB shift in template order is accepted, the overlapping second one is flagged.
        expect(staffBItems[0].conflict).toBe(false);
        expect(staffBItems[1].conflict).toBe(true);

        const result = await applyTemplate(tx, tenantId, template.id, periodStart, userId);
        expect(result.created).toHaveLength(1); // only staffB's first shift
        expect(result.skipped).toHaveLength(2); // staffA's conflicting shift + staffB's overlapping second shift
        expect(result.skipped.every((s) => s.reason === "CONFLICT")).toBe(true);

        await tx.appointment.deleteMany({ where: { tenantId } });
        await tx.scheduleTemplateShift.deleteMany({ where: { templateId: template.id } });
        await tx.scheduleTemplate.delete({ where: { id: template.id } });
      });
    });

    it("throws NOT_FOUND when applying a template id that doesn't exist for this tenant", async () => {
      await runInSystemContext(async (tx) => {
        await expect(
          planTemplateApply(tx, tenantId, "00000000-0000-0000-0000-000000000000", new Date())
        ).rejects.toThrow("NOT_FOUND");
      });
    });
  });
});
