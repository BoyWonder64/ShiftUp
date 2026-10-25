import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { getCalendarNavAccess } from "@/lib/permissions/calendarAccess";
import { AppHeader } from "@/components/AppHeader";
import { SchedulingCalendar } from "../SchedulingCalendar";

/** The Shifts-only calendar - one of the 3 split pages (see also appointments/, custom/, all/). */
export default async function ShiftsCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ staff?: string }>;
}) {
  const { tenantSlug } = await params;
  const { staff: initialStaffId } = await searchParams;
  const session = await getCurrentSession();

  if (!session || session.role === "SUPERADMIN" || !session.tenantId) {
    redirect("/login");
  }

  const { tenant, canViewRoster, canViewShiftReports, canViewScheduleTemplates, calendarAccess } =
    await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: session.tenantId! } });
      const license = await tx.license.findUnique({ where: { tenantId: session.tenantId! } });
      const [canViewRoster, canViewShiftReports, canViewScheduleTemplates] = await Promise.all([
        hasPermission(tx, session.tenantId!, session.role, session.roleId, "VIEW_ROSTER"),
        hasPermission(tx, session.tenantId!, session.role, session.roleId, "VIEW_SHIFT_REPORTS"),
        hasPermission(tx, session.tenantId!, session.role, session.roleId, "VIEW_SCHEDULE_TEMPLATES"),
      ]);
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
      return { tenant, canViewRoster, canViewShiftReports, canViewScheduleTemplates, calendarAccess };
    });

  if (!tenant || tenant.slug !== tenantSlug || !calendarAccess) {
    notFound();
  }
  if (!calendarAccess.shifts) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        tenantSlug={tenantSlug}
        businessName={tenant.name}
        role={session.role}
        calendarAccess={calendarAccess}
        canViewRoster={canViewRoster}
        canViewShiftReports={canViewShiftReports}
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
          <h1 className="text-3xl font-semibold tracking-tight">Shifts</h1>
          <span className="text-lg text-gray-900">{tenant.name}</span>
        </div>
        <SchedulingCalendar calendarKind="shift" initialStaffId={initialStaffId} />
      </main>
    </div>
  );
}
