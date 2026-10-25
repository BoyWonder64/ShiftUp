import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";

// Read-only metadata about which presets exist - no extra permission check
// beyond "is a real session," since a preset itself reveals nothing
// sensitive and actually using one still goes through the normal
// CREATE_SHIFTS/CREATE_APPOINTMENTS/CREATE_CUSTOM_ENTRIES gate on the real
// create route. Needed by anyone who can create any entry kind, so there's
// no single natural permission key to tie this to instead.
export async function GET() {
  try {
    const session = await requireTenantSession();
    const eventPresets = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      return tx.eventPreset.findMany({
        where: { tenantId: session.tenantId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
    });
    return NextResponse.json({ eventPresets });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    console.error("Failed to list event presets", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createSchema = z
  .object({
    label: z.string().min(1).max(200),
    entryKind: z.enum(["SHIFT", "APPOINTMENT", "CUSTOM"]),
    customCalendarId: z.string().uuid().optional(),
    durationMinutes: z.number().int().min(1).max(1440),
  })
  .refine((data) => data.entryKind !== "CUSTOM" || !!data.customCalendarId, {
    message: "customCalendarId is required when entryKind is CUSTOM",
    path: ["customCalendarId"],
  });

/** Creating a preset event is ADMIN-only, same gate Settings > Calendars itself uses. */
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

    const eventPreset = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      if (data.entryKind === "CUSTOM") {
        const customCalendar = await tx.customCalendar.findUnique({ where: { id: data.customCalendarId } });
        if (!customCalendar || customCalendar.tenantId !== session.tenantId) throw new Error("NOT_FOUND");
      }
      const sortOrder = await tx.eventPreset.count({ where: { tenantId: session.tenantId } });
      return tx.eventPreset.create({
        data: {
          tenantId: session.tenantId,
          label: data.label,
          entryKind: data.entryKind,
          customCalendarId: data.entryKind === "CUSTOM" ? data.customCalendarId : null,
          durationMinutes: data.durationMinutes,
          sortOrder,
        },
      });
    });

    return NextResponse.json({ eventPreset }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "That custom calendar doesn't exist." }, { status: 404 });
    }
    console.error("Failed to create event preset", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
