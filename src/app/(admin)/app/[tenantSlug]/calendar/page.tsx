import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { getCalendarNavAccess } from "@/lib/permissions/calendarAccess";

/**
 * The old single shared-calendar route - now just redirects to whichever of
 * the 4 split pages (appointments/shifts/custom/all) this viewer can
 * actually reach, for bookmarks/links made before the split. Prefers "all"
 * when reachable (closest to the old combined behavior), otherwise whichever
 * single kind is enabled.
 */
export default async function LegacyCalendarRedirectPage({
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
      license?.tier ?? "BOTH",
      license?.billingPlan ?? "FREE"
    );
  });

  if (!calendarAccess) {
    notFound();
  }

  const qs = staff ? `?staff=${encodeURIComponent(staff)}` : "";
  const base = `/app/${tenantSlug}/calendar`;
  if (calendarAccess.all) redirect(`${base}/all${qs}`);
  if (calendarAccess.appointments) redirect(`${base}/appointments${qs}`);
  if (calendarAccess.shifts) redirect(`${base}/shifts${qs}`);
  if (calendarAccess.customCalendars[0]) redirect(`${base}/custom/${calendarAccess.customCalendars[0].id}${qs}`);
  notFound();
}
