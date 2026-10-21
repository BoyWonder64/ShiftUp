import { startOfWeek, endOfWeek } from "date-fns";
import type { Tx } from "@/lib/tenant-context";
import { staffOnApprovedLeave } from "@/modules/timeoff/service";

/** Thrown when a create/reschedule would overlap another appointment for the same staff member. */
export class SchedulingConflictError extends Error {
  constructor() {
    super("That time overlaps another appointment for this staff member.");
    this.name = "SchedulingConflictError";
  }
}

/**
 * True if the error is a Postgres exclusion-constraint violation from
 * appointments_no_overlapping_staff_time (see the add_phase1_scheduling_and_permissions
 * migration). Prisma doesn't have a dedicated error code for EXCLUDE
 * constraints the way it does for unique/FK constraints, so this checks the
 * underlying Postgres error code (23P01) and the constraint name directly.
 */
function isOverlapConstraintViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { code?: string; meta?: { code?: string }; message?: string };
  const pgCode = anyErr.meta?.code ?? anyErr.code;
  if (pgCode === "23P01") return true;
  return typeof anyErr.message === "string" && anyErr.message.includes("appointments_no_overlapping_staff_time");
}

/**
 * The DB's appointments_no_overlapping_staff_time EXCLUDE constraint (see the
 * add_phase1_scheduling_and_permissions and add_allow_overlapping_shifts
 * migrations) only ever fires for rows with a client attached - any
 * clientless row (a SHIFT, or a CUSTOM entry with no client - see entryKind)
 * is never blocked by Postgres, so this app-level check stands in for it
 * whenever clientId is null, regardless of kind. Only a SHIFT gets the
 * tenant's Settings > "Shift form" "allow overlapping shifts" escape hatch -
 * a clientless CUSTOM entry always stays enforced, since there's no
 * equivalent tenant setting for it. Known gap: this is a plain
 * read-then-write check inside the same transaction, not a DB-level
 * guarantee, so two concurrent requests creating overlapping entries for the
 * same staff member at the same instant could both slip through - acceptable
 * at this app's scale, same tradeoff as assertCanAddAppointment's plan-limit
 * check.
 */
