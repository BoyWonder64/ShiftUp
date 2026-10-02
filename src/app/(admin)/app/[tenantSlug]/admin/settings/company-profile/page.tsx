import { requireSettingsSection } from "../access";
import { LogoSettings } from "./LogoSettings";
import { CompanyNameFontSettings } from "./CompanyNameFontSettings";

export default async function CompanyProfileSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireSettingsSection(tenantSlug, "company-profile");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Company Profile</h2>
      <LogoSettings initialLogoUrl={tenant.logoDataUrl} />
      <CompanyNameFontSettings businessName={tenant.name} initialFont={tenant.companyNameFont} />
    </div>
  );
}
