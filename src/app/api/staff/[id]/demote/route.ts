import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";

const demoteSchema = z.object({ roleId: z.string().uuid() });

/**
 * Demotes an ADMIN back to STAFF, landing them in `roleId`. ADMIN-only. The
 * account that originally created the tenant (User.isOwner) is never a
 * valid `id` here in the first place - see the comment on isOwner in
 * schema.prisma - so this never needs to special-case them; the self-demote
 * guard below is what actually prevents an admin from locking themselves
 * out.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireRole(["ADMIN"]);
    if (!session.tenantId) throw new Error("FORBIDDEN");

    const json = await request.json().catch(() => null);
    const parsed = demoteSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { roleId } = parsed.data;

    const staff = await runInTenantContext(session.tenantId, session.userId, "ADMIN", async (tx) => {
      const staffProfile = await tx.staffProfile.findUnique({ where: { id }, include: { user: true } });
      if (!staffProfile || staffProfile.tenantId !== session.tenantId) throw new Error("NOT_FOUND");
      if (staffProfile.user.role !== "ADMIN") throw new Error("NOT_ADMIN");
      if (staffProfile.userId === session.userId) throw new Error("CANNOT_DEMOTE_SELF");

      const role = await tx.role.findUnique({ where: { id: roleId } });
      if (!role || role.tenantId !== session.tenantId) throw new Error("INVALID_ROLE");

      await tx.user.update({ where: { id: staffProfile.userId }, data: { role: "STAFF", roleId } });

      return tx.staffProfile.findUnique({
        where: { id },
        include: {
          user: {
            select: { id: true, email: true, username: true, role: true, customRole: { select: { id: true, name: true, level: true } } },
          },
        },
      });
    });

    return NextResponse.json({ staff });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (err instanceof Error && err.message === "NOT_ADMIN") {
      return NextResponse.json({ error: "This account isn't an admin." }, { status: 400 });
    }
    if (err instanceof Error && err.message === "CANNOT_DEMOTE_SELF") {
      return NextResponse.json({ error: "You can't demote your own account." }, { status: 400 });
    }
    if (err instanceof Error && err.message === "INVALID_ROLE") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("Failed to demote admin", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
