import { NextRequest, NextResponse } from "next/server";
import { runInPublicContext } from "@/lib/tenant-context";
import { resolvePublicBookingTenantId } from "@/lib/public-booking";
import { BookingUnavailableError } from "@/modules/scheduling/availability";

/** Unauthenticated - what the public booking page (src/app/book/[tenantSlug]) needs to render its first step: business branding, bookable services, bookable staff. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  try {
    const tenantId = await resolvePublicBookingTenantId(tenantSlug);
    const data = await runInPublicContext(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { name: true, logoDataUrl: true },
      });
      const serviceTypes = await tx.serviceType.findMany({
        where: { isActive: true, isPubliclyBookable: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, durationMinutes: true, price: true },
      });
      const staff = await tx.staffProfile.findMany({
        where: { workingHours: { some: {} } },
        orderBy: { displayName: "asc" },
        select: { id: true, displayName: true },
      });
      return { tenant, serviceTypes, staff };
    });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof BookingUnavailableError) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("Failed to load public booking info", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
