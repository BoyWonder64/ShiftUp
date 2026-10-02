import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export default function SuperadminAccountPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-gray-500">Your own dev-console login and password.</p>
      </div>
      <ChangePasswordForm />
    </>
  );
}
