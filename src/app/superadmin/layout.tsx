import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { SuperadminHeader } from "./SuperadminHeader";
import { SuperadminNav } from "./SuperadminNav";

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session || session.role !== "SUPERADMIN") {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <SuperadminHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 gap-8 p-8">
        <SuperadminNav />
        <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
