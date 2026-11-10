"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TIME_FORMATS, type TimeFormat } from "@/lib/calendar/timeFormat";

/** Per-user 12-hour/24-hour clock preference, shown as its own settings card on the My
 * account page (see GET/PATCH /api/me/time-format) - every logged-in tenant user picks
 * their own, independent of everyone else's at the business, same pattern as
 * CalendarTextSizeForm's text-size picker. Drives every formatted time this user sees in
 * the calendar - event chips (SchedulingCalendar.tsx, StaffWeekRosterView.tsx) and the
 * shift/appointment detail panel (AppointmentDetailPanel). */
export function TimeFormatForm() {
  const t = useTranslations("TimeFormatPicker");
  const tAccount = useTranslations("AccountPage");
  const [current, setCurrent] = useState<TimeFormat | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me/time-format");
        const data = await res.json();
        setCurrent(data.timeFormat ?? "TWELVE_HOUR");
      } catch {
        setCurrent("TWELVE_HOUR");
      }
    })();
  }, []);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as TimeFormat;
    if (next === current) return;
    setCurrent(next);
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/me/time-format", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeFormat: next }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">{tAccount("timeFormatSectionTitle")}</h2>
      <p className="mt-1 text-sm text-gray-500">{tAccount("timeFormatSectionDescription")}</p>

      <label className="mt-4 flex max-w-xs flex-col gap-1 text-sm">
        {t("label")}
        <select
          value={current ?? "TWELVE_HOUR"}
          onChange={handleChange}
          disabled={current === null || saving}
          className="rounded-md border border-gray-300 px-2 py-1.5 disabled:opacity-50"
        >
          {TIME_FORMATS.map((tf) => (
            <option key={tf} value={tf}>
              {t(tf)}
            </option>
          ))}
        </select>
      </label>

      {saved && <p className="mt-2 text-sm text-green-600">{tAccount("saved")}</p>}
    </section>
  );
}
