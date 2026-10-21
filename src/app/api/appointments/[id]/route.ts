import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import {
  cancelAppointment,
  getAppointmentById,
  reassignAppointmentStaff,
  rescheduleAppointment,
  SchedulingConflictError,
} from "@/modules/scheduling/service";
import { getOwnStaffProfile } from "@/modules/timeoff/service";
import { EVENT_COLOR_KEYS } from "@/lib/colors/eventColors";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    const result = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const canViewEstimates = await hasPermission(tx, session.tenantId, session.role, session.roleId, "VIEW_JOB_ESTIMATES");
      const appointment = await getAppointmentById(tx, id);
      if (!appointment) return null;

      // Same VIEW_ALL_SHIFTS/VIEW_ALL_APPOINTMENTS scoping as the list
      // endpoint - without it for this entry's kind, only its own assigned
      // staff member can fetch it directly by id. Keyed on entryKind, not
      // clientId presence, since a CUSTOM entry can have a client or not
      // (see the schema's entryKind doc comment).
      const canView = await hasPermission(
        tx,
        session.tenantId,
        session.role,
        session.roleId,
        appointment.entryKind === "SHIFT"
          ? "VIEW_SHIFTS"
          : appointment.entryKind === "CUSTOM"
            ? "VIEW_CUSTOM_CALENDAR"
            : "VIEW_APPOINTMENTS"
      );
      if (!canView) throw new Error("FORBIDDEN");
      // CUSTOM entries have no separate "view all" permission - VIEW_CUSTOM_CALENDAR
      // alone grants seeing every one, same as the all-* keys do for shifts/appointments.
      const canViewAll =
        appointment.entryKind === "CUSTOM"
          ? true
          : await hasPermission(
              tx,
              session.tenantId,
              session.role,
              session.roleId,
              appointment.entryKind === "SHIFT" ? "VIEW_ALL_SHIFTS" : "VIEW_ALL_APPOINTMENTS"
            );
      if (!canViewAll) {
        const own = await getOwnStaffProfile(tx, session.userId);
        if (own?.id !== appointment.staffId) throw new Error("FORBIDDEN");
      }

      if (!canViewEstimates) {
        return { ...appointment, estimatedDurationMinutes: null, estimatedValue: null };
      }
      return appointment;
    });
    if (!result) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ appointment: result });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to load appointment", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const patchSchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  status: z.enum(["BOOKED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  estimatedDurationMinutes: z.number().int().min(0).nullable().optional(),
  estimatedValue: z.number().min(0).nullable().optional(),
  locationType: z.enum(["IN_PERSON", "ONLINE"]).optional(),
  location: z.string().max(500).nullable().optional(),
  staffId: z.string().uuid().optional(),
  tagId: z.string().uuid().nullable().optional(),
  colorKey: z.enum(EVENT_COLOR_KEYS).nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  serviceTypeId: z.string().uuid().nullable().optional(),
  priceCharged: z.number().min(0).nullable().optional(),
  paymentStatus: z.enum(["UNPAID", "PAID", "WAIVED", "REFUNDED"]).optional(),
});

