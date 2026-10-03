import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-user";
import { runInTenantContext, type Tx } from "@/lib/tenant-context";

const MAX_NAME_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 300;

/** Walks up the reportsTo chain from `startId` - true if `roleId` appears anywhere in it (would make the edit create a cycle). */
async function chainIncludes(tx: Tx, startId: string, roleId: string): Promise<boolean> {
  let current: string | null = startId;
  const seen = new Set<string>();
  while (current) {
    if (current === roleId) return true;
    if (seen.has(current)) return false; // already-corrupt chain - don't loop forever
    seen.add(current);
    const row: { reportsToId: string | null } | null = await tx.role.findUnique({
      where: { id: current },
      select: { reportsToId: true },
    });
    current = row?.reportsToId ?? null;
  }
  return false;
}

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
    description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).nullable(),
    reportsToId: z.string().uuid().nullable(),
    level: z.number().int().min(0).max(1000),
  })
  .partial();

// Renaming/re-describing/re-parenting a role is ADMIN-only, same reasoning
// as creating one.
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

    const role = await runInTenantContext(session.tenantId, session.userId, "ADMIN", async (tx) => {
      const existing = await tx.role.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== session.tenantId) throw new Error("NOT_FOUND");

      if (data.reportsToId !== undefined && data.reportsToId !== null) {
        if (data.reportsToId === id) throw new Error("INVALID_REPORTS_TO");
        const reportsTo = await tx.role.findUnique({ where: { id: data.reportsToId } });
        if (!reportsTo || reportsTo.tenantId !== session.tenantId) throw new Error("INVALID_REPORTS_TO");
        // Would this point the chain back at the role being edited? (A reports
        // to B, B reports to A - or any longer loop through more roles.)
        if (await chainIncludes(tx, data.reportsToId, id)) throw new Error("WOULD_CREATE_CYCLE");
      }

      if (data.name && data.name !== existing.name) {
        const nameTaken = await tx.role.findUnique({
          where: { tenantId_name: { tenantId: session.tenantId!, name: data.name } },
        });
        if (nameTaken) throw new Error("NAME_TAKEN");
      }

      return tx.role.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description || null }),
          ...(data.reportsToId !== undefined && { reportsToId: data.reportsToId }),
          ...(data.level !== undefined && { level: data.level }),
        },
      });
    });

    return NextResponse.json({ role });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (err instanceof Error && err.message === "NAME_TAKEN") {
      return NextResponse.json({ error: "A role with that name already exists." }, { status: 409 });
    }
    if (err instanceof Error && err.message === "INVALID_REPORTS_TO") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (err instanceof Error && err.message === "WOULD_CREATE_CYCLE") {
      return NextResponse.json(
        { error: "That would create a reporting loop - pick a different role." },
        { status: 400 }
      );
    }
    console.error("Failed to update role", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

// Deletion is blocked (at the DB level - User.roleId's onDelete: Restrict)
// while anyone still holds this role - they must be reassigned first.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireRole(["ADMIN"]);
    if (!session.tenantId) throw new Error("FORBIDDEN");

    await runInTenantContext(session.tenantId, session.userId, "ADMIN", async (tx) => {
      const existing = await tx.role.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== session.tenantId) throw new Error("NOT_FOUND");

      const holderCount = await tx.user.count({ where: { roleId: id } });
      if (holderCount > 0) throw new Error("ROLE_IN_USE");

      await tx.role.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (err instanceof Error && err.message === "ROLE_IN_USE") {
      return NextResponse.json(
        { error: "Reassign everyone holding this role before deleting it." },
        { status: 409 }
      );
    }
    console.error("Failed to delete role", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
