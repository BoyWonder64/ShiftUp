import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export default function AccountSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Account</h2>
      <ChangePasswordForm />
    </div>
  );
}
