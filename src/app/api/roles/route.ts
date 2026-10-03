import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";

const MAX_NAME_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 300;

// Readable by any signed-in tenant member (not just ADMIN) - staff-creation
// forms and the permission matrix both need the full role list to render.
export async function GET() {
  try {
    const session = await requireTenantSession();
    const roles = await runInTenantContext(session.tenantId, session.userId, session.role, (tx) =>
      tx.role.findMany({
        where: { tenantId: session.tenantId },
        select: { id: true, name: true, description: true, reportsToId: true },
        orderBy: { name: "asc" },
      })
    );
    return NextResponse.json({ roles });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    console.error("Failed to list roles", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional().nullable(),
  reportsToId: z.string().uuid().optional().nullable(),
});

// Creating/editing the tenant's role structure is ADMIN-only, same reasoning
// as the permission matrix - it reshapes what every other role can be.
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

    const role = await runInTenantContext(session.tenantId, session.userId, "ADMIN", async (tx) => {
      if (data.reportsToId) {
        const reportsTo = await tx.role.findUnique({ where: { id: data.reportsToId } });
        if (!reportsTo || reportsTo.tenantId !== session.tenantId) throw new Error("INVALID_REPORTS_TO");
      }
      const existing = await tx.role.findUnique({
        where: { tenantId_name: { tenantId: session.tenantId!, name: data.name } },
      });
      if (existing) throw new Error("NAME_TAKEN");

      return tx.role.create({
        data: {
          tenantId: session.tenantId!,
          name: data.name,
          description: data.description || null,
          reportsToId: data.reportsToId ?? null,
        },
      });
    });

    return NextResponse.json({ role }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NAME_TAKEN") {
      return NextResponse.json({ error: "A role with that name already exists." }, { status: 409 });
    }
    if (err instanceof Error && err.message === "INVALID_REPORTS_TO") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("Failed to create role", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
