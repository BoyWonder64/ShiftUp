import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  price: z.number().min(0).max(1_000_000).nullable().optional(),
  requiresPayment: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

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

    const serviceType = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_SERVICES");
      if (!allowed) throw new Error("FORBIDDEN");
      // tenantId-scoped updateMany-then-refetch, not a bare update(), so a
      // service type id belonging to another tenant 404s instead of leaking
      // whether it exists (same pattern RLS already enforces at the DB level).
      const result = await tx.serviceType.updateMany({
        where: { id, tenantId: session.tenantId },
        data: parsed.data,
      });
      if (result.count === 0) throw new Error("NOT_FOUND");
      return tx.serviceType.findUniqueOrThrow({ where: { id } });
    });

    return NextResponse.json({ serviceType });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("Failed to update service type", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();

    await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "DELETE_SERVICES");
      if (!allowed) throw new Error("FORBIDDEN");
      // Appointment.serviceTypeId is onDelete: SetNull, so existing
      // appointments referencing this service type just lose the reference
      // rather than blocking the delete - no "still in use" guard needed,
      // unlike deleting a Role.
      const result = await tx.serviceType.deleteMany({ where: { id, tenantId: session.tenantId } });
      if (result.count === 0) throw new Error("NOT_FOUND");
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("Failed to delete service type", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
