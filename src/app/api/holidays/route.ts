import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";

// Readable by any signed-in tenant member - holidays show on the calendar
// for everyone, not just admins.
export async function GET() {
  try {
    const session = await requireTenantSession();
    const holidays = await runInTenantContext(session.tenantId, session.userId, session.role, (tx) =>
      tx.holiday.findMany({ orderBy: { date: "asc" } })
    );
    return NextResponse.json({ holidays });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    console.error("Failed to list holidays", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
  recurring: z.boolean().default(true),
  blocked: z.boolean().default(false),
});

// Custom holidays are tenant-wide (shown to everyone, shape the calendar
// for the whole business) - gated on EDIT_CALENDAR_SETTINGS, same as the
// federal-holiday toggle and the 5 built-in event colors (all part of the
// same Settings > Calendar page, see sections.ts).
export async function POST(request: NextRequest) {
  try {
    const session = await requireTenantSession();

    const json = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const holiday = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_CALENDAR_SETTINGS");
      if (!allowed) throw new Error("FORBIDDEN");

      return tx.holiday.create({
        data: {
          tenantId: session.tenantId!,
          name: parsed.data.name,
          // Stored as a plain date at UTC midnight - `recurring` holidays
          // only ever use the month/day part of this on display, the year
          // is otherwise ignored (see the Holiday model's doc comment).
          date: new Date(`${parsed.data.date}T00:00:00.000Z`),
          recurring: parsed.data.recurring,
          blocked: parsed.data.blocked,
        },
      });
    });

    return NextResponse.json({ holiday }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to create holiday", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
