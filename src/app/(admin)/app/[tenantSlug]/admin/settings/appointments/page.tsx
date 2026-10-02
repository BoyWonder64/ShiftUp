import { AppointmentFormSettings } from "./AppointmentFormSettings";
import { ServiceTypeManager } from "./ServiceTypeManager";

export default function AppointmentsSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Appointments</h2>
      <AppointmentFormSettings />
      <ServiceTypeManager />
    </div>
  );
}
