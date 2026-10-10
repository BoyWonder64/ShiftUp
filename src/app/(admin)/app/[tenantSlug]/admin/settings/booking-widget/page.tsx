import Link from "next/link";
import { requireSettingsSection } from "../access";
import { runInTenantContext } from "@/lib/tenant-context";
import { BookingWidgetSettings } from "./BookingWidgetSettings";

export default async function BookingWidgetSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await requireSettingsSection(tenantSlug, "booking-widget");

  // Whole-feature paid gate (see assertBookingWidgetEnabled in
  // src/lib/licensing/limits.ts) - same upsell-card-instead-of-the-real-card
  // pattern as Calendar hours. The API enforces this regardless of what the
  // UI shows.
  const license = await runInTenantContext(ctx.tenant.id, ctx.userId, ctx.role, (tx) =>
    tx.license.findUnique({ where: { tenantId: ctx.tenant.id } })
  );
  const isPaid = license?.billingPlan === "ONE_TIME" || license?.billingPlan === "SUBSCRIPTION";

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Booking Widget</h2>
      {isPaid ? (
        <BookingWidgetSettings tenantSlug={tenantSlug} />
      ) : (
        <section className="rounded-xl border border-primary-100 bg-primary-50/40 p-5 text-center shadow-sm">
          <p className="text-gray-700">The public booking widget is a paid feature.</p>
          <p className="mt-1 text-sm text-gray-500">
            Upgrade to let clients book themselves from your own website, with no login required.
          </p>
          <Link
            href={`/app/${tenantSlug}/billing`}
            className="mt-3 inline-block rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600"
          >
            View plans
          </Link>
        </section>
      )}
    </div>
  );
}
