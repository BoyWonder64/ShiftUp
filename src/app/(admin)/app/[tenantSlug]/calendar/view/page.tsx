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

  const { tenant, license, canViewRoster } = await runInTenantContext(
    session.tenantId,
    session.userId,
    session.role,
    async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: session.tenantId! } });
      const license = await tx.license.findUnique({ where: { tenantId: session.tenantId! } });
      const canViewRoster = await hasPermission(tx, session.tenantId!, session.role, session.roleId, "VIEW_ROSTER");
      return { tenant, license, canViewRoster };
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
        logoUrl={tenant.logoDataUrl}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-8">
        <h1 className="text-3xl font-semibold tracking-tight">Calendar (view only)</h1>
        <SchedulingCalendar readOnly licenseTier={license?.tier ?? "BOTH"} />
      </main>
    </div>
  );
}
