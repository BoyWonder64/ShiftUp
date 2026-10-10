import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runInPublicContext } from "@/lib/tenant-context";
import { resolvePublicBookingTenantId } from "@/lib/public-booking";
import { listAvailableSlotsByStaff, collapseForDisplay, BookingUnavailableError } from "@/modules/scheduling/availability";

const querySchema = z
  .object({
    serviceTypeId: z.string().uuid(),
    staffId: z.string().uuid().optional(),
    from: z.string().datetime(),
    to: z.string().datetime(),
  })
  .refine((q) => new Date(q.to) > new Date(q.from), { message: "to must be after from" })
  // Cap the queryable window per request - a visitor's date picker only ever
  // needs a few weeks at a time; this isn't the real bound on how far ahead
  // someone can book (Tenant.publicBookingWindowDays, enforced inside
  // listAvailableSlotsByStaff), just an anti-abuse cap on one request's cost.
  .refine((q) => new Date(q.to).getTime() - new Date(q.from).getTime() <= 60 * 24 * 60 * 60 * 1000, {
    message: "Range too large",
  });

/** Unauthenticated - open slots for a service (and optionally a specific staff member) in a date range. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      serviceTypeId: url.searchParams.get("serviceTypeId"),
      staffId: url.searchParams.get("staffId") ?? undefined,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const tenantId = await resolvePublicBookingTenantId(tenantSlug);
    const slots = await runInPublicContext(tenantId, (tx) =>
      listAvailableSlotsByStaff(tx, tenantId, {
        serviceTypeId: parsed.data.serviceTypeId,
        staffId: parsed.data.staffId,
        rangeStart: new Date(parsed.data.from),
        rangeEnd: new Date(parsed.data.to),
      })
    );

    return NextResponse.json({ slots: collapseForDisplay(slots) });
  } catch (err) {
    if (err instanceof BookingUnavailableError) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("Failed to load public availability", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
