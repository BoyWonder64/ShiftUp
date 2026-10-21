import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { listDashboardMetrics } from "@/modules/dashboard/service";

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

export async function GET() {
  try {
    const session = await requireTenantSession();
    // Readable by any signed-in tenant member - same convention as
    // tenant-settings' GET, since the dashboard itself (which every member
    // sees) needs these definitions to render its tiles.
    const dashboardMetrics = await runInTenantContext(session.tenantId, session.userId, session.role, (tx) =>
      listDashboardMetrics(tx, session.tenantId)
    );
    return NextResponse.json({ dashboardMetrics });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    console.error("Failed to list dashboard metrics", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createSchema = z.object({
  label: z.string().min(1).max(200),
  metricType: z.enum(["STAFF_COUNT", "APPOINTMENT_COUNT"]),
  entryKindFilter: z.enum(ENTRY_KINDS).nullable().default(null),
  dateRange: z.enum(DATE_RANGES).default("ALL_TIME"),
  statusFilter: z.enum(STATUS_FILTERS).default("EXCLUDE_CANCELLED"),
});

/** Creating a dashboard metric is ADMIN-only, same gate Settings > Dashboard itself uses (see sections.ts). */
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

    const dashboardMetric = await runInTenantContext(
      session.tenantId,
      session.userId,
      session.role,
      async (tx) => {
        const sortOrder = await tx.dashboardMetric.count({ where: { tenantId: session.tenantId } });
        return tx.dashboardMetric.create({ data: { tenantId: session.tenantId, sortOrder, ...data } });
      }
    );

    return NextResponse.json({ dashboardMetric }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    console.error("Failed to create dashboard metric", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
