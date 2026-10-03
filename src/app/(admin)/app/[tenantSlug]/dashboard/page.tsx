import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext, type Tx } from "@/lib/tenant-context";
import { featuresForTier } from "@/lib/licensing/features";
import { hasPermission } from "@/lib/permissions/service";
import type { PermissionKey } from "@/lib/permissions/catalog";
import { AppHeader } from "@/components/AppHeader";
import { companyNameFontFamily } from "@/lib/fonts/companyNameFonts";

// Keys here are translation keys (Dashboard.categories.*/Dashboard.actions.*
// in src/messages/*.json), not display text - the English word used to be
// both at once, which broke as soon as a second language existed.
const ACCESS_CATEGORIES: Array<{ key: string; permissionKeys: PermissionKey[] }> = [
  { key: "staff", permissionKeys: ["VIEW_STAFF", "CREATE_STAFF", "EDIT_STAFF", "DELETE_STAFF"] },
  { key: "services", permissionKeys: ["VIEW_SERVICES", "CREATE_SERVICES", "EDIT_SERVICES", "DELETE_SERVICES"] },
  { key: "clients", permissionKeys: ["VIEW_CLIENTS", "CREATE_CLIENTS", "EDIT_CLIENTS", "DELETE_CLIENTS"] },
  {
    key: "appointments",
    permissionKeys: [
      "VIEW_SHIFTS",
      "VIEW_APPOINTMENTS",
      "CREATE_SHIFTS",
      "CREATE_APPOINTMENTS",
      "EDIT_SHIFTS",
      "EDIT_APPOINTMENTS",
      "CANCEL_SHIFTS",
      "CANCEL_APPOINTMENTS",
    ],
  },
  { key: "jobEstimates", permissionKeys: ["VIEW_JOB_ESTIMATES", "EDIT_JOB_ESTIMATES"] },
  {
    key: "scheduleTemplates",
    permissionKeys: [
      "VIEW_SCHEDULE_TEMPLATES",
      "CREATE_SCHEDULE_TEMPLATES",
      "EDIT_SCHEDULE_TEMPLATES",
      "DELETE_SCHEDULE_TEMPLATES",
      "APPLY_SCHEDULE_TEMPLATES",
    ],
  },
];

const ACTION_KEYS: Record<PermissionKey, string> = {
  VIEW_STAFF: "view",
  CREATE_STAFF: "add",
  EDIT_STAFF: "edit",
  DELETE_STAFF: "remove",
  VIEW_SERVICES: "view",
  CREATE_SERVICES: "add",
  EDIT_SERVICES: "edit",
  DELETE_SERVICES: "remove",
  VIEW_CLIENTS: "view",
  CREATE_CLIENTS: "add",
  EDIT_CLIENTS: "edit",
  DELETE_CLIENTS: "remove",
  VIEW_SHIFTS: "view",
  VIEW_APPOINTMENTS: "view",
  CREATE_SHIFTS: "create",
  CREATE_APPOINTMENTS: "create",
  EDIT_SHIFTS: "reschedule",
  EDIT_APPOINTMENTS: "reschedule",
  CANCEL_SHIFTS: "cancel",
  CANCEL_APPOINTMENTS: "cancel",
  VIEW_JOB_ESTIMATES: "view",
  EDIT_JOB_ESTIMATES: "edit",
  VIEW_TIME_OFF: "view",
  APPROVE_TIME_OFF: "edit",
  VIEW_ROSTER: "view",
  VIEW_CALENDAR_TOGGLE: "view",
  // Not in any ACCESS_CATEGORIES list below (VIEW_APPOINTMENTS already
  // contributes "view" to the "appointments" category) - these two only need
  // an entry here to satisfy Record<PermissionKey, string>'s exhaustiveness.
  VIEW_ALL_SHIFTS: "view",
  VIEW_ALL_APPOINTMENTS: "view",
  VIEW_SCHEDULE_TEMPLATES: "view",
  CREATE_SCHEDULE_TEMPLATES: "add",
  EDIT_SCHEDULE_TEMPLATES: "edit",
  DELETE_SCHEDULE_TEMPLATES: "remove",
  APPLY_SCHEDULE_TEMPLATES: "apply",
  // Not in any ACCESS_CATEGORIES list above - a Settings-page permission
  // (Settings > Calendar), not a calendar-event action, so it has nothing
  // to summarize here either; only needed to satisfy
  // Record<PermissionKey, string>'s exhaustiveness.
  EDIT_CALENDAR_SETTINGS: "edit",
};

