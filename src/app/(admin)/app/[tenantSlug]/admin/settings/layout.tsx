import { AppHeader } from "@/components/AppHeader";
import { getSettingsContext } from "./access";
import { SettingsNav } from "./SettingsNav";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { role, tenant, visibleSections, canViewRoster, canViewScheduleTemplates } =
    await getSettingsContext(tenantSlug);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        tenantSlug={tenantSlug}
        businessName={tenant.name}
        role={role}
        canViewRoster={canViewRoster}
        canViewScheduleTemplates={canViewScheduleTemplates}
        logoUrl={tenant.logoDataUrl}
        companyNameFont={tenant.companyNameFont}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        </div>
        <SettingsNav tenantSlug={tenantSlug} sections={visibleSections} />
        {children}
      </main>
    </div>
  );
}
