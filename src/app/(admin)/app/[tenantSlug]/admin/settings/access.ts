import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext, type Tx, type TenantRole } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { getCalendarNavAccess } from "@/lib/permissions/calendarAccess";
import { SETTINGS_SECTIONS, type SettingsSection } from "./sections";

async function canAccessSection(
  tx: Tx,
  tenantId: string,
  role: string,
  roleId: string | null,
  section: SettingsSection
): Promise<boolean> {
  if (section.requirement === "ALWAYS") return true;
  if (section.requirement === "ADMIN") return role === "ADMIN";
  return hasPermission(tx, tenantId, role, roleId, section.requirement);
}

/**
 * Replaces the old getAdminTenant.ts chokepoint: Settings is reachable by
 * any signed-in tenant member now (ADMIN or STAFF), not just ADMIN - which
 * sections a given member can actually use is decided per-section via
 * SETTINGS_SECTIONS' `requirement` (see sections.ts). React's cache() dedupes
 * this to one DB round trip per request even though the layout and a section
 * page both call it.
 */
export const getSettingsContext = cache(async (tenantSlug: string) => {
  const session = await getCurrentSession();
  if (!session || session.role === "SUPERADMIN" || !session.tenantId) {
    redirect("/login");
  }
  // Narrowed once here (rather than relying on call-site narrowing of
  // session.role, which doesn't survive being returned as part of this
  // function's result) since every consumer needs a plain ADMIN/STAFF role.
  const role: TenantRole = session.role;
  const { userId, roleId, tenantId } = session;

  const { tenant, visibleSections, canViewRoster, canViewScheduleTemplates, calendarAccess } =
    await runInTenantContext(tenantId, userId, role, async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      const license = await tx.license.findUnique({ where: { tenantId } });
      const visibleSections: SettingsSection[] = [];
      for (const section of SETTINGS_SECTIONS) {
        if (await canAccessSection(tx, tenantId, role, roleId, section)) {
          visibleSections.push(section);
        }
      }
      const canViewRoster = await hasPermission(tx, tenantId, role, roleId, "VIEW_ROSTER");
      const canViewScheduleTemplates = await hasPermission(tx, tenantId, role, roleId, "VIEW_SCHEDULE_TEMPLATES");
      const calendarAccess = tenant
        ? await getCalendarNavAccess(tx, tenantId, role, roleId, tenant, license?.tier ?? "BOTH")
        : null;
      return { tenant, visibleSections, canViewRoster, canViewScheduleTemplates, calendarAccess };
    });

  if (!tenant || tenant.slug !== tenantSlug) {
    notFound();
  }

  return {
    userId,
    role,
    roleId,
    tenant,
    visibleSections,
    isAdmin: role === "ADMIN",
    canViewRoster,
    canViewScheduleTemplates,
    calendarAccess,
  };
});

/**
 * Call from an individual section's page.tsx to enforce its own requirement
 * server-side - the nav only hides the link, it doesn't stop someone from
 * typing the URL directly. 404s (rather than redirecting to login) since the
 * visitor is a legitimately signed-in tenant member, just not one this
 * section is for.
 */
export async function requireSettingsSection(tenantSlug: string, slug: string) {
  const ctx = await getSettingsContext(tenantSlug);
  if (!ctx.visibleSections.some((s) => s.slug === slug)) {
    notFound();
  }
  return ctx;
}
