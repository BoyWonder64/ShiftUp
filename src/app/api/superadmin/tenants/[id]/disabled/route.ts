import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-user";
import { runInSystemContext } from "@/lib/tenant-context";

// Blocks (or unblocks) every login for one tenant - see the `disabled` field's
// doc comment on the Tenant model for the one caveat: this only takes effect
// at POST /api/auth/login, so an already-logged-in session from this tenant
// keeps working until it naturally expires (sessions are stateless, no
// server-side revocation list exists yet - same gap TODO.md already flags
// for password reset).
const patchSchema = z.object({
  disabled: z.boolean(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await requireRole(["SUPERADMIN"]);
    const json = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const tenant = await runInSystemContext((tx) =>
      tx.tenant.update({ where: { id }, data: { disabled: parsed.data.disabled }, select: { id: true, disabled: true } })
    );
    return NextResponse.json({ tenant });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to update tenant disabled state", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
