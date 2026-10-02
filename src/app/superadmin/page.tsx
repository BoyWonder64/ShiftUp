import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { SuperadminHeader } from "./SuperadminHeader";
import { TenantBillingManager } from "./TenantBillingManager";
import { DiscountCodeManager } from "./DiscountCodeManager";

export default async function SuperadminPage() {
  const session = await getCurrentSession();
  if (!session || session.role !== "SUPERADMIN") {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <SuperadminHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dev console</h1>
          <p className="mt-1 text-gray-500">
            Platform-wide view across every tenant - not visible or reachable from any tenant account.
          </p>
        </div>
        <ChangePasswordForm />
        <TenantBillingManager />
        <DiscountCodeManager />
      </main>
    </div>
  );
}
