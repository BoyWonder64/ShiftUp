import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { assertScheduleTemplatesEnabled, PlanLimitError } from "@/lib/licensing/limits";
import { updateTemplateShift, deleteTemplateShift } from "@/modules/scheduling/templates";

const patchSchema = z.object({
  staffId: z.string().uuid().optional(),
  dayOffset: z.number().int().min(0).optional(),
  startMinute: z.number().int().min(0).max(1440).optional(),
  endMinute: z.number().int().min(0).max(1440).optional(),
  serviceTypeId: z.string().uuid().optional().nullable(),
});

function mapError(err: unknown) {
  if (err instanceof Error && err.message === "UNAUTHENTICATED") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (err instanceof Error && err.message === "FORBIDDEN") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  if (err instanceof Error && err.message === "NOT_FOUND") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (err instanceof Error && err.message === "INVALID_DAY_OFFSET") {
    return NextResponse.json({ error: "Day offset must fall within the template's period length." }, { status: 400 });
  }
  if (err instanceof Error && err.message === "INVALID_TIME_RANGE") {
    return NextResponse.json({ error: "End time must be after start time, within the same day." }, { status: 400 });
  }
  if (err instanceof Error && err.message === "INVALID_STAFF") {
    return NextResponse.json({ error: "Invalid staff member." }, { status: 400 });
  }
  if (err instanceof Error && err.message === "INVALID_SERVICE_TYPE") {
    return NextResponse.json({ error: "Invalid service type." }, { status: 400 });
  }
  if (err instanceof PlanLimitError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; shiftId: string }> }
) {
  const { id, shiftId } = await params;
  try {
    const session = await requireTenantSession();
    const json = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const shift = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_SCHEDULE_TEMPLATES");
      if (!allowed) throw new Error("FORBIDDEN");
      await assertScheduleTemplatesEnabled(tx, session.tenantId);
      return updateTemplateShift(tx, session.tenantId, id, shiftId, parsed.data);
    });

    return NextResponse.json({ shift });
  } catch (err) {
    const mapped = mapError(err);
    if (mapped) return mapped;
    console.error("Failed to update template shift", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; shiftId: string }> }
) {
  const { id, shiftId } = await params;
  try {
    const session = await requireTenantSession();

    await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_SCHEDULE_TEMPLATES");
      if (!allowed) throw new Error("FORBIDDEN");
      await assertScheduleTemplatesEnabled(tx, session.tenantId);
      await deleteTemplateShift(tx, session.tenantId, id, shiftId);
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const mapped = mapError(err);
    if (mapped) return mapped;
    console.error("Failed to delete template shift", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
