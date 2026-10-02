import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { createAppointment, listAppointmentsInRange, SchedulingConflictError } from "@/modules/scheduling/service";
import { assertCanAddAppointment, PlanLimitError } from "@/lib/licensing/limits";
import { getOwnStaffProfile } from "@/modules/timeoff/service";

type AppointmentWithMaybeEstimates = {
  estimatedDurationMinutes: number | null;
  estimatedValue: unknown;
  [key: string]: unknown;
};

/** Strips job-estimation fields from a response payload when the viewer lacks VIEW_JOB_ESTIMATES. */
function redactEstimates<T extends AppointmentWithMaybeEstimates>(appt: T, canView: boolean): T {
  if (canView) return appt;
  return { ...appt, estimatedDurationMinutes: null, estimatedValue: null };
}

const rangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireTenantSession();
    const url = new URL(request.url);
    const parsed = rangeSchema.safeParse({
      start: url.searchParams.get("start"),
      end: url.searchParams.get("end"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "start and end query params (ISO datetimes) are required" }, { status: 400 });
    }

    // "view=mine" is a voluntary narrowing a viewer who CAN see everyone can
    // ask for (the calendar's Everyone/Just mine toggle) - it can only ever
    // narrow the result, never widen it past what VIEW_ALL_SHIFTS/
    // VIEW_ALL_APPOINTMENTS actually grant, which is enforced below
    // regardless of what the client sends.
    const requestedMineOnly = url.searchParams.get("view") === "mine";

    const appointments = await runInTenantContext(
      session.tenantId,
      session.userId,
      session.role,
      async (tx) => {
        const canView = await hasPermission(tx, session.tenantId, session.role, session.roleId, "VIEW_APPOINTMENTS");
        if (!canView) throw new Error("FORBIDDEN");
        const [canViewEstimates, canViewAllShifts, canViewAllAppointments] = await Promise.all([
          hasPermission(tx, session.tenantId, session.role, session.roleId, "VIEW_JOB_ESTIMATES"),
          hasPermission(tx, session.tenantId, session.role, session.roleId, "VIEW_ALL_SHIFTS"),
          hasPermission(tx, session.tenantId, session.role, session.roleId, "VIEW_ALL_APPOINTMENTS"),
        ]);
        const allShifts = canViewAllShifts && !requestedMineOnly;
        const allAppointments = canViewAllAppointments && !requestedMineOnly;
        const own = allShifts && allAppointments ? null : await getOwnStaffProfile(tx, session.userId);

        const rows = await listAppointmentsInRange(
          tx,
          session.tenantId,
          { start: new Date(parsed.data.start), end: new Date(parsed.data.end) },
          { allShifts, allAppointments, ownStaffId: own?.id ?? null }
        );
        return rows.map((row) => redactEstimates(row, canViewEstimates));
      }
    );

    return NextResponse.json({ appointments });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to list appointments", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createSchema = z.object({
  staffId: z.string().uuid(),
  clientId: z.string().uuid().optional().nullable(),
  serviceTypeId: z.string().uuid().optional().nullable(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  priceCharged: z.number().min(0).optional().nullable(),
  estimatedDurationMinutes: z.number().int().min(0).optional().nullable(),
  estimatedValue: z.number().min(0).optional().nullable(),
  locationType: z.enum(["IN_PERSON", "ONLINE"]).default("IN_PERSON"),
  location: z.string().max(500).optional().nullable(),
  tagId: z.string().uuid().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireTenantSession();
    const json = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    const appointment = await runInTenantContext(
      session.tenantId,
      session.userId,
      session.role,
      async (tx) => {
        const [canCreate, canEditEstimates] = await Promise.all([
          hasPermission(tx, session.tenantId, session.role, session.roleId, "CREATE_APPOINTMENTS"),
          hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_JOB_ESTIMATES"),
        ]);
        if (!canCreate) throw new Error("FORBIDDEN");
        await assertCanAddAppointment(tx, session.tenantId);

        return createAppointment(tx, session.tenantId, {
          staffId: data.staffId,
          clientId: data.clientId,
          serviceTypeId: data.serviceTypeId,
          startTime: new Date(data.startTime),
          endTime: new Date(data.endTime),
          priceCharged: data.priceCharged,
          estimatedDurationMinutes: canEditEstimates ? data.estimatedDurationMinutes : null,
          estimatedValue: canEditEstimates ? data.estimatedValue : null,
          locationType: data.locationType,
          location: data.location,
          tagId: data.tagId,
          createdByUserId: session.userId,
          source: "ADMIN",
        });
      }
    );

    return NextResponse.json({ appointment }, { status: 201 });
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
    if (err instanceof PlanLimitError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("Failed to create appointment", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
