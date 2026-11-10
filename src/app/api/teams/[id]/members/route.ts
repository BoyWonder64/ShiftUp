import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";

const addMemberSchema = z.object({
  staffProfileId: z.string().uuid(),
});

// Adding a staff member to a team is ADMIN-only, same as the rest of Teams.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireRole(["ADMIN"]);
    if (!session.tenantId) throw new Error("FORBIDDEN");

    const json = await request.json().catch(() => null);
    const parsed = addMemberSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { staffProfileId } = parsed.data;

    const member = await runInTenantContext(session.tenantId, session.userId, "ADMIN", async (tx) => {
      const team = await tx.team.findUnique({ where: { id } });
      if (!team || team.tenantId !== session.tenantId) throw new Error("NOT_FOUND");

      const staffProfile = await tx.staffProfile.findUnique({ where: { id: staffProfileId } });
      if (!staffProfile || staffProfile.tenantId !== session.tenantId) throw new Error("INVALID_STAFF");

      const existing = await tx.teamMember.findUnique({
        where: { teamId_staffProfileId: { teamId: id, staffProfileId } },
      });
      if (existing) throw new Error("ALREADY_MEMBER");

      return tx.teamMember.create({
        data: { tenantId: session.tenantId!, teamId: id, staffProfileId },
        include: { staffProfile: { select: { id: true, displayName: true } } },
      });
    });

    return NextResponse.json(
      { member: { staffProfileId: member.staffProfile.id, displayName: member.staffProfile.displayName } },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (err instanceof Error && err.message === "INVALID_STAFF") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (err instanceof Error && err.message === "ALREADY_MEMBER") {
      return NextResponse.json({ error: "That staff member is already on this team." }, { status: 409 });
    }
    console.error("Failed to add team member", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
