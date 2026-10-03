import { HolidaySettings } from "./HolidaySettings";
import { EventColorSettings } from "./EventColorSettings";
import { CalendarHoursSettings } from "./CalendarHoursSettings";
import { requireSettingsSection } from "../access";

export default async function CalendarSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  await requireSettingsSection(tenantSlug, "calendar");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Calendar</h2>
      <CalendarHoursSettings />
      <HolidaySettings />
      <EventColorSettings />
    </div>
  );
}
