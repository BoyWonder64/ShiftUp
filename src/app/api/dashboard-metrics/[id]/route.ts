import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";

const ENTRY_KINDS = ["SHIFT", "APPOINTMENT", "CUSTOM"] as const;
const DATE_RANGES = ["ALL_TIME", "UPCOMING", "PAST", "TODAY", "THIS_WEEK", "THIS_MONTH"] as const;
const STATUS_FILTERS = [
  "ANY",
  "EXCLUDE_CANCELLED",
  "PENDING_PAYMENT",
  "BOOKED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

const updateSchema = z
  .object({
    label: z.string().min(1).max(200),
    metricType: z.enum(["STAFF_COUNT", "APPOINTMENT_COUNT"]),
    entryKindFilter: z.enum(ENTRY_KINDS).nullable(),
    dateRange: z.enum(DATE_RANGES),
    statusFilter: z.enum(STATUS_FILTERS),
  })
  .partial();

/** Renaming/reconfiguring a dashboard metric is ADMIN-only, same gate as creating one. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    const json = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const dashboardMetric = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const existing = await tx.dashboardMetric.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== session.tenantId) throw new Error("NOT_FOUND");
      return tx.dashboardMetric.update({ where: { id }, data: parsed.data });
    });

    return NextResponse.json({ dashboardMetric });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("Failed to update dashboard metric", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const result = await tx.dashboardMetric.deleteMany({ where: { id, tenantId: session.tenantId } });
      if (result.count === 0) throw new Error("NOT_FOUND");
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("Failed to delete dashboard metric", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
