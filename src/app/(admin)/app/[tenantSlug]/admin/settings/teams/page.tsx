import { TeamsManager } from "./TeamsManager";
import { requireSettingsSection } from "../access";

export default async function TeamsSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  await requireSettingsSection(tenantSlug, "teams");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Teams</h2>
      <TeamsManager />
    </div>
  );
}
