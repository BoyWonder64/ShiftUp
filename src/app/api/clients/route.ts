import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";

export async function GET() {
  try {
    const session = await requireTenantSession();
    const clients = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, "VIEW_CLIENTS");
      if (!allowed) throw new Error("FORBIDDEN");
      return tx.client.findMany({ orderBy: { name: "asc" } });
    });
    return NextResponse.json({ clients });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to list clients", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireTenantSession();
    const json = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const data = parsed.data;

    const client = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, "CREATE_CLIENTS");
      if (!allowed) throw new Error("FORBIDDEN");
      return tx.client.create({
        data: {
          tenantId: session.tenantId,
          name: data.name,
          email: data.email || null,
          phone: data.phone || null,
          address: data.address || null,
        },
      });
    });

    return NextResponse.json({ client }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to create client", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
