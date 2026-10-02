import type { Tx } from "@/lib/tenant-context";
import type { BillingPlan, LicenseStatus, LicenseTier } from "@/generated/prisma/client";

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

/** Direct, no-Stripe write to a tenant's billing plan/status - only for the
 * SUPERADMIN console (src/app/superadmin), e.g. comping an account or
 * manually fixing a billing issue. Bypasses checkout entirely, unlike the
 * webhook-driven updates in POST /api/billing/webhook. */
export async function setLicensePlan(
  tx: Tx,
  tenantId: string,
  data: { billingPlan: BillingPlan; status: LicenseStatus }
) {
  return tx.license.update({
    where: { tenantId },
    data: { billingPlan: data.billingPlan, status: data.status },
  });
}
