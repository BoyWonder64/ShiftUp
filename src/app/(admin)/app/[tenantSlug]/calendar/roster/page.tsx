import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { AppHeader } from "@/components/AppHeader";
import { RosterView } from "./RosterView";

export default async function RosterPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await getCurrentSession();

  if (!session || session.role === "SUPERADMIN" || !session.tenantId) {
    redirect("/login");
  }

  const { tenant, canView } = await runInTenantContext(
    session.tenantId,
    session.userId,
    session.role,
    async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: session.tenantId! } });
      // Manager-facing by design - gated on VIEW_ROSTER (an EMPLOYEE-ish role
      // already has the "All staff" filter on the regular calendar - that gap
      // is tracked separately in TODO.md under "Who can see who isn't
      // enforced yet" - but this dedicated drill-down is scoped to roles that
      // actually manage a team). This used to be hardcoded to specific role
      // names; now that roles are tenant-defined, a real permission key is
      // the only way to express "manager-ish" - see TODO.md's note on this.
      const canView = await hasPermission(tx, session.tenantId!, session.role, session.roleId, "VIEW_ROSTER");
      return { tenant, canView };
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
        canViewRoster
        logoUrl={tenant.logoDataUrl}
        companyNameFont={tenant.companyNameFont}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Team roster</h1>
          <p className="mt-1 text-gray-500">
            Each employee&apos;s scheduled appointments and shifts, one row per person.
            Open anyone&apos;s full calendar to see more or make changes.
          </p>
        </div>
        <RosterView tenantSlug={tenantSlug} />
      </main>
    </div>
  );
}
