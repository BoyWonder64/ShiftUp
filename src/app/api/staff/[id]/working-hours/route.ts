import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";

/**
 * A staff member's weekly recurring availability (see WorkingHours in
 * prisma/schema.prisma) - the input the public booking widget's availability
 * engine reads (src/modules/scheduling/availability.ts). Gated on
 * EDIT_BOOKING_WIDGET_SETTINGS rather than a staff-management permission:
 * this is config for the booking widget, not a staff-record edit.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    const workingHours = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_BOOKING_WIDGET_SETTINGS");
      if (!allowed) throw new Error("FORBIDDEN");

      const staffProfile = await tx.staffProfile.findUnique({ where: { id } });
      if (!staffProfile || staffProfile.tenantId !== session.tenantId) throw new Error("NOT_FOUND");

      return tx.workingHours.findMany({
        where: { staffProfileId: id },
        orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
      });
    });
    return NextResponse.json({ workingHours });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("Failed to load working hours", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const windowSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine((w) => w.endMinute > w.startMinute, { message: "End time must be after start time." });

const putSchema = z.object({ windows: z.array(windowSchema).max(50) });

/** Replaces this staff member's entire set of weekly windows in one call - simplest given it's always a small, fixed-shape list (delete-then-recreate inside the tx). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    const json = await request.json().catch(() => null);
    const parsed = putSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const workingHours = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_BOOKING_WIDGET_SETTINGS");
      if (!allowed) throw new Error("FORBIDDEN");

      const staffProfile = await tx.staffProfile.findUnique({ where: { id } });
      if (!staffProfile || staffProfile.tenantId !== session.tenantId) throw new Error("NOT_FOUND");

      await tx.workingHours.deleteMany({ where: { staffProfileId: id } });
      if (parsed.data.windows.length > 0) {
        await tx.workingHours.createMany({
          data: parsed.data.windows.map((w) => ({
            tenantId: session.tenantId,
            staffProfileId: id,
            dayOfWeek: w.dayOfWeek,
            startMinute: w.startMinute,
            endMinute: w.endMinute,
          })),
        });
      }
      return tx.workingHours.findMany({
        where: { staffProfileId: id },
        orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
      });
    });

    return NextResponse.json({ workingHours });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("Failed to update working hours", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
