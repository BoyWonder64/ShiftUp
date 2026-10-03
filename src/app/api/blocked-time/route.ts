import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";

// Readable by any signed-in tenant member - blocked time shows on the
// calendar for everyone, not just admins, same as holidays.
export async function GET() {
  try {
    const session = await requireTenantSession();
    const blockedTimes = await runInTenantContext(session.tenantId, session.userId, session.role, (tx) =>
      tx.blockedTime.findMany({ orderBy: { startTime: "asc" } })
    );
    return NextResponse.json({ blockedTimes });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    console.error("Failed to list blocked time", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createSchema = z
  .object({
    label: z.string().max(100).trim().optional(),
    startTime: z.string().datetime({ offset: true }).or(z.string().datetime()),
    endTime: z.string().datetime({ offset: true }).or(z.string().datetime()),
  })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: "End time must be after start time.",
  });

// Business-wide (applies to everyone, not one staff member) - gated on
// EDIT_CALENDAR_SETTINGS, same as the holiday toggles this is meant to pair
// with. Purely visual (see BlockedTime's doc comment) - no overlap/conflict
// check against existing appointments or shifts, by design.
export async function POST(request: NextRequest) {
  try {
    const session = await requireTenantSession();

    const json = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const blockedTime = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_CALENDAR_SETTINGS");
      if (!allowed) throw new Error("FORBIDDEN");

      return tx.blockedTime.create({
        data: {
          tenantId: session.tenantId!,
          label: parsed.data.label || null,
          startTime: new Date(parsed.data.startTime),
          endTime: new Date(parsed.data.endTime),
        },
      });
    });

    return NextResponse.json({ blockedTime }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to create blocked time", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
