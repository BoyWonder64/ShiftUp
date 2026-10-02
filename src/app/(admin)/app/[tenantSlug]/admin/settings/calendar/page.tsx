import { EventColorSettings } from "./EventColorSettings";
import { HolidaySettings } from "./HolidaySettings";

export default function CalendarSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Calendar</h2>
      <EventColorSettings />
      <HolidaySettings />
    </div>
  );
}
