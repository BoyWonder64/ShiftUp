import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import {
  getEffectivePermissionMatrix,
  getEffectiveVisibilityMatrix,
  setRolePermission,
  setRoleVisibility,
} from "@/lib/permissions/service";
import { CONFIGURABLE_ROLES, PERMISSION_KEYS } from "@/lib/permissions/catalog";

// Only ADMIN can view/change these - granting a MANAGER/SUPERVISOR the
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

const roleEnum = z.enum(CONFIGURABLE_ROLES as [string, ...string[]]);
const permissionKeyEnum = z.enum(PERMISSION_KEYS as unknown as [string, ...string[]]);

const updateSchema = z.object({
  permissionUpdates: z
    .array(z.object({ role: roleEnum, permissionKey: permissionKeyEnum, granted: z.boolean() }))
    .default([]),
  visibilityUpdates: z
    .array(z.object({ viewerRole: roleEnum, targetRole: roleEnum, canView: z.boolean() }))
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
      for (const u of permissionUpdates) {
        await setRolePermission(
          tx,
          session.tenantId!,
          u.role as never,
          u.permissionKey as never,
          u.granted
        );
      }
      for (const u of visibilityUpdates) {
        await setRoleVisibility(
          tx,
          session.tenantId!,
          u.viewerRole as never,
          u.targetRole as never,
          u.canView
        );
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to update permission matrix", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
