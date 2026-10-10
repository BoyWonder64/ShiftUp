import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { addDays, addMinutes, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";
import { prisma } from "@/lib/prisma";
import { runInSystemContext, type Tx } from "@/lib/tenant-context";
import { createTestTenant, createTestStaff } from "@/lib/test-support/fixtures";
import { listAvailableSlotsByStaff, collapseForDisplay, BookingUnavailableError } from "./availability";
import { createAppointment } from "./service";
import { requestTimeOff, reviewTimeOff } from "@/modules/timeoff/service";

/** The next date (>= `daysOut` from now) that falls on `dayOfWeek` (0=Sun..6=Sat), at local midnight. */
function nextDateOnWeekday(dayOfWeek: number, daysOut: number): Date {
  let d = setMilliseconds(setSeconds(setMinutes(setHours(new Date(), 0), 0), 0), 0);
  d = addDays(d, daysOut);
  while (d.getDay() !== dayOfWeek) d = addDays(d, 1);
  return d;
}

/** Integration tests against a real Postgres database, run inside
 * runInSystemContext to bypass RLS - exercises the availability-computation
 * logic itself, same pattern as service.test.ts. All test dates are derived
 * from "now" (not hardcoded) since the engine filters by the real current
 * time (min-notice/window bounds). */
describe("scheduling/availability", () => {
  let tenantId: string;

  beforeAll(async () => {
    await runInSystemContext(async (tx) => {
      const tenant = await createTestTenant(tx, "avail");
      tenantId = tenant.id;
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          publicBookingEnabled: true,
          publicBookingMinNoticeMinutes: 0,
          publicBookingWindowDays: 365,
        },
      });
    });
  });

  afterAll(async () => {
    await runInSystemContext(async (tx) => {
      await tx.appointment.deleteMany({ where: { tenantId } });
      await tx.timeOff.deleteMany({ where: { tenantId } });
      await tx.blockedTime.deleteMany({ where: { tenantId } });
      await tx.workingHours.deleteMany({ where: { tenantId } });
      await tx.serviceType.deleteMany({ where: { tenantId } });
      await tx.staffProfile.deleteMany({ where: { tenantId } });
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.license.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  async function makeService(tx: Tx, durationMinutes: number, forTenantId: string = tenantId) {
    return tx.serviceType.create({
      data: {
        tenantId: forTenantId,
        name: `Service ${Math.random().toString(36).slice(2, 7)}`,
        durationMinutes,
        isActive: true,
        isPubliclyBookable: true,
      },
    });
  }

  it("rejects a service type that isn't publicly bookable", async () => {
    await runInSystemContext(async (tx) => {
      const staff = await createTestStaff(tx, tenantId, null, "s1");
      const service = await tx.serviceType.create({
        data: { tenantId, name: "Internal only", durationMinutes: 60, isPubliclyBookable: false },
      });
      const monday = nextDateOnWeekday(1, 7);
      await expect(
        listAvailableSlotsByStaff(tx, tenantId, {
          serviceTypeId: service.id,
          staffId: staff.staffProfile.id,
          rangeStart: monday,
          rangeEnd: addDays(monday, 1),
        })
      ).rejects.toThrow(BookingUnavailableError);
    });
  });

  it("produces one slot per service duration across a staff member's working hours", async () => {
    await runInSystemContext(async (tx) => {
      const staff = await createTestStaff(tx, tenantId, null, "s2");
      const service = await makeService(tx, 60);
      const monday = nextDateOnWeekday(1, 7);
      await tx.workingHours.create({
        data: { tenantId, staffProfileId: staff.staffProfile.id, dayOfWeek: 1, startMinute: 9 * 60, endMinute: 12 * 60 },
      });

      const slots = await listAvailableSlotsByStaff(tx, tenantId, {
        serviceTypeId: service.id,
        staffId: staff.staffProfile.id,
        rangeStart: monday,
        rangeEnd: addDays(monday, 1),
      });

      expect(slots.map((s) => s.start.getHours())).toEqual([9, 10, 11]);
      expect(slots.every((s) => s.staffId === staff.staffProfile.id)).toBe(true);
    });
  });

  it("excludes a slot that overlaps an existing appointment", async () => {
    await runInSystemContext(async (tx) => {
      const staff = await createTestStaff(tx, tenantId, null, "s3");
      const service = await makeService(tx, 60);
      const monday = nextDateOnWeekday(1, 7);
      await tx.workingHours.create({
        data: { tenantId, staffProfileId: staff.staffProfile.id, dayOfWeek: 1, startMinute: 9 * 60, endMinute: 12 * 60 },
      });
      const tenOClock = addMinutes(monday, 10 * 60);
      await createAppointment(tx, tenantId, {
        staffId: staff.staffProfile.id,
        clientId: null,
        startTime: tenOClock,
        endTime: addMinutes(tenOClock, 60),
        createdByUserId: staff.user.id,
        source: "ADMIN",
      });

      const slots = await listAvailableSlotsByStaff(tx, tenantId, {
        serviceTypeId: service.id,
        staffId: staff.staffProfile.id,
        rangeStart: monday,
        rangeEnd: addDays(monday, 1),
      });

      expect(slots.map((s) => s.start.getHours())).toEqual([9, 11]);
    });
  });

  it("excludes a staff member who is on approved time off", async () => {
    await runInSystemContext(async (tx) => {
      const staff = await createTestStaff(tx, tenantId, null, "s4");
      const service = await makeService(tx, 60);
      const monday = nextDateOnWeekday(1, 7);
      await tx.workingHours.create({
        data: { tenantId, staffProfileId: staff.staffProfile.id, dayOfWeek: 1, startMinute: 9 * 60, endMinute: 12 * 60 },
      });
      const leave = await requestTimeOff(tx, tenantId, {
        staffProfileId: staff.staffProfile.id,
        requestedByUserId: staff.user.id,
        startTime: monday,
        endTime: addDays(monday, 1),
      });
      await reviewTimeOff(tx, leave.id, staff.user.id, "APPROVED");

      const slots = await listAvailableSlotsByStaff(tx, tenantId, {
        serviceTypeId: service.id,
        staffId: staff.staffProfile.id,
        rangeStart: monday,
        rangeEnd: addDays(monday, 1),
      });

      expect(slots).toEqual([]);
    });
  });

  it("excludes a slot that overlaps a tenant-wide blocked time span", async () => {
    await runInSystemContext(async (tx) => {
      const staff = await createTestStaff(tx, tenantId, null, "s5");
      const service = await makeService(tx, 60);
      const monday = nextDateOnWeekday(1, 7);
      await tx.workingHours.create({
        data: { tenantId, staffProfileId: staff.staffProfile.id, dayOfWeek: 1, startMinute: 9 * 60, endMinute: 12 * 60 },
      });
      const elevenOClock = addMinutes(monday, 11 * 60);
      await tx.blockedTime.create({
        data: { tenantId, startTime: elevenOClock, endTime: addMinutes(elevenOClock, 30) },
      });

      const slots = await listAvailableSlotsByStaff(tx, tenantId, {
        serviceTypeId: service.id,
        staffId: staff.staffProfile.id,
        rangeStart: monday,
        rangeEnd: addDays(monday, 1),
      });

      expect(slots.map((s) => s.start.getHours())).toEqual([9, 10]);
    });
  });

  it("pads around an existing appointment by the staff member's buffer minutes", async () => {
    await runInSystemContext(async (tx) => {
      const staff = await createTestStaff(tx, tenantId, null, "s6");
      await tx.staffProfile.update({ where: { id: staff.staffProfile.id }, data: { bufferMinutes: 15 } });
      const service = await makeService(tx, 30);
      const monday = nextDateOnWeekday(1, 7);
      await tx.workingHours.create({
        data: { tenantId, staffProfileId: staff.staffProfile.id, dayOfWeek: 1, startMinute: 9 * 60, endMinute: 11 * 60 },
      });
      const tenOClock = addMinutes(monday, 10 * 60);
      await createAppointment(tx, tenantId, {
        staffId: staff.staffProfile.id,
        clientId: null,
        startTime: tenOClock,
        endTime: addMinutes(tenOClock, 30),
        createdByUserId: staff.user.id,
        source: "ADMIN",
      });

      const slots = await listAvailableSlotsByStaff(tx, tenantId, {
        serviceTypeId: service.id,
        staffId: staff.staffProfile.id,
        rangeStart: monday,
        rangeEnd: addDays(monday, 1),
      });

      // 30-min slots from 9:00-11:00 are 9:00, 9:30, 10:00, 10:30. The 15-min
      // buffer on each side of the 10:00-10:30 appointment extends the
      // blocked window to 9:45-10:45, which also catches the 9:30 and 10:30
      // slots - only 9:00 survives.
      expect(slots.map((s) => `${s.start.getHours()}:${s.start.getMinutes()}`)).toEqual(["9:0"]);
    });
  });

  it("excludes a day that's an enabled, blocked holiday", async () => {
    await runInSystemContext(async (tx) => {
      const staff = await createTestStaff(tx, tenantId, null, "s7");
      const service = await makeService(tx, 60);
      // Christmas Day is a fixed Dec 25 date, always in DEFAULT_ENABLED_HOLIDAY_NAMES.
      const year = new Date().getFullYear() + 1;
      const christmas = new Date(year, 11, 25);
      await tx.tenant.update({ where: { id: tenantId }, data: { blockedHolidayNames: ["Christmas Day"] } });
      await tx.workingHours.create({
        data: {
          tenantId,
          staffProfileId: staff.staffProfile.id,
          dayOfWeek: christmas.getDay(),
          startMinute: 9 * 60,
          endMinute: 12 * 60,
        },
      });

      const slots = await listAvailableSlotsByStaff(tx, tenantId, {
        serviceTypeId: service.id,
        staffId: staff.staffProfile.id,
        rangeStart: christmas,
        rangeEnd: addDays(christmas, 1),
      });

      expect(slots).toEqual([]);
    });
  });

  it("collapseForDisplay shows one entry per start time across multiple 'any available' staff", async () => {
    // Isolated in its own tenant - "any available" (no staffId) scans every
    // staff member in the tenant with working hours, which would otherwise
    // also pick up every other staff fixture already created earlier in this
    // shared describe block's tenantId.
    await runInSystemContext(async (tx) => {
      const tenant = await createTestTenant(tx, "avail-any");
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { publicBookingEnabled: true, publicBookingMinNoticeMinutes: 0, publicBookingWindowDays: 365 },
      });
      const staffA = await createTestStaff(tx, tenant.id, null, "s8a");
      const staffB = await createTestStaff(tx, tenant.id, null, "s8b");
      const service = await makeService(tx, 60, tenant.id);
      const monday = nextDateOnWeekday(1, 7);
      await tx.workingHours.createMany({
        data: [
          { tenantId: tenant.id, staffProfileId: staffA.staffProfile.id, dayOfWeek: 1, startMinute: 9 * 60, endMinute: 10 * 60 },
          { tenantId: tenant.id, staffProfileId: staffB.staffProfile.id, dayOfWeek: 1, startMinute: 9 * 60, endMinute: 10 * 60 },
        ],
      });

      const slots = await listAvailableSlotsByStaff(tx, tenant.id, {
        serviceTypeId: service.id,
        rangeStart: monday,
        rangeEnd: addDays(monday, 1),
      });
      expect(slots).toHaveLength(2);

      const collapsed = collapseForDisplay(slots);
      expect(collapsed).toHaveLength(1);

      await tx.appointment.deleteMany({ where: { tenantId: tenant.id } });
      await tx.workingHours.deleteMany({ where: { tenantId: tenant.id } });
      await tx.serviceType.deleteMany({ where: { tenantId: tenant.id } });
      await tx.staffProfile.deleteMany({ where: { tenantId: tenant.id } });
      await tx.user.deleteMany({ where: { tenantId: tenant.id } });
      await tx.license.deleteMany({ where: { tenantId: tenant.id } });
      await tx.tenant.delete({ where: { id: tenant.id } });
    });
  });

  it("drops slots outside the tenant's min-notice / booking-window bounds", async () => {
    await runInSystemContext(async (tx) => {
      const staff = await createTestStaff(tx, tenantId, null, "s9");
      const service = await makeService(tx, 60);
      const monday = nextDateOnWeekday(1, 7);
      await tx.workingHours.create({
        data: { tenantId, staffProfileId: staff.staffProfile.id, dayOfWeek: 1, startMinute: 9 * 60, endMinute: 12 * 60 },
      });

      // Shrink the booking window to end before `monday` entirely.
      await tx.tenant.update({ where: { id: tenantId }, data: { publicBookingWindowDays: 1 } });
      const slots = await listAvailableSlotsByStaff(tx, tenantId, {
        serviceTypeId: service.id,
        staffId: staff.staffProfile.id,
        rangeStart: monday,
        rangeEnd: addDays(monday, 1),
      });
      expect(slots).toEqual([]);

      // Restore for any later tests in this file.
      await tx.tenant.update({ where: { id: tenantId }, data: { publicBookingWindowDays: 365 } });
    });
  });
});
