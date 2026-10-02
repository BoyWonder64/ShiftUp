import { StaffManager } from "./StaffManager";
import { EventColorSettings } from "./EventColorSettings";
import { requireSettingsSection } from "../access";

export default async function StaffSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  // EventColorSettings moved here from the Calendar section - color
  // keys/tags are a staff-scheduling concern. Still isAdmin-gated: its
  // backing API for the 5 built-in colors (`/api/tenant-settings` PUT) is
  // ADMIN-only, same reasoning as AppointmentFormSettings on the
  // Appointments page - shown only where it wouldn't just 403 on save.
  const { isAdmin } = await requireSettingsSection(tenantSlug, "staff");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Staff</h2>
      <StaffManager />
      {isAdmin && <EventColorSettings />}
    </div>
  );
}
