"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface AppHeaderProps {
  tenantSlug: string;
  businessName: string;
  role: "ADMIN" | "MANAGER" | "SUPERVISOR" | "EMPLOYEE" | "CUSTOMER";
  // The tenant's own company logo (admin-controlled, see
  // admin/users/LogoSettings.tsx) - distinct from the ShiftUp platform mark
  // below, which always shows regardless of whether a tenant has set one.
  logoUrl?: string | null;
}

interface NavItem {
  href: string;
  label: string;
}

/** A top-nav link that opens a small menu of related pages, rather than a flat link - used for the "Appointment pages"/"Staff pages" groupings. */
function NavDropdown({
  label,
  active,
  currentHref,
  items,
}: {
  label: string;
  active: boolean;
  currentHref: string;
  items: NavItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
          active ? "bg-white text-primary-700 shadow-sm" : "text-gray-600 hover:bg-white/60 hover:text-gray-900"
        }`}
      >
        {label}
        <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-20 mt-1 flex min-w-44 flex-col gap-0.5 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                currentHref === item.href
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppHeader({ tenantSlug, businessName, role, logoUrl }: AppHeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const base = `/app/${tenantSlug}`;
  const qs = searchParams.toString();
  const currentHref = qs ? `${pathname}?${qs}` : pathname;

  const canManageStaff = role === "ADMIN" || role === "MANAGER" || role === "SUPERVISOR";

  const appointmentItems: NavItem[] = [
    { href: `${base}/calendar?type=appointment`, label: "Calendar" },
    { href: `${base}/calendar/view`, label: "View only" },
  ];
  const staffItems: NavItem[] = [
    { href: `${base}/calendar?type=shift`, label: "Calendar" },
    ...(canManageStaff ? [{ href: `${base}/calendar/roster`, label: "Roster" }] : []),
    { href: `${base}/time-off`, label: "Time off" },
  ];

  // A dropdown's trigger reads "active" whenever the current page is any of
  // its own items, or (for the shared /calendar route, which both dropdowns
  // link into with a different ?type=) the matching type param.
  const appointmentActive =
    pathname === `${base}/calendar/view` || currentHref === `${base}/calendar?type=appointment`;
  const staffActive =
    pathname === `${base}/calendar/roster` ||
    pathname === `${base}/time-off` ||
    currentHref === `${base}/calendar?type=shift`;

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-10 border-b border-primary-100 bg-primary-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href={`${base}/dashboard`} className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-primary-500 to-primary-700 text-sm font-bold text-white shadow-sm">
              S
            </span>
            <span className="font-display text-lg font-bold tracking-tight">
              Shift<span className="text-primary-500">Up</span>
            </span>
          </Link>
          <span className="hidden items-center gap-2 sm:flex">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- per-tenant admin-uploaded data: URL, not a static/optimizable asset
              <img
                src={logoUrl}
                alt={`${businessName} logo`}
                className="h-6 w-6 rounded-md object-contain"
              />
            )}
            <span className="text-sm text-gray-400">{businessName}</span>
          </span>
        </div>

        <nav className="flex items-center gap-1">
          <Link
            href={`${base}/dashboard`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              pathname === `${base}/dashboard`
                ? "bg-white text-primary-700 shadow-sm"
                : "text-gray-600 hover:bg-white/60 hover:text-gray-900"
            }`}
          >
            Dashboard
          </Link>

          <NavDropdown
            label="Appointment pages"
            active={appointmentActive}
            currentHref={currentHref}
            items={appointmentItems}
          />
          <NavDropdown label="Staff pages" active={staffActive} currentHref={currentHref} items={staffItems} />

          {role === "ADMIN" && (
            <Link
              href={`${base}/admin/users`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname === `${base}/admin/users`
                  ? "bg-white text-primary-700 shadow-sm"
                  : "text-gray-600 hover:bg-white/60 hover:text-gray-900"
              }`}
            >
              Settings
            </Link>
          )}

          {role === "ADMIN" && (
            <Link
              href={`${base}/billing`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname === `${base}/billing`
                  ? "bg-white text-primary-700 shadow-sm"
                  : "text-gray-600 hover:bg-white/60 hover:text-gray-900"
              }`}
            >
              Billing
            </Link>
          )}

          <button
            onClick={handleSignOut}
            className="ml-2 rounded-full px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-white/60 hover:text-gray-900"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
