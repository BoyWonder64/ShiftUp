import { NextRequest, NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { findCoverageCandidates } from "@/modules/scheduling/service";

/** Who could cover this shift - gated by EDIT_SHIFTS/EDIT_APPOINTMENTS/EDIT_CUSTOM_ENTRIES (whichever matches this event's entryKind) since reassigning is an edit action. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    const candidates = await runInTenantContext(
      session.tenantId,
      session.userId,
      session.role,
      async (tx) => {
        const target = await tx.appointment.findUniqueOrThrow({ where: { id }, select: { entryKind: true } });
        const canEdit = await hasPermission(
          tx,
          session.tenantId,
          session.role,
          session.roleId,
          target.entryKind === "SHIFT"
            ? "EDIT_SHIFTS"
            : target.entryKind === "CUSTOM"
              ? "EDIT_CUSTOM_ENTRIES"
              : "EDIT_APPOINTMENTS"
        );
        if (!canEdit) throw new Error("FORBIDDEN");
        return findCoverageCandidates(tx, session.tenantId, id);
      }
    );
    return NextResponse.json({ candidates });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to find coverage candidates", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
