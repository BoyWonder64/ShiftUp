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
 * migrations) only ever fires for rows with a client attached - a shift
 * (clientId null) is never blocked by Postgres, so whether a staff member's
 * shifts may overlap is enforced here instead, gated on the tenant's
 * Settings > "Shift form" toggle. Known gap: this is a plain read-then-write
 * check inside the same transaction, not a DB-level guarantee, so two
 * concurrent requests creating overlapping shifts for the same staff member
 * at the same instant could both slip through - acceptable at this app's
 * scale, same tradeoff as assertCanAddAppointment's plan-limit check.
 */
async function assertShiftOverlapAllowed(
  tx: Tx,
  tenantId: string,
  staffId: string,
  startTime: Date,
  endTime: Date,
  excludeId?: string
) {
  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { allowOverlappingShifts: true },
  });
  if (tenant.allowOverlappingShifts) return;

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
  createdByUserId: string;
  source: "SELF_SERVICE" | "ADMIN";
}

export async function createAppointment(tx: Tx, tenantId: string, input: CreateAppointmentInput) {
  if (input.endTime <= input.startTime) {
    throw new Error("endTime must be after startTime");
  }
  // A shift is an Appointment row with no clientId - the DB constraint never
  // covers these (see assertShiftOverlapAllowed), so check explicitly here.
  // A real appointment (clientId set) always stays DB-enforced below.
  if (!input.clientId) {
    await assertShiftOverlapAllowed(tx, tenantId, input.staffId, input.startTime, input.endTime);
  }
  try {
    return await tx.appointment.create({
      data: {
        tenantId,
        staffId: input.staffId,
        clientId: input.clientId ?? null,
        serviceTypeId: input.serviceTypeId ?? null,
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
    select: { staffId: true, clientId: true },
  });
  if (!existing.clientId) {
    await assertShiftOverlapAllowed(tx, tenantId, existing.staffId, startTime, endTime, id);
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
    select: { startTime: true, endTime: true, clientId: true },
  });
  if (!existing.clientId) {
    await assertShiftOverlapAllowed(tx, tenantId, staffId, existing.startTime, existing.endTime, id);
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
 * split: a shift is an Appointment row with `clientId: null`, an appointment
 * has one set - each axis is allowed through independently, and whatever's
 * left over is only shown if it belongs to `ownStaffId`. Passing `undefined`
 * (the coverage-finder caller) keeps the old "see everything" behavior, since
 * that's an internal staffing computation, not a viewer-facing listing.
 *
 * `canViewShifts`/`canViewAppointments` implement the separate VIEW_SHIFTS/
 * VIEW_APPOINTMENTS permission split (ISSUES.md #6): unlike the all/own axes
 * above, these are a hard type-level gate, ANDed in rather than OR'd - a role
 * lacking VIEW_SHIFTS never sees a shift row at all, not even its own.
 */
export interface AppointmentVisibility {
  allShifts: boolean;
  allAppointments: boolean;
  ownStaffId: string | null;
  canViewShifts: boolean;
  canViewAppointments: boolean;
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
              ...(visibility.canViewShifts ? [{ clientId: null }] : []),
              ...(visibility.canViewAppointments ? [{ clientId: { not: null } }] : []),
            ],
          },
          {
            OR: [
              ...(visibility.allShifts ? [{ clientId: null }] : []),
              ...(visibility.allAppointments ? [{ clientId: { not: null } }] : []),
              ...(visibility.ownStaffId ? [{ staffId: visibility.ownStaffId }] : []),
            ],
          },
        ],
      }
    : {};

  return tx.appointment.findMany({
    where: {
      tenantId,
      startTime: { lt: range.end },
      endTime: { gt: range.start },
      ...visibilityFilter,
    },
    include: { client: true, serviceType: true, staff: true, tag: true },
    orderBy: { startTime: "asc" },
  });
}

export async function getAppointmentById(tx: Tx, id: string) {
  return tx.appointment.findUnique({
    where: { id },
    include: { client: true, serviceType: true, staff: true, tag: true },
  });
}
