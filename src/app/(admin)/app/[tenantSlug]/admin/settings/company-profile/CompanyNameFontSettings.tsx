"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COMPANY_NAME_FONTS, companyNameFontFamily, type CompanyNameFontKey } from "@/lib/fonts/companyNameFonts";

export function CompanyNameFontSettings({
  businessName,
  initialFont,
}: {
  businessName: string;
  initialFont: string | null;
}) {
  const router = useRouter();
  const [font, setFont] = useState<string | null>(initialFont);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(nextFont: CompanyNameFontKey | null) {
    if (nextFont === font || saving) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/company-name-font", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ font: nextFont }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't update font.");
      setFont(data.tenant.companyNameFont);
      // AppHeader and the dashboard heading render this server-side - refresh
      // so they pick up the new font immediately.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update font.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Business name font</h2>
      <p className="mt-1 text-sm text-gray-500">
        Choose a font for your business name as it appears in the top navigation and on your dashboard.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => handleSelect(null)}
          disabled={saving}
          aria-pressed={font === null}
          className={`rounded-lg border px-3 py-2.5 text-left text-lg transition-colors disabled:opacity-50 ${
            font === null
              ? "border-primary-400 bg-primary-50 ring-1 ring-primary-300"
              : "border-gray-200 hover:border-primary-300"
          }`}
        >
          <div>{businessName || "Your Business"}</div>
          <div className="mt-0.5 text-xs font-normal text-gray-400">Default</div>
        </button>

        {COMPANY_NAME_FONTS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => handleSelect(f.key)}
            disabled={saving}
            aria-pressed={font === f.key}
            className={`rounded-lg border px-3 py-2.5 text-left text-lg transition-colors disabled:opacity-50 ${
              font === f.key
                ? "border-primary-400 bg-primary-50 ring-1 ring-primary-300"
                : "border-gray-200 hover:border-primary-300"
            }`}
            style={{ fontFamily: companyNameFontFamily(f.key) }}
          >
            <div>{businessName || "Your Business"}</div>
            <div className="mt-0.5 font-sans text-xs font-normal text-gray-400">{f.label}</div>
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
