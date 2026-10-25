import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { getCalendarNavAccess } from "@/lib/permissions/calendarAccess";
import { AppHeader } from "@/components/AppHeader";
import { ReportsView } from "./ReportsView";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await getCurrentSession();

  if (!session || session.role === "SUPERADMIN" || !session.tenantId) {
    redirect("/login");
  }

  const { tenant, canView, canViewRoster, canViewScheduleTemplates, calendarAccess } = await runInTenantContext(
    session.tenantId,
    session.userId,
    session.role,
    async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: session.tenantId! } });
      const license = await tx.license.findUnique({ where: { tenantId: session.tenantId! } });
      // ISSUES.md #4 - manager-facing aggregate dashboard, gated on its own
      // dedicated permission rather than VIEW_ROSTER/VIEW_ALL_SHIFTS/
      // VIEW_ALL_APPOINTMENTS (see listEventsForReport's doc comment for why).
      const canView = await hasPermission(tx, session.tenantId!, session.role, session.roleId, "VIEW_SHIFT_REPORTS");
      const canViewRoster = await hasPermission(tx, session.tenantId!, session.role, session.roleId, "VIEW_ROSTER");
      const canViewScheduleTemplates = await hasPermission(
        tx,
        session.tenantId!,
        session.role,
        session.roleId,
        "VIEW_SCHEDULE_TEMPLATES"
      );
      const calendarAccess = tenant
        ? await getCalendarNavAccess(
            tx,
            session.tenantId!,
            session.role,
            session.roleId,
            tenant,
            license?.tier ?? "BOTH"
          )
        : null;
      return { tenant, canView, canViewRoster, canViewScheduleTemplates, calendarAccess };
    }
  );

  if (session.role !== "ADMIN" && !canView) {
    redirect(`/app/${tenantSlug}/calendar`);
  }

  if (!tenant || tenant.slug !== tenantSlug) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        tenantSlug={tenantSlug}
        businessName={tenant.name}
        role={session.role}
        calendarAccess={calendarAccess ?? undefined}
        canViewRoster={canViewRoster}
        canViewShiftReports={canView}
        canViewScheduleTemplates={canViewScheduleTemplates}
        logoUrl={tenant.logoDataUrl}
        companyNameFont={tenant.companyNameFont}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-gray-500">
            No-show, completion, and hours-worked stats across every staff member. Click a tile or a row to
            see what&apos;s behind it.
          </p>
        </div>
        <ReportsView />
      </main>
    </div>
  );
}
