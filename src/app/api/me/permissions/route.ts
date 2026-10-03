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
    const grants = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const entries = await Promise.all(
        PERMISSION_KEYS.map(async (key) => [key, await hasPermission(tx, session.tenantId, session.role, session.roleId, key)] as const)
      );
      return Object.fromEntries(entries);
    });
    return NextResponse.json({ role: session.role, permissions: grants });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to load my permissions", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
