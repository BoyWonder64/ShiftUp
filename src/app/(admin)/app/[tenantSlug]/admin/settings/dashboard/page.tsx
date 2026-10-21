import { DashboardMetricsManager } from "./DashboardMetricsManager";
import { requireSettingsSection } from "../access";

export default async function DashboardSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  await requireSettingsSection(tenantSlug, "dashboard");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Dashboard</h2>
      <DashboardMetricsManager />
    </div>
  );
}
