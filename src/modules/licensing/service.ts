import type { Tx } from "@/lib/tenant-context";
import type { LicenseTier } from "@/generated/prisma/client";

/** Every new tenant starts on the FREE billing plan - permanent and
 * usage-capped (src/lib/licensing/limits.ts), not a ticking trial. `tier` is
 * which module(s) they picked at signup (shift management / appointment
 * manager / both) - see src/lib/licensing/features.ts for how that gates
 * module access. Upgrading to ONE_TIME or SUBSCRIPTION happens later via
 * Stripe checkout (Phase 3, not built yet) and would update this same row. */
export async function createFreeLicense(tx: Tx, tenantId: string, tier: LicenseTier) {
  return tx.license.create({
    data: {
      tenantId,
      tier,
      billingPlan: "FREE",
      status: "ACTIVE",
    },
  });
}
