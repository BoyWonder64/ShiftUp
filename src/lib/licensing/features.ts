import type { LicenseTier } from "@/generated/prisma/client";

/**
 * Gates access to the two product modules by license tier. A tenant can buy
 * either module standalone or BOTH together - this is the single place that
 * decides which module(s) a tenant's license unlocks, so route guards and nav
 * stay in sync with the pricing model (shift management / appointment manager
 * / both) without duplicating the tier logic everywhere.
 */
export function hasShiftManagement(tier: LicenseTier): boolean {
  return tier === "SHIFT_MANAGEMENT" || tier === "BOTH";
}

export function hasAppointmentManager(tier: LicenseTier): boolean {
  return tier === "APPOINTMENT_MANAGER" || tier === "BOTH";
}

export function featuresForTier(tier: LicenseTier) {
  return {
    shiftManagement: hasShiftManagement(tier),
    appointmentManager: hasAppointmentManager(tier),
  };
}
