import { CalendarsToggleSettings } from "./CalendarsToggleSettings";
import { CustomCalendarsManager } from "./CustomCalendarsManager";
import { EventPresetsManager } from "./EventPresetsManager";
import { requireSettingsSection } from "../access";

export default async function CalendarsSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  await requireSettingsSection(tenantSlug, "calendars");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Manage Calendars</h2>
      <CalendarsToggleSettings />
      <CustomCalendarsManager />
      <EventPresetsManager />
    </div>
  );
}
