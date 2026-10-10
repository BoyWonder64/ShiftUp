import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";

const updateSchema = z
  .object({
    name: z.string().min(1).max(200),
    durationMinutes: z.number().int().min(1).max(1440),
    price: z.number().min(0).max(1_000_000).nullable(),
    requiresPayment: z.boolean(),
    isActive: z.boolean(),
    // Settings > Booking Widget (paid feature) toggles this per service type -
    // separate from isActive, which gates internal (admin/staff) scheduling.
    isPubliclyBookable: z.boolean(),
  })
  .partial();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    const json = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const serviceType = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_SERVICES");
      if (!allowed) throw new Error("FORBIDDEN");

      const existing = await tx.serviceType.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== session.tenantId) throw new Error("NOT_FOUND");

      return tx.serviceType.update({ where: { id }, data: parsed.data });
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
