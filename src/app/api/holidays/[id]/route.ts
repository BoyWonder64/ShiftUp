import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";

const updateSchema = z.object({
  blocked: z.boolean(),
});

// Only `blocked` is editable after creation - name/date/recurring are fixed
// at creation (same as before this route existed at all; removing and
// re-adding is the only way to change those, consistent with there being no
// other holiday-editing UI anywhere in Settings).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();

    const json = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const holiday = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_CALENDAR_SETTINGS");
      if (!allowed) throw new Error("FORBIDDEN");

      return tx.holiday.update({ where: { id }, data: { blocked: parsed.data.blocked } });
    });

    return NextResponse.json({ holiday });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to update holiday", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();

    await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_CALENDAR_SETTINGS");
      if (!allowed) throw new Error("FORBIDDEN");

      await tx.holiday.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to delete holiday", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