async function assertOverlapAllowedForClientlessEntry(
  tx: Tx,
  tenantId: string,
  staffId: string,
  startTime: Date,
  endTime: Date,
  entryKind: "SHIFT" | "APPOINTMENT" | "CUSTOM",
  excludeId?: string
) {
  if (entryKind === "SHIFT") {
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { allowOverlappingShifts: true },
    });
    if (tenant.allowOverlappingShifts) return;
  }

  const conflict = await tx.appointment.findFirst({
    where: {
      staffId,
      status: { not: "CANCELLED" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { id: true },
  });
  if (conflict) throw new SchedulingConflictError();
}

export interface CreateAppointmentInput {
  staffId: string;
  entryKind: "SHIFT" | "APPOINTMENT" | "CUSTOM";
  /** Required (by the API route, not here) when entryKind is CUSTOM - which named CustomCalendar this entry belongs to. Ignored otherwise. */
  customCalendarId?: string | null;
  clientId?: string | null;
  serviceTypeId?: string | null;
  startTime: Date;
  endTime: Date;
  priceCharged?: number | null;
  estimatedDurationMinutes?: number | null;
  estimatedValue?: number | null;
  locationType?: "IN_PERSON" | "ONLINE";
  location?: string | null;
  tagId?: string | null;
  colorKey?: string | null;
  /** Null only for a public self-service booking (source: SELF_SERVICE) - no authenticated session to attribute it to. */
  createdByUserId: string | null;
  source: "SELF_SERVICE" | "ADMIN";
}

export async function createAppointment(tx: Tx, tenantId: string, input: CreateAppointmentInput) {
  if (input.endTime <= input.startTime) {
    throw new Error("endTime must be after startTime");
  }
  // A clientless row (SHIFT, or a clientless CUSTOM entry) is never covered
  // by the DB constraint (see assertOverlapAllowedForClientlessEntry), so
  // check explicitly here. A row with a client (APPOINTMENT, or a CUSTOM
  // entry with a client) always stays DB-enforced below.
  if (!input.clientId) {
    await assertOverlapAllowedForClientlessEntry(
      tx,
      tenantId,
      input.staffId,
      input.startTime,
      input.endTime,
      input.entryKind
    );
  }
  try {
    return await tx.appointment.create({
      data: {
        tenantId,
        staffId: input.staffId,
        entryKind: input.entryKind,
        customCalendarId: input.entryKind === "CUSTOM" ? (input.customCalendarId ?? null) : null,
        clientId: input.clientId ?? null,
        // A single incoming serviceTypeId is routed to whichever table
        // actually matches this row's kind (ISSUES.md #1) - APPOINTMENT
        // picks from AppointmentServiceType, SHIFT and CUSTOM (no third
        // ServiceType table - see the schema's entryKind doc comment) from
        // ShiftServiceType. Never both.
        ...(input.entryKind === "APPOINTMENT"
          ? { appointmentServiceTypeId: input.serviceTypeId ?? null }
          : { shiftServiceTypeId: input.serviceTypeId ?? null }),
        startTime: input.startTime,
        endTime: input.endTime,
        priceCharged: input.priceCharged ?? null,
        estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
        estimatedValue: input.estimatedValue ?? null,
        locationType: input.locationType ?? "IN_PERSON",
        location: input.location ?? null,
        tagId: input.tagId ?? null,
        colorKey: input.colorKey ?? null,
        createdByUserId: input.createdByUserId,
        source: input.source,
      },
    });
  } catch (err) {
    if (isOverlapConstraintViolation(err)) throw new SchedulingConflictError();
    throw err;
  }
}

export interface RescheduleInput {
  id: string;
  startTime: Date;
  endTime: Date;
}

/** Used for both a drag (time shift) and a resize (duration change) on the calendar - both are just a new [startTime, endTime). */
export async function rescheduleAppointment(tx: Tx, tenantId: string, { id, startTime, endTime }: RescheduleInput) {
  if (endTime <= startTime) {
    throw new Error("endTime must be after startTime");
  }
  const existing = await tx.appointment.findUniqueOrThrow({
    where: { id },
    select: { staffId: true, clientId: true, entryKind: true },
  });
  if (!existing.clientId) {
    await assertOverlapAllowedForClientlessEntry(tx, tenantId, existing.staffId, startTime, endTime, existing.entryKind, id);
  }
  try {
    return await tx.appointment.update({
      where: { id },
      data: { startTime, endTime },
    });
  } catch (err) {
    if (isOverlapConstraintViolation(err)) throw new SchedulingConflictError();
    throw err;
  }
}

export async function cancelAppointment(tx: Tx, id: string) {
  return tx.appointment.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
}

/** Reassigns a shift/appointment to a different staff member - goes through the same EXCLUDE-constraint-checked path as any other write. */
export async function reassignAppointmentStaff(tx: Tx, tenantId: string, id: string, staffId: string) {
  const existing = await tx.appointment.findUniqueOrThrow({
    where: { id },
    select: { startTime: true, endTime: true, clientId: true, entryKind: true },
  });
  if (!existing.clientId) {
    await assertOverlapAllowedForClientlessEntry(tx, tenantId, staffId, existing.startTime, existing.endTime, existing.entryKind, id);
  }
  try {
    return await tx.appointment.update({ where: { id }, data: { staffId } });
  } catch (err) {
    if (isOverlapConstraintViolation(err)) throw new SchedulingConflictError();
    throw err;
  }
}

export interface CoverageCandidate {
  staffId: string;
  displayName: string;
  hoursThisWeek: number;
}

/**
 * Who could cover this shift: not the current assignee, not already booked
 * over that time, not on approved leave - sorted by hours already scheduled
 * this week (ascending) so the manager sees the least-loaded, lowest
 * overtime-risk option first. "This week" = the calendar week (Sun-Sat)
 * containing the shift, matching the FLSA's standard overtime accounting
 * unit rather than a tenant-specific pay period (not configurable yet).
 */
export async function findCoverageCandidates(
  tx: Tx,
  tenantId: string,
  appointmentId: string
): Promise<CoverageCandidate[]> {
  const target = await tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } });

  const allStaff = await tx.staffProfile.findMany({
    where: { tenantId },
    select: { id: true, displayName: true },
  });

  const overlapping = await tx.appointment.findMany({
    where: {
      tenantId,
      id: { not: appointmentId },
      status: { not: "CANCELLED" },
      startTime: { lt: target.endTime },
      endTime: { gt: target.startTime },
    },
    select: { staffId: true },
  });
  const busyStaffIds = new Set(overlapping.map((o) => o.staffId));

  const onLeave = await staffOnApprovedLeave(tx, { start: target.startTime, end: target.endTime });

  const weekStart = startOfWeek(target.startTime, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(target.startTime, { weekStartsOn: 0 });

  const candidates: CoverageCandidate[] = [];
  for (const staff of allStaff) {
    if (staff.id === target.staffId) continue;
    if (busyStaffIds.has(staff.id)) continue;
    if (onLeave.has(staff.id)) continue;

    const weekAppointments = await tx.appointment.findMany({
      where: {
        staffId: staff.id,
        status: { not: "CANCELLED" },
        startTime: { lt: weekEnd },
        endTime: { gt: weekStart },
      },
      select: { startTime: true, endTime: true },
    });
    const hoursThisWeek = weekAppointments.reduce(
      (sum, a) => sum + (a.endTime.getTime() - a.startTime.getTime()) / 3_600_000,
      0
    );

    candidates.push({
      staffId: staff.id,
      displayName: staff.displayName,
      hoursThisWeek: Math.round(hoursThisWeek * 10) / 10,
    });
  }

  candidates.sort((a, b) => a.hoursThisWeek - b.hoursThisWeek);
  return candidates;
}

