import { RolesAndPermissionsEditor } from "./RolesAndPermissionsEditor";
import { requireSettingsSection } from "../access";

export default async function PermissionsSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  await requireSettingsSection(tenantSlug, "permissions");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Permissions</h2>
        <p className="mt-1 text-sm text-gray-500">
          Pick a role on the left, then configure what it can do and see. Admin always has full
          access and isn&apos;t shown here.
        </p>
      </div>
      <RolesAndPermissionsEditor />
    </div>
  );
}
