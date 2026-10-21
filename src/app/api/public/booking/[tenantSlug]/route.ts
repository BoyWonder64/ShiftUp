import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addMinutes } from "date-fns";
import { runInPublicContext } from "@/lib/tenant-context";
import { resolvePublicBookingTenantId } from "@/lib/public-booking";
import { listAvailableSlotsByStaff, BookingUnavailableError } from "@/modules/scheduling/availability";
import { createAppointment, SchedulingConflictError } from "@/modules/scheduling/service";

const bookSchema = z.object({
  serviceTypeId: z.string().uuid(),
  staffId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  client: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().max(40).optional().or(z.literal("")),
  }),
  // Hidden form field a real visitor never fills in - a basic spam trap
  // (real rate-limiting is a pre-existing cross-cutting gap, see TODO.md's
  // Security section, not solved here). Any non-empty value here is treated
  // as invalid input, same as a failed zod parse.
  website: z.string().max(0).optional().or(z.literal("")),
});

/**
 * Unauthenticated - the public self-booking write path
 * (src/app/book/[tenantSlug], embedded via public/booking-widget.js). Runs
 * under runInPublicContext, not a user session - every write still goes
 * through the exact same createAppointment used by the authenticated admin
 * route (src/app/api/appointments/route.ts), so the DB-level double-booking
 * EXCLUDE constraint applies identically here.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  try {
    const json = await request.json().catch(() => null);
    const parsed = bookSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const data = parsed.data;
    const startTime = new Date(data.startTime);

    const tenantId = await resolvePublicBookingTenantId(tenantSlug);

    const appointment = await runInPublicContext(tenantId, async (tx) => {
      // Re-run availability for the exact requested window right before
      // writing - a race-safety check (the DB EXCLUDE constraint below is
      // the real guarantee), and how "any available" staff gets resolved to
      // one actual staffId.
      const candidateSlots = await listAvailableSlotsByStaff(tx, tenantId, {
        serviceTypeId: data.serviceTypeId,
        staffId: data.staffId,
        rangeStart: startTime,
        rangeEnd: addMinutes(startTime, 1440),
      });
      const match = candidateSlots.find((s) => s.start.getTime() === startTime.getTime());
      if (!match) throw new Error("SLOT_UNAVAILABLE");

      const client = await tx.client.create({
        data: {
          tenantId,
          name: data.client.name,
          email: data.client.email || null,
          phone: data.client.phone || null,
          isGuest: true,
        },
      });

      return createAppointment(tx, tenantId, {
        staffId: match.staffId,
        entryKind: "APPOINTMENT",
        clientId: client.id,
        serviceTypeId: data.serviceTypeId,
        startTime: match.start,
        endTime: match.end,
        createdByUserId: null,
        source: "SELF_SERVICE",
      });
    });

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (err) {
    if (err instanceof BookingUnavailableError) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (err instanceof Error && err.message === "SLOT_UNAVAILABLE") {
      return NextResponse.json({ error: "That time was just booked - pick another slot." }, { status: 409 });
    }
    if (err instanceof SchedulingConflictError) {
      return NextResponse.json({ error: "That time was just booked - pick another slot." }, { status: 409 });
    }
    console.error("Failed to create public booking", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
