import { addDays, startOfDay, startOfWeek, addWeeks, startOfMonth, addMonths } from "date-fns";
import type { Tx } from "@/lib/tenant-context";
import type { DashboardMetric, Prisma } from "@/generated/prisma/client";

/**
 * Settings > Dashboard - a tenant's fully custom set of dashboard stat
 * tiles (replaces the old two hardcoded ones, "Staff"/"Upcoming
 * appointments" - see seedDefaultDashboardMetrics for how those became the
 * first two rows instead). Each DashboardMetric row describes what to count;
 * this module is the only place that turns one into an actual number.
 */

function dateRangeWhere(dateRange: DashboardMetric["dateRange"], now: Date): Prisma.AppointmentWhereInput {
  // weekStartsOn: 0 (Sunday) matches findCoverageCandidates' convention
  // elsewhere in the scheduling module - kept consistent rather than
  // defaulting to date-fns' Monday-start.
  switch (dateRange) {
    case "ALL_TIME":
      return {};
    case "UPCOMING":
      return { startTime: { gte: now } };
    case "PAST":
      return { startTime: { lt: now } };
    case "TODAY": {
      const start = startOfDay(now);
      return { startTime: { gte: start, lt: addDays(start, 1) } };
    }
    case "THIS_WEEK": {
      const start = startOfWeek(now, { weekStartsOn: 0 });
      return { startTime: { gte: start, lt: addWeeks(start, 1) } };
    }
    case "THIS_MONTH": {
      const start = startOfMonth(now);
      return { startTime: { gte: start, lt: addMonths(start, 1) } };
    }
  }
}

function statusWhere(statusFilter: DashboardMetric["statusFilter"]): Prisma.AppointmentWhereInput {
  switch (statusFilter) {
    case "ANY":
      return {};
    case "EXCLUDE_CANCELLED":
      return { status: { not: "CANCELLED" } };
    default:
      // PENDING_PAYMENT | BOOKED | COMPLETED | CANCELLED | NO_SHOW - an
      // exact single-status match, distinct from EXCLUDE_CANCELLED above.
      return { status: statusFilter };
  }
}

/** Turns one DashboardMetric row into the actual count it currently represents. STAFF_COUNT ignores every filter field (nothing to narrow a headcount by yet). */
export async function computeMetricValue(tx: Tx, tenantId: string, metric: DashboardMetric): Promise<number> {
  if (metric.metricType === "STAFF_COUNT") {
    return tx.staffProfile.count({ where: { tenantId } });
  }
  const now = new Date();
  return tx.appointment.count({
    where: {
      tenantId,
      ...(metric.entryKindFilter ? { entryKind: metric.entryKindFilter } : {}),
      ...dateRangeWhere(metric.dateRange, now),
      ...statusWhere(metric.statusFilter),
    },
  });
}

export async function listDashboardMetrics(tx: Tx, tenantId: string) {
  return tx.dashboardMetric.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** Same role seedDefaultRolesForTenant plays at signup - gives a brand-new tenant the same two tiles the dashboard used to hardcode, as real editable/removable rows instead. */
export async function seedDefaultDashboardMetrics(tx: Tx, tenantId: string): Promise<void> {
  await tx.dashboardMetric.createMany({
    data: [
      { tenantId, label: "Staff", metricType: "STAFF_COUNT", sortOrder: 0 },
      {
        tenantId,
        label: "Upcoming appointments",
        metricType: "APPOINTMENT_COUNT",
        entryKindFilter: "APPOINTMENT",
        dateRange: "UPCOMING",
        statusFilter: "EXCLUDE_CANCELLED",
        sortOrder: 1,
      },
    ],
  });
}
