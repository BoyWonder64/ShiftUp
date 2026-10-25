import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { getCalendarNavAccess } from "@/lib/permissions/calendarAccess";

/**
 * No single "the" custom calendar exists anymore (a tenant can name several -
 * see Settings > Calendars > "Custom calendars") - this redirects to the
 * first one this viewer can reach, for links/bookmarks made before a tenant
 * had more than one. Mirrors the top-level /calendar redirect.
 */
export default async function LegacyCustomCalendarRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ staff?: string }>;
}) {
  const { tenantSlug } = await params;
  const { staff } = await searchParams;
  const session = await getCurrentSession();

  if (!session || session.role === "SUPERADMIN" || !session.tenantId) {
    redirect("/login");
  }

  const calendarAccess = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
    const tenant = await tx.tenant.findUnique({ where: { id: session.tenantId! } });
    if (!tenant || tenant.slug !== tenantSlug) return null;
    const license = await tx.license.findUnique({ where: { tenantId: session.tenantId! } });
    return getCalendarNavAccess(
      tx,
      session.tenantId!,
      session.role,
      session.roleId,
      tenant,
      license?.tier ?? "BOTH"
    );
  });

  const first = calendarAccess?.customCalendars[0];
  if (!first) {
    notFound();
  }

  const qs = staff ? `?staff=${encodeURIComponent(staff)}` : "";
  redirect(`/app/${tenantSlug}/calendar/custom/${first.id}${qs}`);
}
