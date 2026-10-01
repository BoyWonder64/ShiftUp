import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { AppHeader } from "@/components/AppHeader";
import { SchedulingCalendar } from "./SchedulingCalendar";

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await getCurrentSession();

  if (!session || session.role === "SUPERADMIN" || !session.tenantId) {
    redirect("/login");
  }

  const tenant = await runInTenantContext(session.tenantId, session.userId, session.role, (tx) =>
    tx.tenant.findUnique({ where: { id: session.tenantId! } })
  );

  if (!tenant || tenant.slug !== tenantSlug) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader tenantSlug={tenantSlug} businessName={tenant.name} role={session.role} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">Calendar</h1>
          <Link
            href={`/app/${tenantSlug}/calendar/view`}
            className="text-sm text-primary-700 underline"
          >
            Open view-only link
          </Link>
        </div>
        <SchedulingCalendar />
      </main>
    </div>
  );
}
