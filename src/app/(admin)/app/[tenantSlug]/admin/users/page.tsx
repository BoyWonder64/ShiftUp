import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { AppHeader } from "@/components/AppHeader";
import { PermissionMatrixEditor } from "./PermissionMatrixEditor";
import { StaffManager } from "./StaffManager";
import { AppointmentFormSettings } from "./AppointmentFormSettings";
import { ShiftFormSettings } from "./ShiftFormSettings";
import { ServiceTypeManager } from "./ServiceTypeManager";
import { LogoSettings } from "./LogoSettings";
import { EventColorSettings } from "./EventColorSettings";
import { HolidaySettings } from "./HolidaySettings";
import { RoleManager } from "./RoleManager";

export default async function UserManagerPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await getCurrentSession();

  if (!session || session.role !== "ADMIN" || !session.tenantId) {
    redirect("/login");
  }

  const tenant = await runInTenantContext(session.tenantId, session.userId, "ADMIN", (tx) =>
    tx.tenant.findUnique({ where: { id: session.tenantId! } })
  );

  if (!tenant || tenant.slug !== tenantSlug) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        tenantSlug={tenantSlug}
        businessName={tenant.name}
        role="ADMIN"
        canViewRoster
        logoUrl={tenant.logoDataUrl}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-gray-500">
            Decide what each role can do and see. Admin always has full access and
            isn&apos;t shown here.
          </p>
        </div>
        <StaffManager />
        <LogoSettings initialLogoUrl={tenant.logoDataUrl} />
        <AppointmentFormSettings />
        <ShiftFormSettings />
        <ServiceTypeManager />
        <EventColorSettings />
        <HolidaySettings />
        <RoleManager />
        <PermissionMatrixEditor />
      </main>
    </div>
  );
}
