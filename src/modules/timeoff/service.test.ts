import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runInSystemContext } from "@/lib/tenant-context";
import { createTestTenant, createTestStaff } from "@/lib/test-support/fixtures";
import {
  getOwnStaffProfile,
  requestTimeOff,
  listTimeOff,
  reviewTimeOff,
  staffOnApprovedLeave,
  TimeOffError,
} from "./service";

describe("timeoff/service", () => {
  let tenantId: string;
  let staffProfileId: string;
  let userId: string;

  beforeAll(async () => {
    await runInSystemContext(async (tx) => {
      const tenant = await createTestTenant(tx, "timeoff");
      tenantId = tenant.id;
      const staff = await createTestStaff(tx, tenantId, null, "requester");
      staffProfileId = staff.staffProfile.id;
      userId = staff.user.id;
    });
  });

  afterAll(async () => {
    await runInSystemContext(async (tx) => {
      await tx.timeOff.deleteMany({ where: { tenantId } });
      await tx.staffProfile.deleteMany({ where: { tenantId } });
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.license.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  it("getOwnStaffProfile finds the profile by userId, or null if there isn't one", async () => {
    await runInSystemContext(async (tx) => {
      expect((await getOwnStaffProfile(tx, userId))?.id).toBe(staffProfileId);
      expect(await getOwnStaffProfile(tx, "00000000-0000-0000-0000-000000000000")).toBeNull();
    });
  });

  it("requestTimeOff rejects endTime <= startTime", async () => {
    await runInSystemContext(async (tx) => {
      const start = new Date("2026-07-01T00:00:00.000Z");
      await expect(
        requestTimeOff(tx, tenantId, {
          staffProfileId,
          requestedByUserId: userId,
          startTime: start,
          endTime: start,
        })
      ).rejects.toThrow(TimeOffError);
    });
  });

  it("a fresh request starts PENDING, and reviewTimeOff moves it to APPROVED/DENIED with reviewer + timestamp", async () => {
    await runInSystemContext(async (tx) => {
      const start = new Date("2026-07-02T00:00:00.000Z");
      const end = new Date("2026-07-03T00:00:00.000Z");
      const created = await requestTimeOff(tx, tenantId, {
        staffProfileId,
        requestedByUserId: userId,
        startTime: start,
        endTime: end,
        reason: "Vacation",
      });
      expect(created.status).toBe("PENDING");
      expect(created.reviewedByUserId).toBeNull();

      const approved = await reviewTimeOff(tx, created.id, userId, "APPROVED");
      expect(approved.status).toBe("APPROVED");
      expect(approved.reviewedByUserId).toBe(userId);
      expect(approved.reviewedAt).not.toBeNull();
    });
  });

  it("listTimeOff filters by staffProfileId and status", async () => {
    await runInSystemContext(async (tx) => {
      const other = await createTestStaff(tx, tenantId, null, "other");
      const start = new Date("2026-07-10T00:00:00.000Z");
      const end = new Date("2026-07-11T00:00:00.000Z");
      const mine = await requestTimeOff(tx, tenantId, {
        staffProfileId,
        requestedByUserId: userId,
        startTime: start,
        endTime: end,
      });
      await requestTimeOff(tx, tenantId, {
        staffProfileId: other.staffProfile.id,
        requestedByUserId: other.user.id,
        startTime: start,
        endTime: end,
      });

      const onlyMine = await listTimeOff(tx, { staffProfileId });
      expect(onlyMine.every((r) => r.staffProfileId === staffProfileId)).toBe(true);
      expect(onlyMine.some((r) => r.id === mine.id)).toBe(true);

      await reviewTimeOff(tx, mine.id, userId, "DENIED");
      const onlyDenied = await listTimeOff(tx, { staffProfileId, status: "DENIED" });
      expect(onlyDenied.every((r) => r.status === "DENIED")).toBe(true);

      await tx.timeOff.deleteMany({ where: { staffProfileId: other.staffProfile.id } });
      await tx.staffProfile.delete({ where: { id: other.staffProfile.id } });
      await tx.user.delete({ where: { id: other.user.id } });
    });
  });

  it("staffOnApprovedLeave only counts APPROVED requests overlapping the range", async () => {
    await runInSystemContext(async (tx) => {
      const pendingStaff = await createTestStaff(tx, tenantId, null, "pending");
      const start = new Date("2026-08-01T00:00:00.000Z");
      const end = new Date("2026-08-05T00:00:00.000Z");

      const approvedReq = await requestTimeOff(tx, tenantId, {
        staffProfileId,
        requestedByUserId: userId,
        startTime: start,
        endTime: end,
      });
      await reviewTimeOff(tx, approvedReq.id, userId, "APPROVED");

      await requestTimeOff(tx, tenantId, {
        staffProfileId: pendingStaff.staffProfile.id,
        requestedByUserId: pendingStaff.user.id,
        startTime: start,
        endTime: end,
      }); // left PENDING, deliberately not reviewed

      const onLeave = await staffOnApprovedLeave(tx, {
        start: new Date("2026-08-02T00:00:00.000Z"),
        end: new Date("2026-08-03T00:00:00.000Z"),
      });
      expect(onLeave.has(staffProfileId)).toBe(true);
      expect(onLeave.has(pendingStaff.staffProfile.id)).toBe(false);

      await tx.timeOff.deleteMany({ where: { staffProfileId: pendingStaff.staffProfile.id } });
      await tx.staffProfile.delete({ where: { id: pendingStaff.staffProfile.id } });
      await tx.user.delete({ where: { id: pendingStaff.user.id } });
    });
  });
});
