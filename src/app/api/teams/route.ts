import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";

const MAX_NAME_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 300;

// Readable by any signed-in tenant member (not just ADMIN) - the calendar's
// and roster's team filters need the full team list to render, same
// reasoning as the roles list.
export async function GET() {
  try {
    const session = await requireTenantSession();
    const teams = await runInTenantContext(session.tenantId, session.userId, session.role, (tx) =>
      tx.team.findMany({
        where: { tenantId: session.tenantId },
        include: { members: { include: { staffProfile: { select: { id: true, displayName: true } } } } },
        orderBy: { name: "asc" },
      })
    );
    return NextResponse.json({
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        members: t.members.map((m) => ({ staffProfileId: m.staffProfile.id, displayName: m.staffProfile.displayName })),
      })),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    console.error("Failed to list teams", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional().nullable(),
});

// Creating a team is ADMIN-only, same as Roles/Permissions - the TODO.md ask
// was explicitly "let the admin have control over this for now".
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN"]);
    if (!session.tenantId) throw new Error("FORBIDDEN");

    const json = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const data = parsed.data;

    const team = await runInTenantContext(session.tenantId, session.userId, "ADMIN", async (tx) => {
      const existing = await tx.team.findUnique({
        where: { tenantId_name: { tenantId: session.tenantId!, name: data.name } },
      });
      if (existing) throw new Error("NAME_TAKEN");

      return tx.team.create({
        data: {
          tenantId: session.tenantId!,
          name: data.name,
          description: data.description || null,
        },
      });
    });

    return NextResponse.json({ team: { ...team, members: [] } }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NAME_TAKEN") {
      return NextResponse.json({ error: "A team with that name already exists." }, { status: 409 });
    }
    console.error("Failed to create team", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
