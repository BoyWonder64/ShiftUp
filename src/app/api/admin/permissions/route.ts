import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import {
  getEffectivePermissionMatrix,
  getEffectiveVisibilityMatrix,
  listTenantRoles,
  setRolePermission,
  setRoleVisibility,
} from "@/lib/permissions/service";
import { PERMISSION_KEYS } from "@/lib/permissions/catalog";

// Only ADMIN can view/change these - granting a tenant-defined role the
// ability to edit this matrix would let them hand themselves more access.
async function requireTenantAdmin() {
  const session = await requireRole(["ADMIN"]);
  if (!session.tenantId) throw new Error("FORBIDDEN");
  return session;
}

export async function GET() {
  try {
    const session = await requireTenantAdmin();
    const result = await runInTenantContext(session.tenantId!, session.userId, "ADMIN", async (tx) => {
      const [permissions, visibility] = await Promise.all([
        getEffectivePermissionMatrix(tx, session.tenantId!),
        getEffectiveVisibilityMatrix(tx, session.tenantId!),
      ]);
      return { permissions, visibility };
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to load permission matrix", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const permissionKeyEnum = z.enum(PERMISSION_KEYS);

const updateSchema = z.object({
  permissionUpdates: z
    .array(z.object({ roleId: z.string().uuid(), permissionKey: permissionKeyEnum, granted: z.boolean() }))
    .default([]),
  visibilityUpdates: z
    .array(z.object({ viewerRoleId: z.string().uuid(), targetRoleId: z.string().uuid(), canView: z.boolean() }))
    .default([]),
});

export async function PUT(request: NextRequest) {
  try {
    const session = await requireTenantAdmin();
    const json = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { permissionUpdates, visibilityUpdates } = parsed.data;

    await runInTenantContext(session.tenantId!, session.userId, "ADMIN", async (tx) => {
      // Every roleId in the payload must actually belong to this tenant -
      // otherwise an admin could write a permission row attached to another
      // tenant's role id (harmless to real access decisions since it'd never
      // be looked up, but it's still garbage data worth rejecting outright).
      const validRoleIds = new Set((await listTenantRoles(tx, session.tenantId!)).map((r) => r.id));
      const referencedRoleIds = [
        ...permissionUpdates.map((u) => u.roleId),
        ...visibilityUpdates.flatMap((u) => [u.viewerRoleId, u.targetRoleId]),
      ];
      if (referencedRoleIds.some((id) => !validRoleIds.has(id))) {
        throw new Error("INVALID_ROLE");
      }

      for (const u of permissionUpdates) {
        await setRolePermission(tx, session.tenantId!, u.roleId, u.permissionKey, u.granted);
      }
      for (const u of visibilityUpdates) {
        await setRoleVisibility(tx, session.tenantId!, u.viewerRoleId, u.targetRoleId, u.canView);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "INVALID_ROLE") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("Failed to update permission matrix", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
