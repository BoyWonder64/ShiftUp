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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    const result = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const canView = await hasPermission(tx, session.tenantId, session.role, session.roleId, "VIEW_APPOINTMENTS");
      if (!canView) throw new Error("FORBIDDEN");
      const canViewEstimates = await hasPermission(tx, session.tenantId, session.role, session.roleId, "VIEW_JOB_ESTIMATES");
      const appointment = await getAppointmentById(tx, id);
      if (!appointment) return null;
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
  status: z.enum(["CANCELLED"]).optional(),
  estimatedDurationMinutes: z.number().int().min(0).nullable().optional(),
  estimatedValue: z.number().min(0).nullable().optional(),
  locationType: z.enum(["IN_PERSON", "ONLINE"]).optional(),
  location: z.string().max(500).nullable().optional(),
  staffId: z.string().uuid().optional(),
  tagId: z.string().uuid().nullable().optional(),
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
        const wantsReschedule = Boolean(data.startTime && data.endTime);
        const wantsReassign = data.staffId !== undefined;

        if (data.status === "CANCELLED") {
          const canCancel = await hasPermission(tx, session.tenantId, session.role, session.roleId, "CANCEL_APPOINTMENTS");
          if (!canCancel) throw new Error("FORBIDDEN");
          return cancelAppointment(tx, id);
        }

        if (wantsReschedule || locationFieldsRequested || tagFieldRequested || wantsReassign) {
          const canEdit = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_APPOINTMENTS");
          if (!canEdit) throw new Error("FORBIDDEN");
        }
        if (estimateFieldsRequested) {
          const canEditEstimates = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_JOB_ESTIMATES");
          if (!canEditEstimates) throw new Error("FORBIDDEN");
        }

        if (wantsReassign) {
          await reassignAppointmentStaff(tx, id, data.staffId!);
        }

        if (wantsReschedule) {
          await rescheduleAppointment(tx, {
            id,
            startTime: new Date(data.startTime!),
            endTime: new Date(data.endTime!),
          });
        }

        if (estimateFieldsRequested || locationFieldsRequested || tagFieldRequested) {
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
    if (err instanceof SchedulingConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Failed to update appointment", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
