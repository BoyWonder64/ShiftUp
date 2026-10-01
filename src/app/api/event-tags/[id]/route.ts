import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";

// Deletion is ADMIN-only (unlike creation) - a shared tag is effectively
// taxonomy other staff's past/future entries may already reference
// (onDelete: SetNull keeps those events intact, just un-tagged), so
// removing one outright should be a deliberate admin action.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireRole(["ADMIN"]);
    if (!session.tenantId) throw new Error("FORBIDDEN");

    await runInTenantContext(session.tenantId, session.userId, "ADMIN", (tx) =>
      tx.eventTag.delete({ where: { id } })
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to delete event tag", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
