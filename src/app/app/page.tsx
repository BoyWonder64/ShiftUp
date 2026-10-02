import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";

/**
 * Post-login landing route. The session only carries tenantId (not slug), so
 * this resolves the tenant's slug server-side and redirects into its
 * dashboard - keeping /app/[tenantSlug]/... as the one canonical admin URL shape.
 */
export default async function AppResolverPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  if (session.role === "SUPERADMIN") {
    redirect("/superadmin");
  }
  if (!session.tenantId) {
    redirect("/");
  }

  const tenant = await runInTenantContext(
    session.tenantId,
    session.userId,
    session.role,
    (tx) => tx.tenant.findUniqueOrThrow({ where: { id: session.tenantId! } })
  );

  redirect(`/app/${tenant.slug}/dashboard`);
}
