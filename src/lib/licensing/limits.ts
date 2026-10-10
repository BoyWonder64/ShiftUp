import type { Tx } from "@/lib/tenant-context";
import type { BillingPlan } from "@/generated/prisma/client";

/**
 * Usage caps for the FREE billing plan - deliberately placeholder numbers,
 * not derived from real cost/pricing data yet (no pricing has been set).
 * ONE_TIME and SUBSCRIPTION are uncapped. Tune these freely; nothing else
 * depends on the specific values.
 */
export const FREE_PLAN_LIMITS = {
  maxStaffProfiles: 1,
  maxAppointmentsPerRollingMonth: 10,
};

export class PlanLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

async function getBillingPlan(tx: Tx, tenantId: string): Promise<BillingPlan> {
  const license = await tx.license.findUnique({ where: { tenantId } });
  return license?.billingPlan ?? "FREE";
}

/** Throws PlanLimitError if creating one more StaffProfile would exceed the FREE plan cap. */
export async function assertCanAddStaffProfile(tx: Tx, tenantId: string): Promise<void> {
  const plan = await getBillingPlan(tx, tenantId);
  if (plan !== "FREE") return;

  const count = await tx.staffProfile.count({ where: { tenantId } });
  if (count >= FREE_PLAN_LIMITS.maxStaffProfiles) {
    throw new PlanLimitError(
      `The free plan is limited to ${FREE_PLAN_LIMITS.maxStaffProfiles} staff member(s). Upgrade to add more.`
    );
  }
}

/**
 * Schedule templates (TODO.md: "decided 2026-10-02: paid feature" - a
 * manager-efficiency feature with no cost-driver reason to be free, a
 * natural upsell) - unlike the usage caps above, this isn't a count limit,
 * it's a whole-feature gate: FREE tenants can't use it at all, ONE_TIME/
 * SUBSCRIPTION can regardless of usage.
 */
export async function assertScheduleTemplatesEnabled(tx: Tx, tenantId: string): Promise<void> {
  const plan = await getBillingPlan(tx, tenantId);
  if (plan === "FREE") {
    throw new PlanLimitError("Schedule templates are a paid feature. Upgrade to use them.");
  }
}

/**
 * The calendar's configurable visible-hours range (Settings > Calendar >
 * "Calendar hours", `Tenant.calendarStartMinute`/`calendarEndMinute`) -
 * paid feature, same reasoning/shape as schedule templates above: a
 * convenience with no cost-driver reason to be free. FREE tenants keep the
 * full-day default and can't narrow it; ONE_TIME/SUBSCRIPTION can. Doesn't
 * cover the rest of the Calendar settings page (holidays, event colors),
 * which stay free.
 */
export async function assertCalendarHoursEnabled(tx: Tx, tenantId: string): Promise<void> {
  const plan = await getBillingPlan(tx, tenantId);
  if (plan === "FREE") {
    throw new PlanLimitError("Calendar hours are a paid feature. Upgrade to customize them.");
  }
}

/**
 * The public self-booking widget (TODO.md: "decided 2026-10-02: paid
 * feature" - the single biggest upsell lever noted there) - same
 * whole-feature gate shape as schedule templates/calendar hours above. This
 * only gates the *paid-plan* dimension; Tenant.publicBookingEnabled is a
 * second, independent admin on/off switch layered on top (a paying tenant
 * can still choose not to expose public booking) - both must pass before the
 * public routes under src/app/api/public/booking/** will serve anything.
 */
export async function assertBookingWidgetEnabled(tx: Tx, tenantId: string): Promise<void> {
  const plan = await getBillingPlan(tx, tenantId);
  if (plan === "FREE") {
    throw new PlanLimitError("The public booking widget is a paid feature. Upgrade to use it.");
  }
}

/** Throws PlanLimitError if creating one more Appointment would exceed the FREE plan's rolling-30-day cap. */
export async function assertCanAddAppointment(tx: Tx, tenantId: string): Promise<void> {
  const plan = await getBillingPlan(tx, tenantId);
  if (plan !== "FREE") return;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const count = await tx.appointment.count({
    where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
  });
  if (count >= FREE_PLAN_LIMITS.maxAppointmentsPerRollingMonth) {
    throw new PlanLimitError(
      `The free plan is limited to ${FREE_PLAN_LIMITS.maxAppointmentsPerRollingMonth} appointments per month. Upgrade to add more.`
    );
  }
}
