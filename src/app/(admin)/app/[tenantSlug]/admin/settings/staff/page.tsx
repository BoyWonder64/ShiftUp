import { StaffManager } from "./StaffManager";
import { requireSettingsSection } from "../access";

export default async function StaffSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  await requireSettingsSection(tenantSlug, "staff");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Staff</h2>
      <StaffManager />
    </div>
  );
}
