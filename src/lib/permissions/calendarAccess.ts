import type { Tx } from "@/lib/tenant-context";
import type { BillingPlan, LicenseTier } from "@/generated/prisma/client";
import { featuresForTier } from "@/lib/licensing/features";
import { hasPermission } from "@/lib/permissions/service";

export interface CustomCalendarNavEntry {
  id: string;
  name: string;
}

export interface CalendarNavAccess {
  appointments: boolean;
  shifts: boolean;
  // Every one of this tenant's named custom calendars this viewer can reach -
  // empty on a FREE plan or without VIEW_CUSTOM_CALENDAR, regardless of how
  // many the tenant has created (see CustomCalendar). Unlike
  // appointments/shifts there's no single on/off flag - a custom calendar's
  // existence is what makes it live.
  customCalendars: CustomCalendarNavEntry[];
  all: boolean;
}

/**
 * Whether this viewer, on this tenant, can reach each calendar page -
 * Appointments, Shifts, every named Custom calendar, and the combined All
 * view. Combines the gates each kind needs: the license tier even including
 * that module (appointments/shifts only - Custom isn't tied to a
 * LicenseTier), the tenant's own Settings > Calendars on/off toggle
 * (appointments/shifts only), the Custom calendars' paid-plan check, and the
 * relevant VIEW_* permission. Centralizes this so every page that renders
 * AppHeader's calendar nav computes it the same way, rather than re-deriving
 * the same logic in each one - same reasoning as the existing per-page
 * canViewRoster/canViewShiftReports convention.
 */
export async function getCalendarNavAccess(
  tx: Tx,
  tenantId: string,
  role: string,
  roleId: string | null,
  tenant: {
    appointmentsCalendarEnabled: boolean;
    shiftsCalendarEnabled: boolean;
  },
  licenseTier: LicenseTier,
  billingPlan: BillingPlan
): Promise<CalendarNavAccess> {
  const features = featuresForTier(licenseTier);
  const [canViewAppointments, canViewShifts, canViewCustom, canViewAll] = await Promise.all([
    hasPermission(tx, tenantId, role, roleId, "VIEW_APPOINTMENTS"),
    hasPermission(tx, tenantId, role, roleId, "VIEW_SHIFTS"),
    hasPermission(tx, tenantId, role, roleId, "VIEW_CUSTOM_CALENDAR"),
    hasPermission(tx, tenantId, role, roleId, "VIEW_CALENDAR_TOGGLE"),
  ]);

  const appointments = features.appointmentManager && tenant.appointmentsCalendarEnabled && canViewAppointments;
  const shifts = features.shiftManagement && tenant.shiftsCalendarEnabled && canViewShifts;
  const customCalendars =
    canViewCustom && billingPlan !== "FREE"
      ? await tx.customCalendar.findMany({
          where: { tenantId },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true },
        })
      : [];
  // "All" is only worth reaching if there's actually more than one kind
  // enabled to combine - with just one (or zero) it would be a redundant
  // copy of a page that already exists (or an empty page). Having any
  // custom calendars at all counts as one kind here, same as the
  // appointments/shifts booleans - which specific ones doesn't matter for
  // this count.
  const enabledCount = [appointments, shifts, customCalendars.length > 0].filter(Boolean).length;
  const all = canViewAll && enabledCount >= 2;

  return { appointments, shifts, customCalendars, all };
}
