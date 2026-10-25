import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runInSystemContext } from "@/lib/tenant-context";
import { createTestTenant, createTestRole } from "@/lib/test-support/fixtures";
import { setRolePermission } from "./service";
import { getCalendarNavAccess } from "./calendarAccess";

/** Integration tests against a real Postgres database, run inside
 * runInSystemContext to bypass RLS - this suite exercises the calendar-nav
 * access logic itself (license tier + Settings toggle + VIEW_* permission
 * combinations), not tenant isolation. */
describe("permissions/calendarAccess", () => {
  let tenantId: string;

  beforeAll(async () => {
    await runInSystemContext(async (tx) => {
      // createTestTenant seeds a FREE/BOTH license and leaves
      // appointmentsCalendarEnabled/shiftsCalendarEnabled at their schema
      // defaults (both true).
      tenantId = (await createTestTenant(tx, "calaccess")).id;
    });
  });

  afterAll(async () => {
    await runInSystemContext(async (tx) => {
      await tx.customCalendar.deleteMany({ where: { tenantId } });
      await tx.role.deleteMany({ where: { tenantId } });
      await tx.license.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  it("ADMIN sees Appointments/Shifts on a BOTH-tier, both-enabled tenant, and 'all' is reachable", async () => {
    await runInSystemContext(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const access = await getCalendarNavAccess(tx, tenantId, "ADMIN", null, tenant, "BOTH");
      expect(access.appointments).toBe(true);
      expect(access.shifts).toBe(true);
      expect(access.customCalendars).toEqual([]);
      // 2 kinds enabled (appointments + shifts) - "all" is reachable.
      expect(access.all).toBe(true);
    });
  });

  it("a license tier missing a module hides that calendar regardless of the tenant toggle", async () => {
    await runInSystemContext(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const access = await getCalendarNavAccess(tx, tenantId, "ADMIN", null, tenant, "SHIFT_MANAGEMENT");
      expect(access.appointments).toBe(false);
      expect(access.shifts).toBe(true);
      // Only 1 kind enabled now - "all" would be redundant.
      expect(access.all).toBe(false);
    });
  });

  it("the tenant's own on/off toggle hides a calendar even when the license tier includes it", async () => {
    await runInSystemContext(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { shiftsCalendarEnabled: false } });
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const access = await getCalendarNavAccess(tx, tenantId, "ADMIN", null, tenant, "BOTH");
      expect(access.shifts).toBe(false);
      expect(access.appointments).toBe(true);
      await tx.tenant.update({ where: { id: tenantId }, data: { shiftsCalendarEnabled: true } }); // revert
    });
  });

  it("custom calendars are listed for anyone holding VIEW_CUSTOM_CALENDAR, free on every plan", async () => {
    await runInSystemContext(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      await tx.customCalendar.create({ data: { tenantId, name: "Z Calendar", sortOrder: 1 } });
      await tx.customCalendar.create({ data: { tenantId, name: "A Calendar", sortOrder: 0 } });

      const access = await getCalendarNavAccess(tx, tenantId, "ADMIN", null, tenant, "BOTH");
      // Ordered by sortOrder, not creation order.
      expect(access.customCalendars.map((c) => c.name)).toEqual(["A Calendar", "Z Calendar"]);
      // 3 kinds enabled now (appointments + shifts + custom) - still just "reachable", not additive.
      expect(access.all).toBe(true);
    });
  });

  it("a STAFF role without VIEW_CUSTOM_CALENDAR sees no custom calendars even though some exist", async () => {
    await runInSystemContext(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const role = await createTestRole(tx, tenantId, "NoCustomView");
      await setRolePermission(tx, tenantId, role.id, "VIEW_APPOINTMENTS", true);
      await setRolePermission(tx, tenantId, role.id, "VIEW_SHIFTS", true);
      // Deliberately not granting VIEW_CUSTOM_CALENDAR.

      const access = await getCalendarNavAccess(tx, tenantId, "STAFF", role.id, tenant, "BOTH");
      expect(access.customCalendars).toEqual([]);
      expect(access.appointments).toBe(true);
      expect(access.shifts).toBe(true);
    });
  });

  it("a STAFF role only holding one VIEW_* permission sees only that one calendar, and 'all' is unreachable without VIEW_CALENDAR_TOGGLE", async () => {
    await runInSystemContext(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const role = await createTestRole(tx, tenantId, "AppointmentsOnly");
      await setRolePermission(tx, tenantId, role.id, "VIEW_APPOINTMENTS", true);
      // VIEW_SHIFTS, VIEW_CUSTOM_CALENDAR, and VIEW_CALENDAR_TOGGLE all left ungranted.

      const access = await getCalendarNavAccess(tx, tenantId, "STAFF", role.id, tenant, "BOTH");
      expect(access.appointments).toBe(true);
      expect(access.shifts).toBe(false);
      expect(access.customCalendars).toEqual([]);
      // Even though appointments+shifts are both tier/toggle-enabled, this
      // role can only see appointments, and lacks VIEW_CALENDAR_TOGGLE besides.
      expect(access.all).toBe(false);
    });
  });
});
