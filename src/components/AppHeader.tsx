"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

interface AppHeaderProps {
  tenantSlug: string;
  businessName: string;
  role: "ADMIN" | "MANAGER" | "SUPERVISOR" | "EMPLOYEE" | "CUSTOMER";
}

export function AppHeader({ tenantSlug, businessName, role }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();

  const base = `/app/${tenantSlug}`;
  const links = [
    { href: `${base}/dashboard`, label: "Dashboard" },
    { href: `${base}/calendar`, label: "Calendar" },
    { href: `${base}/time-off`, label: "Time off" },
    ...(role === "ADMIN"
      ? [
          { href: `${base}/admin/users`, label: "User manager" },
          { href: `${base}/billing`, label: "Billing" },
        ]
      : []),
  ];

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href={`${base}/dashboard`} className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-primary-500 to-primary-700 text-sm font-bold text-white shadow-sm">
              S
            </span>
            <span className="text-lg font-semibold tracking-tight">
              Shift<span className="text-primary-500">Up</span>
            </span>
          </Link>
          <span className="hidden text-sm text-gray-400 sm:inline">{businessName}</span>
        </div>

        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary-50 text-primary-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <button
            onClick={handleSignOut}
            className="ml-2 rounded-full px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
