"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SettingsSection } from "./sections";

export function SettingsNav({ tenantSlug, sections }: { tenantSlug: string; sections: SettingsSection[] }) {
  const pathname = usePathname();
  const base = `/app/${tenantSlug}/admin/settings`;

  return (
    <nav className="flex flex-wrap gap-1 border-b border-gray-200 pb-3">
      {sections.map((section) => {
        const href = `${base}/${section.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={section.slug}
            href={href}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-primary-50 text-primary-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
