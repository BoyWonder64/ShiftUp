import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { AppHeader } from "@/components/AppHeader";
import { SchedulingCalendar } from "./SchedulingCalendar";

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ staff?: string; type?: string }>;
}) {
  const { tenantSlug } = await params;
  const { staff: initialStaffId, type } = await searchParams;
  const initialCalendarType = type === "appointment" || type === "shift" ? type : undefined;
  const session = await getCurrentSession();

  if (!session || session.role === "SUPERADMIN" || !session.tenantId) {
    redirect("/login");
  }

  const { tenant, license } = await runInTenantContext(
    session.tenantId,
    session.userId,
    session.role,
    async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: session.tenantId! } });
      const license = await tx.license.findUnique({ where: { tenantId: session.tenantId! } });
      return { tenant, license };
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
        logoUrl={tenant.logoDataUrl}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-8">
        <div className="flex items-center justify-center gap-4">
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
        </div>
        <SchedulingCalendar
          licenseTier={license?.tier ?? "BOTH"}
          initialStaffId={initialStaffId}
          initialCalendarType={initialCalendarType}
        />
      </main>
    </div>
  );
}
