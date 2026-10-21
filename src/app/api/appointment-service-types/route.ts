import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";

export async function GET(request: NextRequest) {
  try {
    const session = await requireTenantSession();
    // The calendar's create panel only wants active service types to pick from;
    // the Settings manager wants all of them (including inactive, to toggle back on).
    const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "true";
    const serviceTypes = await runInTenantContext(
      session.tenantId,
      session.userId,
      session.role,
      async (tx) => {
        const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "VIEW_SERVICES");
        if (!allowed) throw new Error("FORBIDDEN");
        return tx.appointmentServiceType.findMany({
          where: activeOnly ? { isActive: true } : undefined,
          orderBy: { name: "asc" },
        });
      }
    );
    return NextResponse.json({ serviceTypes });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to list appointment service types", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  durationMinutes: z.number().int().min(1).max(1440),
  // Null = no price set at all (e.g. police work that's never billed) - distinct from an explicit $0.
  price: z.number().min(0).max(1_000_000).nullable().optional(),
  requiresPayment: z.boolean().default(false),
  isActive: z.boolean().default(true),
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

    const serviceType = await runInTenantContext(
      session.tenantId,
      session.userId,
      session.role,
      async (tx) => {
        const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "CREATE_SERVICES");
        if (!allowed) throw new Error("FORBIDDEN");
        return tx.appointmentServiceType.create({ data: { tenantId: session.tenantId, ...data } });
      }
    );

    return NextResponse.json({ serviceType }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to create appointment service type", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
