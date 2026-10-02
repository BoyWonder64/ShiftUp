import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { getOwnStaffProfile, listTimeOff, requestTimeOff, TimeOffError } from "@/modules/timeoff/service";

export async function GET(request: NextRequest) {
  try {
    const session = await requireTenantSession();
    const status = new URL(request.url).searchParams.get("status") as
      | "PENDING"
      | "APPROVED"
      | "DENIED"
      | null;

    const timeOff = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const canViewOthers = await hasPermission(tx, session.tenantId, session.role, session.roleId, "VIEW_TIME_OFF");
      if (canViewOthers) {
        return listTimeOff(tx, { status: status ?? undefined });
      }
      const own = await getOwnStaffProfile(tx, session.userId);
      if (!own) return [];
      return listTimeOff(tx, { staffProfileId: own.id, status: status ?? undefined });
    });

    return NextResponse.json({ timeOff });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to list time off", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  reason: z.string().max(500).optional().nullable(),
});

/** Self-service: anyone with a StaffProfile can request time off for themselves - not permission-gated. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireTenantSession();
    const json = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const data = parsed.data;

    const timeOff = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const own = await getOwnStaffProfile(tx, session.userId);
      if (!own) throw new Error("NO_STAFF_PROFILE");
      return requestTimeOff(tx, session.tenantId, {
        staffProfileId: own.id,
        requestedByUserId: session.userId,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        reason: data.reason,
      });
    });

    return NextResponse.json({ timeOff }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "NO_STAFF_PROFILE") {
      return NextResponse.json(
        { error: "You don't have a staff profile to request time off for." },
        { status: 400 }
      );
    }
    if (err instanceof TimeOffError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Failed to request time off", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
