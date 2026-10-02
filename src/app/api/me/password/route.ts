import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-user";
import { runInTenantContext, runInSystemContext, type Tx } from "@/lib/tenant-context";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

// Every logged-in person - tenant ADMIN/STAFF or the platform SUPERADMIN -
// can change their own password, so this accepts all three roles rather
// than requireTenantSession (which deliberately excludes SUPERADMIN).
const patchSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN", "STAFF", "SUPERADMIN"]);
    const json = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { currentPassword, newPassword } = parsed.data;

    async function changePassword(tx: Tx) {
      const user = await tx.user.findUniqueOrThrow({ where: { id: session.userId } });
      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) return "WRONG_PASSWORD" as const;

      const passwordHash = await hashPassword(newPassword);
      await tx.user.update({ where: { id: session.userId }, data: { passwordHash } });
      return "OK" as const;
    }

    // A user's own row is tenant-scoped for ADMIN/STAFF (RLS requires the
    // matching tenant context) but SUPERADMIN's row has tenantId null, which
    // only runInSystemContext can see - same branch current-user.ts's
    // requireTenantSession/the /api/me/locale route already draw.
    const result = session.tenantId
      ? await runInTenantContext(session.tenantId, session.userId, session.role as "ADMIN" | "STAFF", changePassword)
      : await runInSystemContext(changePassword);

    if (result === "WRONG_PASSWORD") {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to change password", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
