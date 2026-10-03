import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";

/**
 * Promotes a staff member to ADMIN - a different kind of escalation than
 * reassigning their custom Role (see PATCH /api/staff/[id]), since ADMIN
 * sits outside the Role table entirely and unconditionally has every
 * permission. ADMIN-only, same reasoning as the Roles/Permissions settings
 * pages: only an existing ADMIN can create another one.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireRole(["ADMIN"]);
    if (!session.tenantId) throw new Error("FORBIDDEN");

    const staff = await runInTenantContext(session.tenantId, session.userId, "ADMIN", async (tx) => {
      const staffProfile = await tx.staffProfile.findUnique({ where: { id }, include: { user: true } });
      if (!staffProfile || staffProfile.tenantId !== session.tenantId) throw new Error("NOT_FOUND");
      if (staffProfile.user.role !== "STAFF") throw new Error("ALREADY_ADMIN");

      await tx.user.update({ where: { id: staffProfile.userId }, data: { role: "ADMIN", roleId: null } });

      return tx.staffProfile.findUnique({
        where: { id },
        include: {
          user: {
            select: { id: true, email: true, username: true, role: true, customRole: { select: { id: true, name: true } } },
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
    if (err instanceof Error && err.message === "ALREADY_ADMIN") {
      return NextResponse.json({ error: "This account is already an admin." }, { status: 400 });
    }
    console.error("Failed to promote staff to admin", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
