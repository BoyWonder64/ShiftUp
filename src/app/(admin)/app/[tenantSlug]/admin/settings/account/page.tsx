import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { LanguageSettingsForm } from "@/components/LanguageSettingsForm";
import { CalendarTextSizeForm } from "@/components/CalendarTextSizeForm";
import { requireSettingsSection } from "../access";
import { runInTenantContext } from "@/lib/tenant-context";

// Every tenant role (ADMIN and STAFF) reaches this section - unlike every
// other Settings section, it's never permission-gated (see sections.ts'
// "ALWAYS" requirement) since it's just each user's own login/password/
// language/calendar-text-size preference, not shared tenant config.
export default async function AccountSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await requireSettingsSection(tenantSlug, "account");

  const { user, staffProfile, customRole } = await runInTenantContext(
    ctx.tenant.id,
    ctx.userId,
    ctx.role,
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: ctx.userId },
        select: { email: true, username: true },
      });
      const staffProfile = await tx.staffProfile.findUnique({
        where: { userId: ctx.userId },
        select: { displayName: true },
      });
      const customRole = ctx.roleId
        ? await tx.role.findUnique({ where: { id: ctx.roleId }, select: { name: true } })
        : null;
      return { user, staffProfile, customRole };
    }
  );

  const displayName = staffProfile?.displayName ?? user?.username ?? user?.email ?? "—";
  const roleLabel = ctx.isAdmin ? "Admin" : (customRole?.name ?? "Staff");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Account</h2>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium">Profile</h2>
        <p className="mt-1 text-sm text-gray-500">Who you&apos;re signed in as.</p>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Name</dt>
            <dd className="font-medium text-gray-900">{displayName}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Role</dt>
            <dd className="font-medium text-gray-900">{roleLabel}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Email</dt>
            <dd className="font-medium text-gray-900">{user?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Username</dt>
            <dd className="font-medium text-gray-900">{user?.username ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Business</dt>
            <dd className="font-medium text-gray-900">{ctx.tenant.name}</dd>
          </div>
        </dl>
      </section>

      <LanguageSettingsForm />
      <CalendarTextSizeForm />
      <ChangePasswordForm />
    </div>
  );
}
