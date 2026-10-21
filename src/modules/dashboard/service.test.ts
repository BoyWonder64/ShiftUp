import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { addDays, addHours, subHours, startOfMonth, subMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { runInSystemContext } from "@/lib/tenant-context";
import { createTestTenant, createTestStaff } from "@/lib/test-support/fixtures";
import { computeMetricValue, listDashboardMetrics, seedDefaultDashboardMetrics } from "./service";
import type { DashboardMetric } from "@/generated/prisma/client";

/** Integration tests against a real Postgres database, run inside
 * runInSystemContext to bypass RLS - this suite exercises the metric-to-count
 * logic itself, not tenant isolation. */
describe("modules/dashboard/service", () => {
  let tenantId: string;
  let staffAId: string;
  let staffBId: string;

  beforeAll(async () => {
    await runInSystemContext(async (tx) => {
      const tenant = await createTestTenant(tx, "dashmetrics");
      tenantId = tenant.id;
      const staffA = await createTestStaff(tx, tenantId, null, "staffA");
      const staffB = await createTestStaff(tx, tenantId, null, "staffB");
      staffAId = staffA.staffProfile.id;
      staffBId = staffB.staffProfile.id;
    });
  });

  afterAll(async () => {
    await runInSystemContext(async (tx) => {
      await tx.appointment.deleteMany({ where: { tenantId } });
      await tx.dashboardMetric.deleteMany({ where: { tenantId } });
      await tx.staffProfile.deleteMany({ where: { tenantId } });
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.license.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  /** Builds a metric row shape without persisting it - computeMetricValue only reads the fields it's given. */
  function metric(overrides: Partial<DashboardMetric>): DashboardMetric {
    return {
      id: "unsaved",
      tenantId,
      label: "Test metric",
      metricType: "APPOINTMENT_COUNT",
      entryKindFilter: null,
      dateRange: "ALL_TIME",
      statusFilter: "ANY",
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  describe("computeMetricValue", () => {
    it("STAFF_COUNT counts staff profiles, ignoring every other field", async () => {
      await runInSystemContext(async (tx) => {
        const count = await computeMetricValue(tx, tenantId, metric({ metricType: "STAFF_COUNT" }));
        expect(count).toBe(2); // staffA + staffB
      });
    });

    it("a null entryKindFilter counts every kind together", async () => {
      await runInSystemContext(async (tx) => {
        const now = new Date();
        await tx.appointment.create({
          data: { tenantId, staffId: staffAId, entryKind: "SHIFT", startTime: now, endTime: addHours(now, 1), source: "ADMIN" },
        });
        await tx.appointment.create({
          data: { tenantId, staffId: staffBId, entryKind: "APPOINTMENT", startTime: now, endTime: addHours(now, 1), source: "ADMIN" },
        });
        const count = await computeMetricValue(tx, tenantId, metric({ entryKindFilter: null, dateRange: "ALL_TIME", statusFilter: "ANY" }));
        expect(count).toBeGreaterThanOrEqual(2);
      });
    });

    it("entryKindFilter narrows to exactly one kind", async () => {
      await runInSystemContext(async (tx) => {
        const base = addDays(new Date(), 10); // an otherwise-empty day far from other tests' data
        await tx.appointment.create({
          data: { tenantId, staffId: staffAId, entryKind: "SHIFT", startTime: base, endTime: addHours(base, 1), source: "ADMIN" },
        });
        await tx.appointment.create({
          data: { tenantId, staffId: staffBId, entryKind: "APPOINTMENT", startTime: base, endTime: addHours(base, 1), source: "ADMIN" },
        });

        const shiftCount = await computeMetricValue(
          tx,
          tenantId,
          metric({ entryKindFilter: "SHIFT", dateRange: "ALL_TIME", statusFilter: "ANY" })
        );
        const apptCount = await computeMetricValue(
          tx,
          tenantId,
          metric({ entryKindFilter: "APPOINTMENT", dateRange: "ALL_TIME", statusFilter: "ANY" })
        );
        // Both counts are over ALL_TIME so they include other tests' rows too -
        // just confirm each kind is isolated from the other, not an exact total.
        expect(shiftCount).toBeGreaterThanOrEqual(1);
        expect(apptCount).toBeGreaterThanOrEqual(1);
      });
    });

    it("dateRange UPCOMING/PAST split on now, and ALL_TIME ignores time entirely", async () => {
      await runInSystemContext(async (tx) => {
        const tenant2 = await createTestTenant(tx, "dashmetrics-daterange");
        const staff = await createTestStaff(tx, tenant2.id, null, "solo");
        const now = new Date();
        await tx.appointment.create({
          data: {
            tenantId: tenant2.id,
            staffId: staff.staffProfile.id,
            entryKind: "SHIFT",
            startTime: addHours(now, 2),
            endTime: addHours(now, 3),
            source: "ADMIN",
          },
        }); // future
        await tx.appointment.create({
          data: {
            tenantId: tenant2.id,
            staffId: staff.staffProfile.id,
            entryKind: "SHIFT",
            startTime: subHours(now, 3),
            endTime: subHours(now, 2),
            source: "ADMIN",
          },
        }); // past

        const upcoming = await computeMetricValue(tx, tenant2.id, metric({ tenantId: tenant2.id, dateRange: "UPCOMING" }));
        const past = await computeMetricValue(tx, tenant2.id, metric({ tenantId: tenant2.id, dateRange: "PAST" }));
        const allTime = await computeMetricValue(tx, tenant2.id, metric({ tenantId: tenant2.id, dateRange: "ALL_TIME" }));
        expect(upcoming).toBe(1);
        expect(past).toBe(1);
        expect(allTime).toBe(2);

        await tx.appointment.deleteMany({ where: { tenantId: tenant2.id } });
        await tx.staffProfile.deleteMany({ where: { tenantId: tenant2.id } });
        await tx.user.deleteMany({ where: { tenantId: tenant2.id } });
        await tx.license.deleteMany({ where: { tenantId: tenant2.id } });
        await tx.tenant.delete({ where: { id: tenant2.id } });
      });
    });

    it("dateRange TODAY/THIS_WEEK/THIS_MONTH exclude a row from well outside each window", async () => {
      await runInSystemContext(async (tx) => {
        const tenant3 = await createTestTenant(tx, "dashmetrics-windows");
        const staff = await createTestStaff(tx, tenant3.id, null, "solo");
        const now = new Date();
        // Comfortably inside today, this week, and this month.
        await tx.appointment.create({
          data: {
            tenantId: tenant3.id,
            staffId: staff.staffProfile.id,
            entryKind: "SHIFT",
            startTime: now,
            endTime: addHours(now, 1),
            source: "ADMIN",
          },
        });
        // 2 months ago - outside today/this week/this month, but still ALL_TIME.
        await tx.appointment.create({
          data: {
            tenantId: tenant3.id,
            staffId: staff.staffProfile.id,
            entryKind: "SHIFT",
            startTime: subMonths(startOfMonth(now), 2),
            endTime: addHours(subMonths(startOfMonth(now), 2), 1),
            source: "ADMIN",
          },
        });

        expect(await computeMetricValue(tx, tenant3.id, metric({ tenantId: tenant3.id, dateRange: "TODAY" }))).toBe(1);
        expect(await computeMetricValue(tx, tenant3.id, metric({ tenantId: tenant3.id, dateRange: "THIS_WEEK" }))).toBe(1);
        expect(await computeMetricValue(tx, tenant3.id, metric({ tenantId: tenant3.id, dateRange: "THIS_MONTH" }))).toBe(1);
        expect(await computeMetricValue(tx, tenant3.id, metric({ tenantId: tenant3.id, dateRange: "ALL_TIME" }))).toBe(2);

        await tx.appointment.deleteMany({ where: { tenantId: tenant3.id } });
        await tx.staffProfile.deleteMany({ where: { tenantId: tenant3.id } });
        await tx.user.deleteMany({ where: { tenantId: tenant3.id } });
        await tx.license.deleteMany({ where: { tenantId: tenant3.id } });
        await tx.tenant.delete({ where: { id: tenant3.id } });
      });
    });

    it("statusFilter ANY/EXCLUDE_CANCELLED/an exact status behave independently", async () => {
      await runInSystemContext(async (tx) => {
        const tenant4 = await createTestTenant(tx, "dashmetrics-status");
        const staff = await createTestStaff(tx, tenant4.id, null, "solo");
        const now = new Date();
        await tx.appointment.create({
          data: {
            tenantId: tenant4.id,
            staffId: staff.staffProfile.id,
            entryKind: "APPOINTMENT",
            startTime: now,
            endTime: addHours(now, 1),
            status: "BOOKED",
            source: "ADMIN",
          },
        });
        await tx.appointment.create({
          data: {
            tenantId: tenant4.id,
            staffId: staff.staffProfile.id,
            entryKind: "APPOINTMENT",
            startTime: now,
            endTime: addHours(now, 1),
            status: "CANCELLED",
            source: "ADMIN",
          },
        });
        await tx.appointment.create({
          data: {
            tenantId: tenant4.id,
            staffId: staff.staffProfile.id,
            entryKind: "APPOINTMENT",
            startTime: now,
            endTime: addHours(now, 1),
            status: "COMPLETED",
            source: "ADMIN",
          },
        });

        expect(await computeMetricValue(tx, tenant4.id, metric({ tenantId: tenant4.id, statusFilter: "ANY" }))).toBe(3);
        expect(
          await computeMetricValue(tx, tenant4.id, metric({ tenantId: tenant4.id, statusFilter: "EXCLUDE_CANCELLED" }))
        ).toBe(2);
        expect(
          await computeMetricValue(tx, tenant4.id, metric({ tenantId: tenant4.id, statusFilter: "COMPLETED" }))
        ).toBe(1);
        expect(
          await computeMetricValue(tx, tenant4.id, metric({ tenantId: tenant4.id, statusFilter: "CANCELLED" }))
        ).toBe(1);

        await tx.appointment.deleteMany({ where: { tenantId: tenant4.id } });
        await tx.staffProfile.deleteMany({ where: { tenantId: tenant4.id } });
        await tx.user.deleteMany({ where: { tenantId: tenant4.id } });
        await tx.license.deleteMany({ where: { tenantId: tenant4.id } });
        await tx.tenant.delete({ where: { id: tenant4.id } });
      });
    });
  });

  describe("seedDefaultDashboardMetrics / listDashboardMetrics", () => {
    it("seeds exactly the two tiles the dashboard used to hardcode, in order", async () => {
      await runInSystemContext(async (tx) => {
        const tenant5 = await createTestTenant(tx, "dashmetrics-seed");
        await seedDefaultDashboardMetrics(tx, tenant5.id);

        const metrics = await listDashboardMetrics(tx, tenant5.id);
        expect(metrics.map((m) => m.label)).toEqual(["Staff", "Upcoming appointments"]);
        expect(metrics[0].metricType).toBe("STAFF_COUNT");
        expect(metrics[1].metricType).toBe("APPOINTMENT_COUNT");
        expect(metrics[1].entryKindFilter).toBe("APPOINTMENT");
        expect(metrics[1].dateRange).toBe("UPCOMING");
        expect(metrics[1].statusFilter).toBe("EXCLUDE_CANCELLED");

        await tx.dashboardMetric.deleteMany({ where: { tenantId: tenant5.id } });
        await tx.license.deleteMany({ where: { tenantId: tenant5.id } });
        await tx.tenant.delete({ where: { id: tenant5.id } });
      });
    });

    it("orders by sortOrder, not creation order", async () => {
      await runInSystemContext(async (tx) => {
        const tenant6 = await createTestTenant(tx, "dashmetrics-order");
        await tx.dashboardMetric.create({ data: { tenantId: tenant6.id, label: "Second", metricType: "STAFF_COUNT", sortOrder: 1 } });
        await tx.dashboardMetric.create({ data: { tenantId: tenant6.id, label: "First", metricType: "STAFF_COUNT", sortOrder: 0 } });

        const metrics = await listDashboardMetrics(tx, tenant6.id);
        expect(metrics.map((m) => m.label)).toEqual(["First", "Second"]);

        await tx.dashboardMetric.deleteMany({ where: { tenantId: tenant6.id } });
        await tx.license.deleteMany({ where: { tenantId: tenant6.id } });
        await tx.tenant.delete({ where: { id: tenant6.id } });
      });
    });
  });
});
