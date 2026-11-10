import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";

const MAX_NAME_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 300;

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
    description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).nullable(),
  })
  .partial();

// Renaming/re-describing a team is ADMIN-only, same reasoning as creating one.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireRole(["ADMIN"]);
    if (!session.tenantId) throw new Error("FORBIDDEN");

    const json = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const data = parsed.data;

    const team = await runInTenantContext(session.tenantId, session.userId, "ADMIN", async (tx) => {
      const existing = await tx.team.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== session.tenantId) throw new Error("NOT_FOUND");

      if (data.name && data.name !== existing.name) {
        const nameTaken = await tx.team.findUnique({
          where: { tenantId_name: { tenantId: session.tenantId!, name: data.name } },
        });
        if (nameTaken) throw new Error("NAME_TAKEN");
      }

      return tx.team.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description || null }),
        },
      });
    });

    return NextResponse.json({ team });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (err instanceof Error && err.message === "NAME_TAKEN") {
      return NextResponse.json({ error: "A team with that name already exists." }, { status: 409 });
    }
    console.error("Failed to update team", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

// Deleting a team just removes its membership rows (TeamMember.teamId is
// onDelete: Cascade) - unlike Role, nothing else references a Team, so
// there's no "in use" guard to enforce first.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireRole(["ADMIN"]);
    if (!session.tenantId) throw new Error("FORBIDDEN");

    await runInTenantContext(session.tenantId, session.userId, "ADMIN", async (tx) => {
      const existing = await tx.team.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== session.tenantId) throw new Error("NOT_FOUND");

      await tx.team.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("Failed to delete team", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
