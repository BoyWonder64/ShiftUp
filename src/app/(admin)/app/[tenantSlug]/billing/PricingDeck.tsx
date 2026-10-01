"use client";

import { useState } from "react";
import type { LicenseTier } from "@/generated/prisma/client";
import { formatCents } from "@/lib/licensing/pricing";

const TIER_OPTIONS: Array<{ value: LicenseTier; title: string; description: string }> = [
  {
    value: "SHIFT_MANAGEMENT",
    title: "Shift management",
    description: "Staff rosters, shifts, and time-off.",
  },
  {
    value: "APPOINTMENT_MANAGER",
    title: "Appointment manager",
    description: "Client bookings, notes, and payment collection.",
  },
  {
    value: "BOTH",
    title: "Both",
    description: "Everything, in one account.",
  },
];

/** What's actually built for each tier - changes the feature bullets below as the tier picker changes. */
const FEATURES_BY_TIER: Record<LicenseTier, string[]> = {
  SHIFT_MANAGEMENT: [
    "Staff rosters & shift scheduling",
    "Drag-and-drop shift calendar",
    "Job time & value estimates for trade work",
  ],
  APPOINTMENT_MANAGER: [
    "Client booking calendar",
    "Client & service catalog management",
    "Job/visit notes at a glance",
  ],
  BOTH: [
    "Staff rosters + client bookings, one calendar",
    "Client & service catalog management",
    "Job time & value estimates for trade work",
  ],
};

/** True of every plan, regardless of tier - things the product does for everyone. */
const COMMON_FEATURES = [
  "Double-booking protection built in",
  "Configurable staff roles & permissions",
];

export function PricingDeck({
  defaultTier,
  freeLimits,
  oneTimePriceCents,
  subscriptionPriceCentsPerMonth,
}: {
  defaultTier: LicenseTier;
  freeLimits: { maxStaffProfiles: number; maxAppointmentsPerRollingMonth: number };
  oneTimePriceCents: Record<LicenseTier, number>;
  subscriptionPriceCentsPerMonth: Record<LicenseTier, number>;
}) {
  const [tier, setTier] = useState<LicenseTier>(defaultTier);
  const [loading, setLoading] = useState<"ONE_TIME" | "SUBSCRIPTION" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function purchase(billingPlan: "ONE_TIME" | "SUBSCRIPTION") {
    setLoading(billingPlan);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingPlan, tier }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Couldn't start checkout.");
        setLoading(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">What do you want?</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TIER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTier(option.value)}
              className={`rounded-lg border px-3 py-2 text-left transition-all ${
                tier === option.value
                  ? "border-primary-500 bg-primary-50 shadow-sm ring-1 ring-primary-500"
                  : "border-gray-200 bg-white hover:border-primary-300 hover:shadow-sm"
              }`}
            >
              <div className="font-medium">{option.title}</div>
              <div className="text-xs text-gray-500">{option.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Free */}
        <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Free</h3>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
              Current plan
            </span>
          </div>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
            $0
          </p>
          <p className="mb-4 text-xs text-gray-400">no payment required</p>
          <ul className="flex flex-1 flex-col gap-1.5 text-sm text-gray-600">
            <li>· {freeLimits.maxStaffProfiles} staff member</li>
            <li>· {freeLimits.maxAppointmentsPerRollingMonth} appointments / month</li>
            {FEATURES_BY_TIER[tier].map((feature) => (
              <li key={feature}>· {feature}</li>
            ))}
            {COMMON_FEATURES.map((feature) => (
              <li key={feature}>· {feature}</li>
            ))}
          </ul>
        </div>

        {/* Lifetime (one-time) */}
        <div className="relative flex flex-col rounded-xl border border-primary-200 bg-linear-to-br from-primary-50 to-white p-5 shadow-sm">
          <span className="absolute -top-2.5 left-5 rounded-full bg-linear-to-r from-primary-500 to-primary-550 px-2.5 py-0.5 text-xs font-medium text-white shadow-sm">
            Pay once
          </span>
          <h3 className="mt-1 font-semibold text-gray-900">Lifetime</h3>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
            {formatCents(oneTimePriceCents[tier])}
          </p>
          <p className="mb-4 text-xs text-gray-400">one-time · yours forever</p>
          <ul className="flex flex-1 flex-col gap-1.5 text-sm text-gray-600">
            <li>· Unlimited staff</li>
            <li>· Unlimited appointments</li>
            {FEATURES_BY_TIER[tier].map((feature) => (
              <li key={feature}>· {feature}</li>
            ))}
            {COMMON_FEATURES.map((feature) => (
              <li key={feature}>· {feature}</li>
            ))}
            <li>· No recurring charge, ever</li>
          </ul>
          <button
            onClick={() => purchase("ONE_TIME")}
            disabled={loading !== null}
            className="mt-5 rounded-lg bg-linear-to-r from-primary-500 to-primary-550 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50"
          >
            {loading === "ONE_TIME" ? "Redirecting..." : "Buy lifetime access"}
          </button>
        </div>

        {/* Subscription */}
        <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900">Subscription</h3>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
            {formatCents(subscriptionPriceCentsPerMonth[tier])}
            <span className="text-base font-normal text-gray-400">/mo</span>
          </p>
          <p className="mb-4 text-xs text-gray-400">billed monthly · cancel anytime</p>
          <ul className="flex flex-1 flex-col gap-1.5 text-sm text-gray-600">
            <li>· Unlimited staff</li>
            <li>· Unlimited appointments</li>
            {FEATURES_BY_TIER[tier].map((feature) => (
              <li key={feature}>· {feature}</li>
            ))}
            {COMMON_FEATURES.map((feature) => (
              <li key={feature}>· {feature}</li>
            ))}
            <li>· Lower cost to start, cancel whenever</li>
          </ul>
          <button
            onClick={() => purchase("SUBSCRIPTION")}
            disabled={loading !== null}
            className="mt-5 rounded-lg border border-primary-200 bg-white px-4 py-2.5 text-sm font-medium text-primary-700 shadow-sm transition-all hover:bg-primary-50 hover:shadow-md disabled:opacity-50"
          >
            {loading === "SUBSCRIPTION" ? "Redirecting..." : "Subscribe monthly"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
