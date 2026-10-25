import Link from "next/link";
import { HolidaySettings } from "./HolidaySettings";
import { BlockedTimeSettings } from "./BlockedTimeSettings";
import { EventColorSettings } from "./EventColorSettings";
import { CalendarHoursSettings } from "./CalendarHoursSettings";
import { EventEditingSettings } from "./EventEditingSettings";
import { requireSettingsSection } from "../access";
import { runInTenantContext } from "@/lib/tenant-context";

export default async function CalendarSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await requireSettingsSection(tenantSlug, "calendar");

  // Calendar hours specifically is a paid feature (see
  // assertCalendarHoursEnabled in src/lib/licensing/limits.ts) - Holidays
  // and Event colors on this same page are not, same split as everywhere
  // else a paid add-on sits alongside free settings (e.g. Appointments'
  // service types vs. schedule templates). The API enforces this
  // regardless of what the UI shows; this is just the upsell in place of
  // the real card for a FREE-plan tenant.
  const license = await runInTenantContext(ctx.tenant.id, ctx.userId, ctx.role, (tx) =>
    tx.license.findUnique({ where: { tenantId: ctx.tenant.id } })
  );
  const isPaid = license?.billingPlan === "ONE_TIME" || license?.billingPlan === "SUBSCRIPTION";

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Calendar Display</h2>
      <EventEditingSettings />
      {isPaid ? (
        <CalendarHoursSettings />
      ) : (
        <section className="rounded-xl border border-primary-100 bg-primary-50/40 p-5 text-center shadow-sm">
          <p className="text-gray-700">Calendar hours are a paid feature.</p>
          <p className="mt-1 text-sm text-gray-500">
            Upgrade to narrow the calendar&apos;s visible time range to your actual business hours.
          </p>
          <Link
            href={`/app/${tenantSlug}/billing`}
            className="mt-3 inline-block rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600"
          >
            View plans
          </Link>
        </section>
      )}
      <HolidaySettings />
      <BlockedTimeSettings />
      <EventColorSettings />
    </div>
  );
}