/** Handles drag (time shift), resize (duration change), cancel, and job-estimate edits - all as one PATCH. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    const json = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const data = parsed.data;

    const appointment = await runInTenantContext(
      session.tenantId,
      session.userId,
      session.role,
      async (tx) => {
        const estimateFieldsRequested =
          data.estimatedDurationMinutes !== undefined || data.estimatedValue !== undefined;
        const locationFieldsRequested = data.locationType !== undefined || data.location !== undefined;
        const tagFieldRequested = data.tagId !== undefined;
        const colorKeyFieldRequested = data.colorKey !== undefined;
        // Logging what actually happened (completed/no-show, or reverting
        // back to booked) - distinct from data.status === "CANCELLED" below,
        // which keeps its own dedicated CANCEL_SHIFTS/CANCEL_APPOINTMENTS
        // gate rather than falling under the general edit permission here.
        const outcomeStatusRequested = data.status !== undefined && data.status !== "CANCELLED";
        const bookingFieldsRequested =
          data.clientId !== undefined ||
          data.serviceTypeId !== undefined ||
          data.priceCharged !== undefined ||
          data.paymentStatus !== undefined;
        const wantsReschedule = Boolean(data.startTime && data.endTime);
        const wantsReassign = data.staffId !== undefined;
        const wantsAnyEdit =
          wantsReschedule ||
          wantsReassign ||
          locationFieldsRequested ||
          tagFieldRequested ||
          colorKeyFieldRequested ||
          outcomeStatusRequested ||
          estimateFieldsRequested ||
          bookingFieldsRequested;

        // Needed up front (rather than inside cancelAppointment/reschedule-
        // Appointment, which don't know about permissions) so the
        // CANCEL_SHIFTS/CANCEL_APPOINTMENTS and EDIT_SHIFTS/EDIT_APPOINTMENTS
        // split below can pick the right key for this specific event.
        const existing = await tx.appointment.findUniqueOrThrow({ where: { id }, select: { entryKind: true } });
        const entryKind = existing.entryKind;

        if (data.status === "CANCELLED") {
          const canCancel = await hasPermission(
            tx,
            session.tenantId,
            session.role,
            session.roleId,
            entryKind === "SHIFT" ? "CANCEL_SHIFTS" : entryKind === "CUSTOM" ? "CANCEL_CUSTOM_ENTRIES" : "CANCEL_APPOINTMENTS"
          );
          if (!canCancel) throw new Error("FORBIDDEN");
          return cancelAppointment(tx, id);
        }

        // Settings > Calendar > "Allow editing booked events" - a tenant-wide
        // master switch, independent of (and checked before) the per-role
        // EDIT_SHIFTS/EDIT_APPOINTMENTS/EDIT_JOB_ESTIMATES permissions below.
        // Never applies to cancelling (handled above, already returned).
        if (wantsAnyEdit) {
          const tenant = await tx.tenant.findUniqueOrThrow({
            where: { id: session.tenantId! },
            select: { allowEditingBookedEvents: true },
          });
          if (!tenant.allowEditingBookedEvents) throw new Error("EDITING_DISABLED");
        }

        if (
          wantsReschedule ||
          locationFieldsRequested ||
          tagFieldRequested ||
          colorKeyFieldRequested ||
          outcomeStatusRequested ||
          wantsReassign ||
          bookingFieldsRequested
        ) {
          const canEdit = await hasPermission(
            tx,
            session.tenantId,
            session.role,
            session.roleId,
            entryKind === "SHIFT" ? "EDIT_SHIFTS" : entryKind === "CUSTOM" ? "EDIT_CUSTOM_ENTRIES" : "EDIT_APPOINTMENTS"
          );
          if (!canEdit) throw new Error("FORBIDDEN");
        }
        if (estimateFieldsRequested) {
          const canEditEstimates = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_JOB_ESTIMATES");
          if (!canEditEstimates) throw new Error("FORBIDDEN");
        }

        if (wantsReassign) {
          await reassignAppointmentStaff(tx, session.tenantId, id, data.staffId!);
        }

        if (wantsReschedule) {
          await rescheduleAppointment(tx, session.tenantId, {
            id,
            startTime: new Date(data.startTime!),
            endTime: new Date(data.endTime!),
          });
        }

        if (
          estimateFieldsRequested ||
          locationFieldsRequested ||
          tagFieldRequested ||
          colorKeyFieldRequested ||
          outcomeStatusRequested ||
          bookingFieldsRequested
        ) {
          return tx.appointment.update({
            where: { id },
            data: {
              ...(estimateFieldsRequested && {
                estimatedDurationMinutes: data.estimatedDurationMinutes,
                estimatedValue: data.estimatedValue,
              }),
              ...(data.locationType !== undefined && { locationType: data.locationType }),
              ...(data.location !== undefined && { location: data.location }),
              ...(tagFieldRequested && { tagId: data.tagId }),
              ...(colorKeyFieldRequested && { colorKey: data.colorKey }),
              ...(outcomeStatusRequested && { status: data.status }),
              ...(data.clientId !== undefined && { clientId: data.clientId }),
              // Routed to whichever table matches this row's kind
              // (ISSUES.md #1) - entryKind was read above and never changes
              // in the same request a serviceTypeId swap would also apply
              // to. APPOINTMENT picks AppointmentServiceType; SHIFT and
              // CUSTOM both pick ShiftServiceType (no third ServiceType
              // table - see the schema's entryKind doc comment).
              ...(data.serviceTypeId !== undefined &&
                (entryKind === "APPOINTMENT"
                  ? { appointmentServiceTypeId: data.serviceTypeId }
                  : { shiftServiceTypeId: data.serviceTypeId })),
              ...(data.priceCharged !== undefined && { priceCharged: data.priceCharged }),
              ...(data.paymentStatus !== undefined && { paymentStatus: data.paymentStatus }),
            },
          });
        }

        return tx.appointment.findUnique({ where: { id } });
      }
    );

    return NextResponse.json({ appointment });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "EDITING_DISABLED") {
      return NextResponse.json(
        { error: "Editing booked events is turned off for this account." },
        { status: 403 }
      );
    }
    if (err instanceof SchedulingConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Failed to update appointment", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
