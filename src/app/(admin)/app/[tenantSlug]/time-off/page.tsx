import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
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

  const { tenant, canViewRoster } = await runInTenantContext(
    session.tenantId,
    session.userId,
    session.role,
    async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: session.tenantId! } });
      const canViewRoster = await hasPermission(tx, session.tenantId!, session.role, session.roleId, "VIEW_ROSTER");
      return { tenant, canViewRoster };
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
        companyNameFont={tenant.companyNameFont}
      />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-8">
        <h1 className="text-3xl font-semibold tracking-tight">Time off</h1>
        <TimeOffManager />
      </main>
    </div>
  );
}
