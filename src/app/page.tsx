import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { FREE_PLAN_LIMITS } from "@/lib/licensing/limits";
import { ONE_TIME_PRICE_CENTS, SUBSCRIPTION_PRICE_CENTS_PER_MONTH, formatCents } from "@/lib/licensing/pricing";

const FEATURES = [
  {
    title: "Shift management",
    description: "Staff rosters, shifts, and time-off — built for teams of any kind.",
  },
  {
    title: "Appointment manager",
    description: "Client records, service types, and a real scheduling calendar — map directions included.",
  },
  {
    title: "Free to start",
    description: `Up to ${FREE_PLAN_LIMITS.maxStaffProfiles} staff profile and ${FREE_PLAN_LIMITS.maxAppointmentsPerRollingMonth} appointments every 30 days, free for as long as you want.`,
  },
];

const PRICING = [
  {
    title: "Free",
    price: "$0",
    cadence: "forever",
    description: `Try the full product with a capped plan — ${FREE_PLAN_LIMITS.maxStaffProfiles} staff profile, ${FREE_PLAN_LIMITS.maxAppointmentsPerRollingMonth} appointments per rolling 30 days.`,
    highlight: false,
  },
  {
    title: "One-time purchase",
    price: formatCents(ONE_TIME_PRICE_CENTS.SHIFT_MANAGEMENT),
    cadence: `per module, or ${formatCents(ONE_TIME_PRICE_CENTS.BOTH)} for both`,
    description: "Pay once, use it for good — no recurring charge, no per-seat fees.",
    highlight: true,
  },
  {
    title: "Subscription",
    price: `${formatCents(SUBSCRIPTION_PRICE_CENTS_PER_MONTH.SHIFT_MANAGEMENT)}/mo`,
    cadence: `per module, or ${formatCents(SUBSCRIPTION_PRICE_CENTS_PER_MONTH.BOTH)}/mo for both`,
    description: "Lower upfront cost, billed monthly, cancel anytime.",
    highlight: false,
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-primary-50 via-white to-white" />
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-8 pt-24 pb-20 text-center">
          <span className="rounded-full bg-primary-50 px-4 py-1 text-xs font-semibold tracking-wide text-primary-700 uppercase">
            Scheduling, built simple
          </span>
          <h1 className="font-display text-5xl font-bold tracking-tight text-gray-900">
            Shift<span className="text-primary-500">Up</span>
          </h1>
          <p className="max-w-xl text-lg text-gray-600">
            Scheduling for appointment-based service businesses and
            shift-based crews — staff rosters, time-off, and role-based
            permissions on one calendar. Flat pricing per business, never
            per seat.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-lg bg-linear-to-r from-primary-500 to-primary-550 px-6 py-3 font-medium text-white shadow-md transition-all hover:shadow-lg"
            >
              Create your business account
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-gray-200 bg-white px-6 py-3 font-medium text-gray-700 shadow-sm transition-all hover:border-primary-200 hover:text-primary-700 hover:shadow-md"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-8 pb-24 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md"
          >
            <div className="mb-3 h-1.5 w-10 rounded-full bg-linear-to-r from-primary-500 to-primary-550" />
            <h2 className="text-lg font-semibold text-gray-900">{feature.title}</h2>
            <p className="mt-2 text-sm text-gray-600">{feature.description}</p>
          </div>
        ))}
      </section>

      <section id="pricing" className="mx-auto w-full max-w-5xl px-8 pb-24">
        <div className="mb-10 flex flex-col items-center gap-2 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">Simple, flat pricing</h2>
          <p className="max-w-xl text-sm text-gray-600">
            One price per business, not per employee — pick shift management, appointment
            manager, or both.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {PRICING.map((plan) => (
            <div
              key={plan.title}
              className={`rounded-xl border p-6 shadow-sm transition-all hover:shadow-md ${
                plan.highlight
                  ? "border-primary-200 bg-primary-50/40"
                  : "border-gray-200 bg-white"
              }`}
            >
              <h3 className="text-lg font-semibold text-gray-900">{plan.title}</h3>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">{plan.price}</p>
              <p className="text-sm text-gray-500">{plan.cadence}</p>
              <p className="mt-3 text-sm text-gray-600">{plan.description}</p>
            </div>
          ))}
        </div>
      </section>
      </main>
    </>
  );
}
