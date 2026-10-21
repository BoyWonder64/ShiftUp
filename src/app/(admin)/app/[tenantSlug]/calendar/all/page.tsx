import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { getCalendarNavAccess } from "@/lib/permissions/calendarAccess";
import { AppHeader } from "@/components/AppHeader";
import { SchedulingCalendar } from "../SchedulingCalendar";

/**
 * The combined calendar - every enabled kind (appointments/shifts/custom)
 * shown together, same role today's "Both" calendarType switcher option
 * played before the 3-way split, including the Appointment/Shift/Custom
 * chooser popup for an ambiguous slot-drag creation. Gated on
 * VIEW_CALENDAR_TOGGLE and only reachable at all when 2+ kinds are enabled
 * (see getCalendarNavAccess) - with just one kind enabled this page would be
 * a redundant copy of that kind's own page.
 */
export default async function AllCalendarsPage({
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
            license?.tier ?? "BOTH",
            license?.billingPlan ?? "FREE"
          )
        : null;
      return { tenant, canViewRoster, canViewShiftReports, canViewScheduleTemplates, calendarAccess };
    });

  if (!tenant || tenant.slug !== tenantSlug || !calendarAccess) {
    notFound();
  }
  if (!calendarAccess.all) {
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
          <h1 className="text-3xl font-semibold tracking-tight">All calendars</h1>
          <span className="text-lg text-gray-900">{tenant.name}</span>
        </div>
        <SchedulingCalendar
          calendarKind="all"
          initialStaffId={initialStaffId}
          allKinds={{
            appointment: calendarAccess.appointments,
            shift: calendarAccess.shifts,
            custom: calendarAccess.customCalendars.length > 0,
          }}
        />
      </main>
    </div>
  );
}
