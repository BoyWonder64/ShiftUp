import type { LicenseTier } from "@/generated/prisma/client";

/**
 * Agreed price points (confirmed 2026-10-01), midpoints of the ranges
 * discussed: one-time $149-299 per module / $399-499 both; subscription
 * $15-25/mo per module / $35-45/mo both. Flat per tenant, not per-seat.
 * Amounts in cents (Stripe's unit). Easy to tune - nothing else depends on
 * the specific numbers, only on there being one per LicenseTier.
 */
export const ONE_TIME_PRICE_CENTS: Record<LicenseTier, number> = {
  SHIFT_MANAGEMENT: 19_900, // $199
  APPOINTMENT_MANAGER: 19_900, // $199
  BOTH: 44_900, // $449
};

export const SUBSCRIPTION_PRICE_CENTS_PER_MONTH: Record<LicenseTier, number> = {
  SHIFT_MANAGEMENT: 2_000, // $20/mo
  APPOINTMENT_MANAGER: 2_000, // $20/mo
  BOTH: 4_000, // $40/mo
};

export const FEATURE_TIER_LABELS: Record<LicenseTier, string> = {
  SHIFT_MANAGEMENT: "Shift management",
  APPOINTMENT_MANAGER: "Appointment manager",
  BOTH: "Shift management + Appointment manager",
};

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
