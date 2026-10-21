import { ShiftFormSettings } from "./ShiftFormSettings";
import { ShiftServiceTypeManager } from "./ShiftServiceTypeManager";
import { requireSettingsSection } from "../access";

export default async function ShiftsSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  await requireSettingsSection(tenantSlug, "shifts");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Shifts</h2>
      <ShiftFormSettings />
      {/* ShiftFormSettings' own "Manage job types" link points at this
          section's own id (#shift-service-types) - ISSUES.md #1 split the
          shift-only job types out of the Appointments settings page's list. */}
      <ShiftServiceTypeManager />
    </div>
  );
}
