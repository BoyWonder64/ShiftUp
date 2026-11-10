import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { TIME_FORMATS } from "@/lib/calendar/timeFormat";

const patchSchema = z.object({ timeFormat: z.enum(TIME_FORMATS) });

/** The current user's own 12-hour/24-hour clock preference (Settings > Account) - every
 * tenant user (ADMIN/STAFF) has their own, independent of everyone else's at the business. */
export async function GET() {
  try {
    const session = await requireTenantSession();
    const user = await runInTenantContext(session.tenantId, session.userId, session.role, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: session.userId }, select: { timeFormat: true } })
    );
    return NextResponse.json({ timeFormat: user.timeFormat });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to load time format", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireTenantSession();
    const json = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { timeFormat } = parsed.data;

    await runInTenantContext(session.tenantId, session.userId, session.role, (tx) =>
      tx.user.update({ where: { id: session.userId }, data: { timeFormat } })
    );

    return NextResponse.json({ timeFormat });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to update time format", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
