import { ShiftFormSettings } from "./ShiftFormSettings";
import { ServiceTypeManager } from "../appointments/ServiceTypeManager";
import { requireSettingsSection } from "../access";

export default async function ShiftsSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  await requireSettingsSection(tenantSlug, "shifts");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Shifts</h2>
      <ShiftFormSettings />
      {/* ShiftFormSettings' own "Manage job types" link points at this
          section's id (#service-types) - it's the same ServiceType data the
          Appointments settings page manages, just also relevant here since
          shift forms pick from it too. */}
      <ServiceTypeManager />
    </div>
  );
}
