import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { AppHeader } from "@/components/AppHeader";
import { ScheduleTemplatesView } from "./ScheduleTemplatesView";

export default async function ScheduleTemplatesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await getCurrentSession();

  if (!session || session.role === "SUPERADMIN" || !session.tenantId) {
    redirect("/login");
  }

  const { tenant, license, canView, canViewRoster } = await runInTenantContext(
    session.tenantId,
    session.userId,
    session.role,
    async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: session.tenantId! } });
      const license = await tx.license.findUnique({ where: { tenantId: session.tenantId! } });
      // Manager-facing, same gating convention as the Roster page - a real
      // permission key rather than a hardcoded role check, since roles are
      // tenant-defined now.
      const canView = await hasPermission(tx, session.tenantId!, session.role, session.roleId, "VIEW_SCHEDULE_TEMPLATES");
      const canViewRoster = await hasPermission(tx, session.tenantId!, session.role, session.roleId, "VIEW_ROSTER");
      return { tenant, license, canView, canViewRoster };
    }
  );

  if (session.role !== "ADMIN" && !canView) {
    redirect(`/app/${tenantSlug}/calendar`);
  }

  if (!tenant || tenant.slug !== tenantSlug) {
    notFound();
  }

  // Paid-only feature (TODO.md: "decided 2026-10-02: paid feature" - a
  // manager-efficiency feature with no cost-driver reason to be free). The
  // API enforces this regardless of what the UI shows; this is just the
  // upsell in place of the real tool for a FREE-plan tenant.
  const isPaid = license?.billingPlan === "ONE_TIME" || license?.billingPlan === "SUBSCRIPTION";

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        tenantSlug={tenantSlug}
        businessName={tenant.name}
        role={session.role}
        canViewRoster={canViewRoster}
        canViewScheduleTemplates
        logoUrl={tenant.logoDataUrl}
        companyNameFont={tenant.companyNameFont}
      />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Schedule templates</h1>
          <p className="mt-1 text-gray-500">
            Build a reusable shift pattern once, then apply it to any week instead of rebuilding it from scratch.
          </p>
        </div>
        {isPaid ? (
          <ScheduleTemplatesView />
        ) : (
          <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-6 text-center shadow-sm">
            <p className="text-gray-700">Schedule templates are a paid feature.</p>
            <p className="mt-1 text-sm text-gray-500">
              Upgrade to build reusable shift patterns and apply them to any week.
            </p>
            <Link
              href={`/app/${tenantSlug}/billing`}
              className="mt-4 inline-block rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600"
            >
              View plans
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
