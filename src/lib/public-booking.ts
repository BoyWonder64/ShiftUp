import { runInSystemContext } from "@/lib/tenant-context";
import { getTenantBySlug } from "@/modules/tenancy/service";
import { assertBookingWidgetEnabled, PlanLimitError } from "@/lib/licensing/limits";
import { BookingUnavailableError } from "@/modules/scheduling/availability";

/**
 * Resolves a tenant slug to a tenantId eligible for the public booking routes
 * (src/app/api/public/booking/**). Every ineligibility reason (no such slug,
 * disabled tenant, FREE plan, Tenant.publicBookingEnabled off) throws the
 * same BookingUnavailableError so route handlers can map all of them to one
 * indistinguishable 404 - an outside caller should never be able to tell
 * "no such business" apart from "this business hasn't upgraded" or "this
 * business turned booking off".
 *
 * Runs in runInSystemContext since the tenantId isn't known yet (same
 * slug-lookup precedent as POST /api/auth/signup). Callers should open their
 * own runInPublicContext(tenantId, ...) for everything after this resolves,
 * so the actual availability/booking work stays RLS-scoped to one tenant
 * rather than running the whole request with RLS bypassed.
 */
export async function resolvePublicBookingTenantId(slug: string): Promise<string> {
  return runInSystemContext(async (tx) => {
    const tenant = await getTenantBySlug(tx, slug);
    if (!tenant || tenant.disabled) throw new BookingUnavailableError("Not found.");
    try {
      await assertBookingWidgetEnabled(tx, tenant.id);
    } catch (err) {
      if (err instanceof PlanLimitError) throw new BookingUnavailableError("Not found.");
      throw err;
    }
    if (!tenant.publicBookingEnabled) throw new BookingUnavailableError("Not found.");
    return tenant.id;
  });
}
