"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

const LOCALES = ["EN", "ES", "DE", "FR"] as const;
type Locale = (typeof LOCALES)[number];

// next-intl works with lowercase BCP-47 codes ("en"); the stored
// preference/API use the Prisma enum's uppercase values ("EN"). This is the
// one place that needs to know both.
const TO_NEXT_INTL: Record<Locale, string> = { EN: "en", ES: "es", DE: "de", FR: "fr" };

/** Per-user language preference - visible to every logged-in role (ADMIN,
 * STAFF, and SUPERADMIN via its own header), not gated to the admin-only
 * Settings page the way tenant-wide toggles are, since each person picks
 * their own language independently (see PATCH /api/me/locale). */
export function LanguagePicker() {
  const t = useTranslations("LanguagePicker");
  const currentNextIntlLocale = useLocale();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const current = (Object.keys(TO_NEXT_INTL) as Locale[]).find(
    (l) => TO_NEXT_INTL[l] === currentNextIntlLocale
  ) ?? "EN";

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
    if (next === current) return;
    setSaving(true);
    try {
      await fetch("/api/me/locale", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      aria-label={t("label")}
      value={current}
      onChange={handleChange}
      disabled={saving}
      className="rounded-full border-0 bg-transparent px-2 py-1.5 text-sm font-medium text-gray-500 hover:bg-white/60 hover:text-gray-900 disabled:opacity-50"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {t(l)}
        </option>
      ))}
    </select>
  );
}