async function buildAccessSummary(tx: Tx, tenantId: string, role: string, roleId: string | null) {
  if (role === "ADMIN" || role === "SUPERADMIN") {
    return null; // full access - nothing to summarize
  }
  const summary: Array<{ categoryKey: string; actionKeys: string[] }> = [];
  for (const category of ACCESS_CATEGORIES) {
    // A Set, not an array - "appointments" now has two keys per action
    // (shifts/appointments split, ISSUES.md #6) that both map to the same
    // action word, and a role holding both shouldn't show "create, create".
    const actionKeys = new Set<string>();
    for (const key of category.permissionKeys) {
      if (await hasPermission(tx, tenantId, role, roleId, key)) {
        actionKeys.add(ACTION_KEYS[key]);
      }
    }
    summary.push({ categoryKey: category.key, actionKeys: [...actionKeys] });
  }
  return summary;
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await getCurrentSession();
  const t = await getTranslations("Dashboard");

  if (!session || session.role === "SUPERADMIN" || !session.tenantId) {
    redirect("/login");
  }

  const result = await runInTenantContext(
    session.tenantId,
    session.userId,
    session.role,
    async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: session.tenantId! } });
      const license = await tx.license.findUnique({ where: { tenantId: session.tenantId! } });
      const staffCount = await tx.staffProfile.count();
      const upcomingCount = await tx.appointment.count({
        where: { startTime: { gte: new Date() }, status: { not: "CANCELLED" } },
      });
      const accessSummary = await buildAccessSummary(tx, session.tenantId!, session.role, session.roleId);
      const canViewRoster = await hasPermission(tx, session.tenantId!, session.role, session.roleId, "VIEW_ROSTER");
      const canViewScheduleTemplates = await hasPermission(
        tx,
        session.tenantId!,
        session.role,
        session.roleId,
        "VIEW_SCHEDULE_TEMPLATES"
      );
      // The tenant's own name for this user's role (e.g. "Plumber"), or null
      // for ADMIN/SUPERADMIN, which aren't tenant-defined roles.
      const customRole = session.roleId ? await tx.role.findUnique({ where: { id: session.roleId } }) : null;
      return {
        tenant,
        license,
        staffCount,
        upcomingCount,
        accessSummary,
        canViewRoster,
        canViewScheduleTemplates,
        customRole,
      };
    }
  );

  // The tenantId in the session doesn't match the :tenantSlug in the URL -
  // e.g. someone pasted another tenant's dashboard link. RLS already stopped
  // any actual cross-tenant data access above; this just gives a clean 404
  // instead of silently showing the wrong tenant's shell.
  if (!result.tenant || result.tenant.slug !== tenantSlug) {
    notFound();
  }

  const features = result.license
    ? featuresForTier(result.license.tier)
    : { shiftManagement: false, appointmentManager: false };

  // The tenant's own role name (e.g. "Plumber") for STAFF, or a translated
  // fixed label for ADMIN/SUPERADMIN, which aren't tenant-defined roles.
  const roleLabel = result.customRole?.name ?? t(`roleNames.${session.role}`);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        tenantSlug={tenantSlug}
        businessName={result.tenant.name}
        role={session.role}
        canViewRoster={result.canViewRoster}
        canViewScheduleTemplates={result.canViewScheduleTemplates}
        logoUrl={result.tenant.logoDataUrl}
        companyNameFont={result.tenant.companyNameFont}
      />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 p-8">
        <div className="flex items-center gap-4">
          {result.tenant.logoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- per-tenant admin-uploaded data: URL, not a static/optimizable asset
            <img
              src={result.tenant.logoDataUrl}
              alt={`${result.tenant.name} logo`}
              className="h-14 w-14 shrink-0 rounded-xl border border-gray-200 bg-white object-contain p-1 shadow-sm"
            />
          )}
          <div>
            <h1
              className="text-3xl font-semibold tracking-tight"
              style={{ fontFamily: companyNameFontFamily(result.tenant.companyNameFont) }}
            >
              {result.tenant.name}
            </h1>
            <p className="mt-1 text-gray-500">
              {t.rich("signedInAs", { role: roleLabel, b: (chunks) => <span className="font-medium text-gray-700">{chunks}</span> })}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">{t("yourAccess")}</h2>
          <p className="mt-0.5 text-sm text-gray-500">{t("yourAccessSubtitle")}</p>

          {/* Plan/feature-tier info, previously three pill-shaped "badges"
              above this card that looked clickable but weren't - moved here
              as plain info boxes (not buttons) alongside the rest of the
              account summary. */}
          <div className="mt-4 flex flex-col gap-1">
            <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">{t("plan")}</span>
            <div className="flex flex-wrap gap-2">
              {features.shiftManagement && (
                <span className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm">
                  {t("shiftManagementBadge")}
                </span>
              )}
              {features.appointmentManager && (
                <span className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm">
                  {t("appointmentManagerBadge")}
                </span>
              )}
              {result.license && (
                <span className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm">
                  {result.license.billingPlan === "FREE"
                    ? t("freePlan")
                    : result.license.billingPlan === "ONE_TIME"
                      ? t("oneTimePlan")
                      : t("subscriptionPlan")}
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-primary-100 pt-3">
            {result.accessSummary === null ? (
              <p className="text-sm text-gray-700">
                {t.rich("fullAccess", { role: roleLabel, b: (chunks) => <span className="font-medium">{chunks}</span> })}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {result.accessSummary.map((category) => (
                  <li key={category.categoryKey} className="text-sm">
                    <span className="font-medium text-gray-700">{t(`categories.${category.categoryKey}`)}:</span>{" "}
                    {category.actionKeys.length > 0 ? (
                      <span className="text-gray-600">
                        {category.actionKeys.map((k) => t(`actions.${k}`)).join(", ")}
                      </span>
                    ) : (
                      <span className="text-gray-400">{t("noAccess")}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {result.accessSummary !== null && <p className="mt-3 text-xs text-gray-400">{t("adminNote")}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label={t("staffStat")} value={result.staffCount} href={`/app/${tenantSlug}/calendar`} />
          <StatCard
            label={t("upcomingAppointments")}
            value={result.upcomingCount}
            href={`/app/${tenantSlug}/calendar`}
          />
          <Link
            href={`/app/${tenantSlug}/calendar`}
            className="group flex flex-col justify-between rounded-xl border border-primary-100 bg-linear-to-br from-primary-50 to-white p-5 shadow-sm transition-all hover:shadow-md"
          >
            <span className="text-sm font-medium text-primary-700">{t("openCalendar")}</span>
            <span className="mt-2 text-sm text-gray-500 group-hover:text-primary-600">
              {t("openCalendarSubtitle")}
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md"
    >
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <span className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 group-hover:text-primary-600">
        {value}
      </span>
    </Link>
  );
}
