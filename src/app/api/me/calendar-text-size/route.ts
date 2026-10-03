import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { CALENDAR_TEXT_SIZES } from "@/lib/calendar/textSize";

const patchSchema = z.object({ calendarTextSize: z.enum(CALENDAR_TEXT_SIZES) });

/** The current user's own calendar event text-size preference (Settings > Account) - every
 * tenant user (ADMIN/STAFF) has their own, independent of everyone else's at the business. */
export async function GET() {
  try {
    const session = await requireTenantSession();
    const user = await runInTenantContext(session.tenantId, session.userId, session.role, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: session.userId }, select: { calendarTextSize: true } })
    );
    return NextResponse.json({ calendarTextSize: user.calendarTextSize });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to load calendar text size", err);
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
    const { calendarTextSize } = parsed.data;

    await runInTenantContext(session.tenantId, session.userId, session.role, (tx) =>
      tx.user.update({ where: { id: session.userId }, data: { calendarTextSize } })
    );

    return NextResponse.json({ calendarTextSize });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to update calendar text size", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
