import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { reviewTimeOff } from "@/modules/timeoff/service";

const patchSchema = z.object({
  status: z.enum(["APPROVED", "DENIED"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    const json = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const timeOff = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const canApprove = await hasPermission(tx, session.tenantId, session.role, session.roleId, "APPROVE_TIME_OFF");
      if (!canApprove) throw new Error("FORBIDDEN");
      return reviewTimeOff(tx, id, session.userId, parsed.data.status);
    });

    return NextResponse.json({ timeOff });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to review time off", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
