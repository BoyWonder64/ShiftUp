"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LanguagePicker } from "./LanguagePicker";
import { companyNameFontFamily } from "@/lib/fonts/companyNameFonts";

interface AppHeaderProps {
  tenantSlug: string;
  businessName: string;
  role: "ADMIN" | "STAFF";
  // Whether to show the Roster link - computed server-side per page via the
  // VIEW_ROSTER permission (roles are tenant-defined now, not a fixed enum,
  // so this can't be decided from `role` alone the way it used to be).
  canViewRoster: boolean;
  // Same convention for the Schedule templates link, gated on
  // VIEW_SCHEDULE_TEMPLATES - a separate permission from VIEW_ROSTER, so
  // computed independently rather than implied by it.
  canViewScheduleTemplates: boolean;
  // The tenant's own company logo (admin-controlled, see
  // admin/settings/company-profile/LogoSettings.tsx) - distinct from the ShiftUp platform mark
  // below, which always shows regardless of whether a tenant has set one.
  logoUrl?: string | null;
  // Admin-selectable font key for `businessName` below (see
  // admin/settings/company-profile/CompanyNameFontSettings.tsx). Null/unset
  // falls back to the default body font.
  companyNameFont?: string | null;
}

interface NavItem {
  href: string;
  label: string;
}

/** A top-nav link that opens a small menu of related pages, rather than a flat link - used for the "Staff pages" grouping. */
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

export function AppHeader({
  tenantSlug,
  businessName,
  role,
  canViewRoster,
  canViewScheduleTemplates,
  logoUrl,
  companyNameFont,
}: AppHeaderProps) {
  const t = useTranslations("AppHeader");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const base = `/app/${tenantSlug}`;
  const qs = searchParams.toString();
  const currentHref = qs ? `${pathname}?${qs}` : pathname;

  const staffItems: NavItem[] = [
    ...(role === "ADMIN" || canViewRoster ? [{ href: `${base}/calendar/roster`, label: t("roster") }] : []),
    { href: `${base}/time-off`, label: t("timeOff") },
    ...(role === "ADMIN" || canViewScheduleTemplates
      ? [{ href: `${base}/schedule-templates`, label: t("scheduleTemplates") }]
      : []),
  ];

  // A dropdown's trigger reads "active" whenever the current page is any of its own items.
  const staffActive =
    pathname === `${base}/calendar/roster` ||
    pathname === `${base}/time-off` ||
    pathname === `${base}/schedule-templates`;

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
            <span
              className="text-sm text-gray-400"
              style={{ fontFamily: companyNameFontFamily(companyNameFont) }}
            >
              {businessName}
            </span>
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
            {t("dashboard")}
          </Link>

          <Link
            href={`${base}/calendar`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              pathname === `${base}/calendar`
                ? "bg-white text-primary-700 shadow-sm"
                : "text-gray-600 hover:bg-white/60 hover:text-gray-900"
            }`}
          >
            {t("calendar")}
          </Link>

          <Link
            href={`${base}/calendar/view`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              pathname === `${base}/calendar/view`
                ? "bg-white text-primary-700 shadow-sm"
                : "text-gray-600 hover:bg-white/60 hover:text-gray-900"
            }`}
          >
            {t("viewOnly")}
          </Link>

          <NavDropdown label={t("staffPages")} active={staffActive} currentHref={currentHref} items={staffItems} />

          {role === "ADMIN" && (
            <Link
              href={`${base}/admin/settings`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname.startsWith(`${base}/admin/settings`)
                  ? "bg-white text-primary-700 shadow-sm"
                  : "text-gray-600 hover:bg-white/60 hover:text-gray-900"
              }`}
            >
              {t("settings")}
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
              {t("billing")}
            </Link>
          )}

          <LanguagePicker />

          <button
            onClick={handleSignOut}
            className="ml-2 rounded-full px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-white/60 hover:text-gray-900"
          >
            {t("signOut")}
          </button>
        </nav>
      </div>
    </header>
  );
}
