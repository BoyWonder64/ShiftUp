import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";

const updateSchema = z
  .object({
    label: z.string().min(1).max(200),
    entryKind: z.enum(["SHIFT", "APPOINTMENT", "CUSTOM"]),
    customCalendarId: z.string().uuid().nullable(),
    durationMinutes: z.number().int().min(1).max(1440),
  })
  .partial()
  .refine((data) => data.entryKind !== "CUSTOM" || data.customCalendarId !== null, {
    message: "customCalendarId is required when entryKind is CUSTOM",
    path: ["customCalendarId"],
  });

/** Editing a preset is ADMIN-only, same gate creating one uses. */
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
    const data = parsed.data;

    const eventPreset = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const existing = await tx.eventPreset.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== session.tenantId) throw new Error("NOT_FOUND");

      const nextEntryKind = data.entryKind ?? existing.entryKind;
      const nextCustomCalendarId =
        data.customCalendarId !== undefined ? data.customCalendarId : existing.customCalendarId;
      if (nextEntryKind === "CUSTOM") {
        if (!nextCustomCalendarId) throw new Error("CUSTOM_CALENDAR_REQUIRED");
        const customCalendar = await tx.customCalendar.findUnique({ where: { id: nextCustomCalendarId } });
        if (!customCalendar || customCalendar.tenantId !== session.tenantId) throw new Error("NOT_FOUND");
      }

      return tx.eventPreset.update({
        where: { id },
        data: {
          ...data,
          // A switch away from CUSTOM clears the stale calendar reference -
          // same mutual-exclusivity cleanup the POST route enforces on create.
          customCalendarId: nextEntryKind === "CUSTOM" ? nextCustomCalendarId : null,
        },
      });
    });

    return NextResponse.json({ eventPreset });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (err instanceof Error && err.message === "CUSTOM_CALENDAR_REQUIRED") {
      return NextResponse.json({ error: "Pick a custom calendar for this preset." }, { status: 400 });
    }
    console.error("Failed to update event preset", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

/** Deleting a preset is ADMIN-only - never cascades to any real entry (nothing references a preset after it's used, see createAppointment). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const result = await tx.eventPreset.deleteMany({ where: { id, tenantId: session.tenantId } });
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
    console.error("Failed to delete event preset", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
