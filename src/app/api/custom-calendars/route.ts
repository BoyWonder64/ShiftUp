import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { PlanLimitError } from "@/lib/licensing/limits";

export async function GET() {
  try {
    const session = await requireTenantSession();
    const customCalendars = await runInTenantContext(
      session.tenantId,
      session.userId,
      session.role,
      async (tx) => {
        const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "VIEW_CUSTOM_CALENDAR");
        if (!allowed) return [];
        return tx.customCalendar.findMany({
          where: { tenantId: session.tenantId },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { _count: { select: { appointments: true } } },
        });
      }
    );
    return NextResponse.json({ customCalendars });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    console.error("Failed to list custom calendars", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  showClient: z.boolean().default(false),
  requireClient: z.boolean().default(false),
  showJobType: z.boolean().default(true),
  showJobEstimate: z.boolean().default(true),
  showColorKey: z.boolean().default(true),
  showPaymentStatus: z.boolean().default(false),
});

/** Creating a custom calendar is ADMIN-only (same gate Settings > Calendars itself uses) - free on every plan, not paid-gated. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireTenantSession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    const json = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const data = parsed.data;

    const customCalendar = await runInTenantContext(
      session.tenantId,
      session.userId,
      session.role,
      async (tx) => {
        const sortOrder = await tx.customCalendar.count({ where: { tenantId: session.tenantId } });
        return tx.customCalendar.create({ data: { tenantId: session.tenantId, sortOrder, ...data } });
      }
    );

    return NextResponse.json({ customCalendar }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof PlanLimitError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("Failed to create custom calendar", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
