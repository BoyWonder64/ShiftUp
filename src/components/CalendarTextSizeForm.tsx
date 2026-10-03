"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CALENDAR_TEXT_SIZES, type CalendarTextSize } from "@/lib/calendar/textSize";

/** Per-user calendar event text-size preference, shown as its own settings card on the
 * My account page (see GET/PATCH /api/me/calendar-text-size) - every logged-in tenant
 * user picks their own, independent of everyone else's at the business, same pattern
 * as LanguageSettingsForm's locale picker. */
export function CalendarTextSizeForm() {
  const t = useTranslations("CalendarTextSizePicker");
  const tAccount = useTranslations("AccountPage");
  const [current, setCurrent] = useState<CalendarTextSize | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me/calendar-text-size");
        const data = await res.json();
        setCurrent(data.calendarTextSize ?? "MEDIUM");
      } catch {
        setCurrent("MEDIUM");
      }
    })();
  }, []);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as CalendarTextSize;
    if (next === current) return;
    setCurrent(next);
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/me/calendar-text-size", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarTextSize: next }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">{tAccount("calendarTextSizeSectionTitle")}</h2>
      <p className="mt-1 text-sm text-gray-500">{tAccount("calendarTextSizeSectionDescription")}</p>

      <label className="mt-4 flex max-w-xs flex-col gap-1 text-sm">
        {t("label")}
        <select
          value={current ?? "MEDIUM"}
          onChange={handleChange}
          disabled={current === null || saving}
          className="rounded-md border border-gray-300 px-2 py-1.5 disabled:opacity-50"
        >
          {CALENDAR_TEXT_SIZES.map((size) => (
            <option key={size} value={size}>
              {t(size)}
            </option>
          ))}
        </select>
      </label>

      {saved && <p className="mt-2 text-sm text-green-600">{tAccount("saved")}</p>}
    </section>
  );
}
