import { StaffManager } from "./StaffManager";
import { TeamsManager } from "./TeamsManager";
import { requireSettingsSection } from "../access";

export default async function StaffSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await requireSettingsSection(tenantSlug, "staff");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Staff</h2>
      <StaffManager />
      {/* Moved in from its own "Teams" settings tab - grouping staff into
          teams is naturally part of managing staff, not a separate concern.
          Still admin-only to use (creating/editing teams is an ADMIN-only
          API - see /api/teams/route.ts), so gated here rather than shown to
          every VIEW_STAFF holder the way StaffManager above is - Staff's own
          requirement is broader than Teams' always was. */}
      {ctx.isAdmin && <TeamsManager />}
    </div>
  );
}
