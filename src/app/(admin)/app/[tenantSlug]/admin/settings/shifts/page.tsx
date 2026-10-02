import { ShiftFormSettings } from "./ShiftFormSettings";

export default function ShiftsSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Shifts</h2>
      <ShiftFormSettings />
    </div>
  );
}
