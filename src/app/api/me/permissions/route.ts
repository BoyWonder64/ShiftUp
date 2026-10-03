import { NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { PERMISSION_KEYS } from "@/lib/permissions/catalog";

/** The current user's own effective permissions (defaults + tenant overrides merged) - unlike
 * /api/admin/permissions, any authenticated tenant user can call this for themselves. */
export async function GET() {
  try {
    const session = await requireTenantSession();
    const { grants, level } = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const entries = await Promise.all(
        PERMISSION_KEYS.map(async (key) => [key, await hasPermission(tx, session.tenantId, session.role, session.roleId, key)] as const)
      );
      // null means "outranks every role" (ADMIN - SUPERADMIN never reaches
      // here, requireTenantSession rejects it) - used by clients like
      // StaffManager to decide which roles are offerable in a dropdown.
      let level: number | null = null;
      if (session.role !== "ADMIN" && session.roleId) {
        const role = await tx.role.findUnique({ where: { id: session.roleId }, select: { level: true } });
        level = role?.level ?? 0;
      }
      return { grants: Object.fromEntries(entries), level };
    });
    return NextResponse.json({ role: session.role, permissions: grants, level });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to load my permissions", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
