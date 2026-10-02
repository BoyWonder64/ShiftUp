import { TenantBillingManager } from "../TenantBillingManager";

export default function CustomersPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="mt-1 text-gray-500">
          Every tenant on the platform, separate from the rest of the dev console&apos;s settings.
        </p>
      </div>
      <TenantBillingManager />
    </>
  );
}
