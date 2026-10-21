import { addMinutes, startOfDay } from "date-fns";
import type { Tx } from "@/lib/tenant-context";
import { staffOnApprovedLeave } from "@/modules/timeoff/service";
import { getEnabledHolidaysInRange } from "@/lib/holidays/catalog";

/** Thrown when the requested service/tenant combination can't be booked publicly at all (not a "no slots free" case - that's just an empty array). */
export class BookingUnavailableError extends Error {}

export interface AvailableStaffSlot {
  staffId: string;
  start: Date;
  end: Date;
}

export interface ComputeAvailabilityInput {
  serviceTypeId: string;
  /** Omit for "any available" - every staff member with at least one WorkingHours row is a candidate. */
  staffId?: string | null;
  rangeStart: Date;
  rangeEnd: Date;
}

/**
 * Every open [start, end) slot for a service type, one row per (staff, slot)
 * pair - never collapsed, so the booking endpoint can re-run this with the
 * exact requested window to authoritatively pick (and re-verify) a staff
 * member right before writing. The public availability GET route collapses
 * this itself (see collapseForDisplay) since a visitor who didn't pick a
 * specific staff member shouldn't see the same time slot once per staff.
 */
export async function listAvailableSlotsByStaff(
  tx: Tx,
  tenantId: string,
  input: ComputeAvailabilityInput
): Promise<AvailableStaffSlot[]> {
  const [tenant, serviceType] = await Promise.all([
    tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        publicBookingEnabled: true,
        publicBookingMinNoticeMinutes: true,
        publicBookingWindowDays: true,
        enabledHolidayNames: true,
        blockedHolidayNames: true,
      },
    }),
    tx.appointmentServiceType.findUnique({ where: { id: input.serviceTypeId } }),
  ]);

  if (!tenant.publicBookingEnabled) {
    throw new BookingUnavailableError("Public booking is not enabled for this business.");
  }
  if (!serviceType || serviceType.tenantId !== tenantId || !serviceType.isActive || !serviceType.isPubliclyBookable) {
    throw new BookingUnavailableError("This service isn't available for public booking.");
  }

  const now = new Date();
  const notBefore = addMinutes(now, tenant.publicBookingMinNoticeMinutes);
  // Day boundaries/day-of-week use the server's local calendar day throughout
  // this function - matching WorkingHours.startMinute/endMinute's own doc
  // comment ("minutes since local midnight") and the holiday catalog's Date
  // construction (also local, see src/lib/holidays/federal.ts), rather than
  // introducing a separate UTC convention just here. This app has no real
  // per-tenant IANA timezone conversion anywhere yet (Tenant.timezone/
  // StaffProfile.timezone are stored but not applied to time math) - that's
  // a pre-existing gap, not something this function newly introduces.
  const windowEnd = addMinutes(startOfDay(now), tenant.publicBookingWindowDays * 1440);
  const rangeStart = input.rangeStart < notBefore ? notBefore : input.rangeStart;
  const rangeEnd = input.rangeEnd > windowEnd ? windowEnd : input.rangeEnd;
  if (!(rangeStart < rangeEnd)) return [];

  const candidateStaff = input.staffId
    ? await tx.staffProfile
        .findUnique({ where: { id: input.staffId }, select: { id: true, tenantId: true, bufferMinutes: true } })
        .then((s) => (s && s.tenantId === tenantId ? [s] : []))
    : await tx.staffProfile.findMany({
        where: { tenantId, workingHours: { some: {} } },
        select: { id: true, tenantId: true, bufferMinutes: true },
      });
  if (candidateStaff.length === 0) return [];

  const onLeave = await staffOnApprovedLeave(tx, { start: rangeStart, end: rangeEnd });

  const blockedHolidayDayTimes = new Set(
    getEnabledHolidaysInRange(
      tenant.enabledHolidayNames.filter((n) => tenant.blockedHolidayNames.includes(n)),
      rangeStart,
      rangeEnd
    ).map((h) => startOfDay(h.date).getTime())
  );

  const blockedTimes = await tx.blockedTime.findMany({
    where: { tenantId, startTime: { lt: rangeEnd }, endTime: { gt: rangeStart } },
    select: { startTime: true, endTime: true },
  });

  const results: AvailableStaffSlot[] = [];

  for (const staff of candidateStaff) {
    if (onLeave.has(staff.id)) continue;

    const workingHours = await tx.workingHours.findMany({ where: { staffProfileId: staff.id } });
    if (workingHours.length === 0) continue;

    const appointments = await tx.appointment.findMany({
      where: {
        staffId: staff.id,
        status: { not: "CANCELLED" },
        startTime: { lt: rangeEnd },
        endTime: { gt: rangeStart },
      },
      select: { startTime: true, endTime: true },
    });

    for (let day = startOfDay(rangeStart); day < rangeEnd; day = addMinutes(day, 1440)) {
      if (blockedHolidayDayTimes.has(day.getTime())) continue;

      const dayOfWeek = day.getDay();
      for (const window of workingHours.filter((w) => w.dayOfWeek === dayOfWeek)) {
        const winStart = addMinutes(day, window.startMinute);
        const winEnd = addMinutes(day, window.endMinute);
        const clippedStart = winStart < rangeStart ? rangeStart : winStart;
        const clippedEnd = winEnd > rangeEnd ? rangeEnd : winEnd;
        if (!(clippedStart < clippedEnd)) continue;

        for (
          let slotStart = clippedStart;
          addMinutes(slotStart, serviceType.durationMinutes) <= clippedEnd;
          slotStart = addMinutes(slotStart, serviceType.durationMinutes)
        ) {
          const slotEnd = addMinutes(slotStart, serviceType.durationMinutes);
          if (slotStart < notBefore) continue;

          const bufferStart = addMinutes(slotStart, -staff.bufferMinutes);
          const bufferEnd = addMinutes(slotEnd, staff.bufferMinutes);
          const blockedByAppointment = appointments.some((a) => bufferStart < a.endTime && bufferEnd > a.startTime);
          const blockedByBlockedTime = blockedTimes.some((b) => slotStart < b.endTime && slotEnd > b.startTime);
          if (blockedByAppointment || blockedByBlockedTime) continue;

          results.push({ staffId: staff.id, start: slotStart, end: slotEnd });
        }
      }
    }
  }

  results.sort((a, b) => a.start.getTime() - b.start.getTime());
  return results;
}

/** One row per distinct start time, for showing a visitor who hasn't picked a specific staff member - which staff actually covers it is resolved at booking time. */
export function collapseForDisplay(slots: AvailableStaffSlot[]): Array<{ start: Date; end: Date }> {
  const byStart = new Map<number, { start: Date; end: Date }>();
  for (const s of slots) {
    if (!byStart.has(s.start.getTime())) byStart.set(s.start.getTime(), { start: s.start, end: s.end });
  }
  return Array.from(byStart.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
}
