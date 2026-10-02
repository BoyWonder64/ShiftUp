"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BILLING_PLAN_LABELS,
  FEATURE_TIER_LABELS,
  ONE_TIME_PRICE_CENTS,
  SUBSCRIPTION_PRICE_CENTS_PER_MONTH,
  formatCents,
} from "@/lib/licensing/pricing";

type BillingPlan = "FREE" | "ONE_TIME" | "SUBSCRIPTION";
type LicenseStatus = "ACTIVE" | "EXPIRED";
type LicenseTier = keyof typeof FEATURE_TIER_LABELS;

interface Tenant {
  id: string;
  name: string;
  slug: string;
  disabled: boolean;
  excludeFromIncome: boolean;
  license: { tier: LicenseTier; billingPlan: BillingPlan; status: LicenseStatus } | null;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

export function RevenueOverview() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/superadmin/tenants");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!cancelled) setTenants(data.tenants);
      } catch {
        if (!cancelled) setError("Couldn't load revenue data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { mrrCents, oneTimeCents, counts, rows } = useMemo(() => {
    let mrr = 0;
    let oneTime = 0;
    const planCounts: Record<BillingPlan, number> = { FREE: 0, ONE_TIME: 0, SUBSCRIPTION: 0 };

    for (const t of tenants) {
      if (t.excludeFromIncome) continue;
      const plan = t.license?.billingPlan ?? "FREE";
      planCounts[plan] += 1;
      if (!t.license) continue;
      if (plan === "SUBSCRIPTION" && t.license.status === "ACTIVE") {
        mrr += SUBSCRIPTION_PRICE_CENTS_PER_MONTH[t.license.tier];
      }
      if (plan === "ONE_TIME") {
        oneTime += ONE_TIME_PRICE_CENTS[t.license.tier];
      }
    }

    const rows = tenants
      .filter((t) => t.license && t.license.billingPlan !== "FREE")
      .map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        disabled: t.disabled,
        excludeFromIncome: t.excludeFromIncome,
        plan: t.license!.billingPlan,
        status: t.license!.status,
        tierLabel: FEATURE_TIER_LABELS[t.license!.tier],
        value:
          t.license!.billingPlan === "SUBSCRIPTION"
            ? `${formatCents(SUBSCRIPTION_PRICE_CENTS_PER_MONTH[t.license!.tier])}/mo`
            : `${formatCents(ONE_TIME_PRICE_CENTS[t.license!.tier])} one-time`,
      }));

    return { mrrCents: mrr, oneTimeCents: oneTime, counts: planCounts, rows };
  }, [tenants]);

  if (loading) {
    return <p className="text-sm text-gray-400">Loading...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-500">
        Computed from each tenant&apos;s current <code>License</code> row (set by real Stripe
        checkout, or by a manual override from Customers) - not a live Stripe feed. With checkout
        not yet tested end-to-end (see TODO.md), today this mostly reflects manual overrides.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Recurring revenue"
          value={formatCents(mrrCents)}
          hint={`/mo · ${counts.SUBSCRIPTION} subscription tenant${counts.SUBSCRIPTION === 1 ? "" : "s"}`}
        />
        <StatCard
          label="One-time revenue"
          value={formatCents(oneTimeCents)}
          hint={`lifetime · ${counts.ONE_TIME} tenant${counts.ONE_TIME === 1 ? "" : "s"}`}
        />
        <StatCard label="Free tenants" value={String(counts.FREE)} />
        <StatCard label="Paying tenants" value={String(counts.ONE_TIME + counts.SUBSCRIPTION)} />
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-medium">Paying tenants</h2>
          <table className="mt-4 w-full min-w-150 text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs tracking-wide text-gray-400 uppercase">
                <th className="py-2 pr-3">Business</th>
                <th className="py-2 pr-3">Module</th>
                <th className="py-2 pr-3">Plan</th>
                <th className="py-2 pr-3">License status</th>
                <th className="py-2 pr-3">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b border-gray-100 last:border-0 ${r.excludeFromIncome ? "opacity-50" : ""}`}>
                  <td className="py-2 pr-3">
                    <div className="font-medium text-gray-900">{r.name}</div>
                    <div className="text-xs text-gray-400">/{r.slug}</div>
                  </td>
                  <td className="py-2 pr-3 text-gray-600">{r.tierLabel}</td>
                  <td className="py-2 pr-3 text-gray-600">{BILLING_PLAN_LABELS[r.plan]}</td>
                  <td className="py-2 pr-3 text-gray-600">{r.status}</td>
                  <td className="py-2 pr-3 font-medium text-gray-900">
                    {r.excludeFromIncome ? (
                      <span className="text-xs font-normal text-gray-400 italic">excluded (test/demo)</span>
                    ) : (
                      r.value
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
