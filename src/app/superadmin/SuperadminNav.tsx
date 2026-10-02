"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SUPERADMIN_SECTIONS } from "./sections";

export function SuperadminNav() {
  const pathname = usePathname();
  const base = "/superadmin";

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1">
      {SUPERADMIN_SECTIONS.map((section) => {
        const href = `${base}/${section.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={section.slug}
            href={href}
            title={section.description}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-primary-50 text-primary-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <div>{section.label}</div>
            <div className={`mt-0.5 text-xs font-normal ${active ? "text-primary-600/80" : "text-gray-400"}`}>
              {section.description}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