/**
 * `visibility` implements the VIEW_ALL_SHIFTS/VIEW_ALL_APPOINTMENTS permission
 * split, keyed on `entryKind` rather than clientId presence (a CUSTOM entry
 * can have a client or not, so clientId alone can no longer tell a shift
 * apart from a custom entry - see the schema's entryKind doc comment): each
 * axis is allowed through independently, and whatever's left over is only
 * shown if it belongs to `ownStaffId`. CUSTOM entries have no separate
 * "all vs. own" permission of their own yet - `canViewCustom` alone grants
 * seeing every custom entry, same as the all-* axes do for shifts/
 * appointments. Passing `undefined` (the coverage-finder caller) keeps the
 * old "see everything" behavior, since that's an internal staffing
 * computation, not a viewer-facing listing.
 *
 * `canViewShifts`/`canViewAppointments`/`canViewCustom` implement the
 * separate VIEW_SHIFTS/VIEW_APPOINTMENTS/VIEW_CUSTOM_CALENDAR permission
 * split (ISSUES.md #6): unlike the all/own axes above, these are a hard
 * type-level gate, ANDed in rather than OR'd - a role lacking VIEW_SHIFTS
 * never sees a shift row at all, not even its own.
 */
export interface AppointmentVisibility {
  allShifts: boolean;
  allAppointments: boolean;
  ownStaffId: string | null;
  canViewShifts: boolean;
  canViewAppointments: boolean;
  canViewCustom: boolean;
}

/**
 * Exactly one of appointmentServiceType(Id)/shiftServiceType(Id) is ever set
 * on a row (ISSUES.md #1 - see the schema doc comment) - this merges them
 * back into the single serviceTypeId/serviceType shape the rest of the app
 * (API responses, SchedulingCalendar.tsx) reads, so callers don't need to
 * know which of the two tables a given row's job type actually came from.
 */
export function withMergedServiceType<
  T extends {
    appointmentServiceTypeId: string | null;
    shiftServiceTypeId: string | null;
    appointmentServiceType: unknown;
    shiftServiceType: unknown;
  },
>(row: T) {
  return {
    ...row,
    serviceTypeId: row.appointmentServiceTypeId ?? row.shiftServiceTypeId,
    serviceType: row.appointmentServiceType ?? row.shiftServiceType,
  };
}

export async function listAppointmentsInRange(
  tx: Tx,
  tenantId: string,
  range: { start: Date; end: Date },
  visibility?: AppointmentVisibility
) {
  const visibilityFilter = visibility
    ? {
        AND: [
          {
            OR: [
              ...(visibility.canViewShifts ? [{ entryKind: "SHIFT" as const }] : []),
              ...(visibility.canViewAppointments ? [{ entryKind: "APPOINTMENT" as const }] : []),
              ...(visibility.canViewCustom ? [{ entryKind: "CUSTOM" as const }] : []),
            ],
          },
          {
            OR: [
              ...(visibility.allShifts ? [{ entryKind: "SHIFT" as const }] : []),
              ...(visibility.allAppointments ? [{ entryKind: "APPOINTMENT" as const }] : []),
              // No separate "view all custom entries" permission exists yet -
              // canViewCustom alone grants seeing every custom entry.
              ...(visibility.canViewCustom ? [{ entryKind: "CUSTOM" as const }] : []),
              ...(visibility.ownStaffId ? [{ staffId: visibility.ownStaffId }] : []),
            ],
          },
        ],
      }
    : {};

  const rows = await tx.appointment.findMany({
    where: {
      tenantId,
      startTime: { lt: range.end },
      endTime: { gt: range.start },
      ...visibilityFilter,
    },
    include: { client: true, appointmentServiceType: true, shiftServiceType: true, staff: true, tag: true, customCalendar: { select: { id: true, name: true } } },
    orderBy: { startTime: "asc" },
  });
  return rows.map(withMergedServiceType);
}

export async function getAppointmentById(tx: Tx, id: string) {
  const row = await tx.appointment.findUnique({
    where: { id },
    include: { client: true, appointmentServiceType: true, shiftServiceType: true, staff: true, tag: true, customCalendar: { select: { id: true, name: true } } },
  });
  return row ? withMergedServiceType(row) : null;
}
