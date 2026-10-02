import { StaffManager } from "./StaffManager";

export default function StaffSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Staff</h2>
      <StaffManager />
    </div>
  );
}
