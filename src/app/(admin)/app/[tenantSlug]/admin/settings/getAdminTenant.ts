import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";

/**
 * Shared by the settings layout and any individual settings page that needs
 * tenant fields beyond what the layout passes down (e.g. company-profile
 * needs logoDataUrl). React's cache() dedupes this to one DB round trip per
 * request even though both call it.
 */
export const getAdminTenant = cache(async (tenantSlug: string) => {
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

  return tenant;
});
