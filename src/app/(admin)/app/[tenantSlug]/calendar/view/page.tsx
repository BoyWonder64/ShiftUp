import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { AppHeader } from "@/components/AppHeader";
import { SchedulingCalendar } from "../SchedulingCalendar";

/**
 * A dedicated, always-non-interactive calendar view - separate from
 * /calendar so it can be linked/shared as "the view-only one" without
 * depending on the viewer's actual permissions (those still gate the normal
 * /calendar page; this route ignores them entirely via readOnly).
 */
export default async function ReadOnlyCalendarPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await getCurrentSession();

  if (!session || session.role === "SUPERADMIN" || !session.tenantId) {
    redirect("/login");
  }

  const { tenant, license, canViewRoster, canViewScheduleTemplates } = await runInTenantContext(
    session.tenantId,
    session.userId,
    session.role,
    async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: session.tenantId! } });
      const license = await tx.license.findUnique({ where: { tenantId: session.tenantId! } });
      const canViewRoster = await hasPermission(tx, session.tenantId!, session.role, session.roleId, "VIEW_ROSTER");
      const canViewScheduleTemplates = await hasPermission(
        tx,
        session.tenantId!,
        session.role,
        session.roleId,
        "VIEW_SCHEDULE_TEMPLATES"
      );
      return { tenant, license, canViewRoster, canViewScheduleTemplates };
    }
  );

  if (!tenant || tenant.slug !== tenantSlug) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        tenantSlug={tenantSlug}
        businessName={tenant.name}
        role={session.role}
        canViewRoster={canViewRoster}
        canViewScheduleTemplates={canViewScheduleTemplates}
        logoUrl={tenant.logoDataUrl}
        companyNameFont={tenant.companyNameFont}
        maxWidthClassName="max-w-[1600px]"
      />
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 p-8">
        <div className="flex items-center gap-4">
          {tenant.logoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- per-tenant admin-uploaded data: URL, not a static/optimizable asset
            <img
              src={tenant.logoDataUrl}
              alt={`${tenant.name} logo`}
              className="h-14 w-14 shrink-0 rounded-xl border border-gray-200 bg-white object-contain p-1 shadow-sm"
            />
          )}
          <h1 className="text-3xl font-semibold tracking-tight">Calendar</h1>
          <span className="text-lg text-gray-900">{tenant.name}</span>
          <span className="text-lg text-gray-400">(view only)</span>
        </div>
        <SchedulingCalendar readOnly licenseTier={license?.tier ?? "BOTH"} />
      </main>
    </div>
  );
}
