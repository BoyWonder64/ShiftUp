import { AppointmentFormSettings } from "./AppointmentFormSettings";
import { ServiceTypeManager } from "./ServiceTypeManager";
import { requireSettingsSection } from "../access";

export default async function AppointmentsSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  // Service types are delegable (VIEW_SERVICES, which is what gates this
  // whole section), but the form-toggle card changes tenant-wide behavior
  // and is still ADMIN-only at the API (`/api/tenant-settings` PUT) - so it's
  // hidden rather than shown with a save button that would just 403.
  const { isAdmin } = await requireSettingsSection(tenantSlug, "appointments");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Appointments</h2>
      {isAdmin && <AppointmentFormSettings />}
      <ServiceTypeManager />
    </div>
  );
}
