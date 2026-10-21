import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { listEventsForReport } from "@/modules/reports/service";

const querySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  status: z.enum(["BOOKED", "COMPLETED", "CANCELLED", "NO_SHOW", "PENDING_PAYMENT"]).optional(),
  staffId: z.string().uuid().optional(),
  serviceTypeId: z.string().uuid().optional(),
});

/** ISSUES.md #4 - gated on VIEW_SHIFT_REPORTS alone, deliberately not layered under VIEW_ALL_SHIFTS/VIEW_ALL_APPOINTMENTS (see listEventsForReport's doc comment). */
export async function GET(request: NextRequest) {
  try {
    const session = await requireTenantSession();
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      start: url.searchParams.get("start"),
      end: url.searchParams.get("end"),
      status: url.searchParams.get("status") ?? undefined,
      staffId: url.searchParams.get("staffId") ?? undefined,
      serviceTypeId: url.searchParams.get("serviceTypeId") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const data = parsed.data;

    const events = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "VIEW_SHIFT_REPORTS");
      if (!allowed) throw new Error("FORBIDDEN");

      return listEventsForReport(tx, session.tenantId, {
        start: new Date(data.start),
        end: new Date(data.end),
        status: data.status,
        staffId: data.staffId,
        serviceTypeId: data.serviceTypeId,
      });
    });

    return NextResponse.json({ events });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to load shift report", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
