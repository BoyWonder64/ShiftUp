import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";

// Removing a staff member from a team is ADMIN-only, same as the rest of Teams.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; staffProfileId: string }> }
) {
  const { id, staffProfileId } = await params;
  try {
    const session = await requireRole(["ADMIN"]);
    if (!session.tenantId) throw new Error("FORBIDDEN");

    await runInTenantContext(session.tenantId, session.userId, "ADMIN", async (tx) => {
      const team = await tx.team.findUnique({ where: { id } });
      if (!team || team.tenantId !== session.tenantId) throw new Error("NOT_FOUND");

      const existing = await tx.teamMember.findUnique({
        where: { teamId_staffProfileId: { teamId: id, staffProfileId } },
      });
      if (!existing) throw new Error("NOT_FOUND");

      await tx.teamMember.delete({ where: { id: existing.id } });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("Failed to remove team member", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
