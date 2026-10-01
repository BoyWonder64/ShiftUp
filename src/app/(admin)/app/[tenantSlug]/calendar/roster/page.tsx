import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { AppHeader } from "@/components/AppHeader";
import { RosterView } from "./RosterView";

const ROSTER_ROLES = ["ADMIN", "MANAGER", "SUPERVISOR"] as const;

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
  // Manager-facing by design - a plain EMPLOYEE already has the "All staff"
  // filter on the regular calendar (that gap is tracked separately in
  // TODO.md under "Who can see who isn't enforced yet"), but this dedicated
  // drill-down view is scoped to roles that actually manage a team.
  if (!(ROSTER_ROLES as readonly string[]).includes(session.role)) {
    redirect(`/app/${tenantSlug}/calendar`);
  }

  const tenant = await runInTenantContext(session.tenantId, session.userId, session.role, (tx) =>
    tx.tenant.findUnique({ where: { id: session.tenantId! } })
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
