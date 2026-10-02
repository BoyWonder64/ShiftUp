import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { AppHeader } from "@/components/AppHeader";
import {
  ONE_TIME_PRICE_CENTS,
  SUBSCRIPTION_PRICE_CENTS_PER_MONTH,
  FEATURE_TIER_LABELS,
} from "@/lib/licensing/pricing";
import { FREE_PLAN_LIMITS } from "@/lib/licensing/limits";
import { PricingDeck } from "./PricingDeck";

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { tenantSlug } = await params;
  const { checkout } = await searchParams;
  const session = await getCurrentSession();

  if (!session || session.role !== "ADMIN" || !session.tenantId) {
    redirect("/login");
  }

  const { tenant, license } = await runInTenantContext(
    session.tenantId,
    session.userId,
    "ADMIN",
    async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: session.tenantId! } });
      const license = await tx.license.findUnique({ where: { tenantId: session.tenantId! } });
      return { tenant, license };
    }
  );

  if (!tenant || tenant.slug !== tenantSlug || !license) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        tenantSlug={tenantSlug}
        businessName={tenant.name}
        role="ADMIN"
        canViewRoster
        logoUrl={tenant.logoDataUrl}
        companyNameFont={tenant.companyNameFont}
      />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
        <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>

        {checkout === "success" && (
          <p className="rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700 shadow-sm">
            Payment received — your plan has been updated.
          </p>
        )}
        {checkout === "cancelled" && (
          <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600 shadow-sm">
            Checkout was cancelled. No changes were made.
          </p>
        )}

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium text-gray-500">Current plan</h2>
          <p className="mt-1 text-xl font-semibold tracking-tight">
            {FEATURE_TIER_LABELS[license.tier]}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
              {license.billingPlan === "FREE"
                ? "Free"
                : license.billingPlan === "ONE_TIME"
                  ? "One-time purchase"
                  : "Subscription"}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              {license.status}
            </span>
          </div>
          {license.expiresAt && (
            <p className="mt-3 text-sm text-gray-500">
              Renews {license.expiresAt.toLocaleDateString()}
            </p>
          )}
        </div>

        {license.billingPlan === "FREE" && (
          <div>
            <h2 className="mb-1 text-xl font-semibold tracking-tight">Upgrade</h2>
            <p className="mb-5 text-sm text-gray-600">
              Buy just shift management, just appointment management, or both —
              independent of what you&apos;re exploring for free.
            </p>
            <PricingDeck
              defaultTier={license.tier}
              freeLimits={FREE_PLAN_LIMITS}
              oneTimePriceCents={ONE_TIME_PRICE_CENTS}
              subscriptionPriceCentsPerMonth={SUBSCRIPTION_PRICE_CENTS_PER_MONTH}
            />
          </div>
        )}
      </main>
    </div>
  );
}
