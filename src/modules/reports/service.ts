import type { Tx } from "@/lib/tenant-context";
import { withMergedServiceType } from "@/modules/scheduling/service";

/**
 * ISSUES.md #4 - the manager no-show/shift reporting dashboard. Deliberately
 * tenant-wide for whoever holds VIEW_SHIFT_REPORTS, not scoped by
 * VIEW_ALL_SHIFTS/VIEW_ALL_APPOINTMENTS/own-staff-id the way the regular
 * calendar (listAppointmentsInRange) is - this is an explicitly
 * manager-facing aggregate view with its own dedicated permission, per the
 * design signed off in ISSUES.md, so it never narrows to "your own" the way
 * the main calendar does for a viewer lacking those permissions.
 */
export interface ReportFilters {
  start: Date;
  end: Date;
  status?: "BOOKED" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | "PENDING_PAYMENT";
  staffId?: string;
  /** Matches either AppointmentServiceType or ShiftServiceType - a caller doesn't need to know which table a given id lives in (ISSUES.md #1). */
  serviceTypeId?: string;
}

export async function listEventsForReport(tx: Tx, tenantId: string, filters: ReportFilters) {
  const rows = await tx.appointment.findMany({
    where: {
      tenantId,
      startTime: { lt: filters.end },
      endTime: { gt: filters.start },
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.staffId ? { staffId: filters.staffId } : {}),
      ...(filters.serviceTypeId
        ? {
            OR: [
              { appointmentServiceTypeId: filters.serviceTypeId },
              { shiftServiceTypeId: filters.serviceTypeId },
            ],
          }
        : {}),
    },
    include: { client: true, appointmentServiceType: true, shiftServiceType: true, staff: true, tag: true },
    orderBy: { startTime: "asc" },
  });
  return rows.map(withMergedServiceType);
}
