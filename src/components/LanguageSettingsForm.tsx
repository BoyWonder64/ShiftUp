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

/** Per-user language preference, shown as its own settings card on the
 * My account page - every logged-in role (ADMIN, STAFF, SUPERADMIN) can
 * reach this page and picks their own language independently (see PATCH
 * /api/me/locale). Previously lived as a compact picker in the header. */
export function LanguageSettingsForm() {
  const t = useTranslations("LanguagePicker");
  const tAccount = useTranslations("AccountPage");
  const currentNextIntlLocale = useLocale();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const current = (Object.keys(TO_NEXT_INTL) as Locale[]).find(
    (l) => TO_NEXT_INTL[l] === currentNextIntlLocale
  ) ?? "EN";

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
    if (next === current) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/me/locale", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      router.refresh();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">{tAccount("languageSectionTitle")}</h2>
      <p className="mt-1 text-sm text-gray-500">{tAccount("languageSectionDescription")}</p>

      <label className="mt-4 flex max-w-xs flex-col gap-1 text-sm">
        {t("label")}
        <select
          value={current}
          onChange={handleChange}
          disabled={saving}
          className="rounded-md border border-gray-300 px-2 py-1.5 disabled:opacity-50"
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {t(l)}
            </option>
          ))}
        </select>
      </label>

      {saved && <p className="mt-2 text-sm text-green-600">{tAccount("saved")}</p>}
    </section>
  );
}
