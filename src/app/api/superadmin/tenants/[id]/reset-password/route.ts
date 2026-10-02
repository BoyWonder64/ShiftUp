import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/current-user";
import { runInSystemContext } from "@/lib/tenant-context";
import { hashPassword } from "@/lib/auth/password";

// There's no "forgot password" email flow yet (no email infrastructure at
// all - see TODO.md), so a locked-out tenant admin has no self-service path.
// This is the manual stand-in: generates a one-time temporary password for
// the tenant's ADMIN account, sets it directly, and returns the plaintext
// value once in the response - it's never logged or stored anywhere, so this
// is the only chance to relay it to the customer. Resets the tenant's ADMIN
// user specifically, not any STAFF account - the dev console deals with the
// one account per tenant a locked-out customer could possibly be contacting
// support as.
function generateTemporaryPassword(): string {
  return randomBytes(9).toString("base64url"); // 12 chars, well past the 8-char minimum
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireRole(["SUPERADMIN"]);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const admin = await runInSystemContext(async (tx) => {
      const adminUser = await tx.user.findFirst({ where: { tenantId: id, role: "ADMIN" } });
      if (!adminUser) return null;
      return tx.user.update({
        where: { id: adminUser.id },
        data: { passwordHash },
        select: { id: true, email: true, username: true },
      });
    });

    if (!admin) {
      return NextResponse.json({ error: "No admin account found for this tenant." }, { status: 404 });
    }

    return NextResponse.json({ admin, temporaryPassword });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to reset tenant admin password", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
