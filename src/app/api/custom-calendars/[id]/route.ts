import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";

const updateSchema = z
  .object({
    name: z.string().min(1).max(200),
    showClient: z.boolean(),
    requireClient: z.boolean(),
    showJobType: z.boolean(),
    showJobEstimate: z.boolean(),
    showColorKey: z.boolean(),
    showPaymentStatus: z.boolean(),
  })
  .partial();

/** Renaming/reconfiguring a custom calendar's form fields is ADMIN-only, same gate as creating one. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    const json = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const customCalendar = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const existing = await tx.customCalendar.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== session.tenantId) throw new Error("NOT_FOUND");
      return tx.customCalendar.update({ where: { id }, data: parsed.data });
    });

    return NextResponse.json({ customCalendar });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("Failed to update custom calendar", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

/** Deleting a custom calendar cascades to every entry on it (Appointment.customCalendarId onDelete: Cascade) - the UI warns with the entry count from GET's _count before confirming. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const result = await tx.customCalendar.deleteMany({ where: { id, tenantId: session.tenantId } });
      if (result.count === 0) throw new Error("NOT_FOUND");
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("Failed to delete custom calendar", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
