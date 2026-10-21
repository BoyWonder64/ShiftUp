import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { getCalendarNavAccess } from "@/lib/permissions/calendarAccess";
import { AppHeader } from "@/components/AppHeader";
import { TimeOffManager } from "./TimeOffManager";

export default async function TimeOffPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await getCurrentSession();

  if (!session || session.role === "SUPERADMIN" || !session.tenantId) {
    redirect("/login");
  }

  const { tenant, canViewRoster, canViewShiftReports, canViewScheduleTemplates, calendarAccess } =
    await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: session.tenantId! } });
      const license = await tx.license.findUnique({ where: { tenantId: session.tenantId! } });
      const canViewRoster = await hasPermission(tx, session.tenantId!, session.role, session.roleId, "VIEW_ROSTER");
      const canViewShiftReports = await hasPermission(
        tx,
        session.tenantId!,
        session.role,
        session.roleId,
        "VIEW_SHIFT_REPORTS"
      );
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
            license?.tier ?? "BOTH",
            license?.billingPlan ?? "FREE"
          )
        : null;
      return { tenant, canViewRoster, canViewShiftReports, canViewScheduleTemplates, calendarAccess };
    });

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
        canViewShiftReports={canViewShiftReports}
        canViewScheduleTemplates={canViewScheduleTemplates}
        logoUrl={tenant.logoDataUrl}
        companyNameFont={tenant.companyNameFont}
      />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-8">
        <h1 className="text-3xl font-semibold tracking-tight">Time off</h1>
        <TimeOffManager />
      </main>
    </div>
  );
}
