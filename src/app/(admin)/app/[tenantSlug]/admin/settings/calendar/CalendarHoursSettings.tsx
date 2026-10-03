"use client";

import { useEffect, useState } from "react";

/** Human-readable label for a minutes-from-midnight value, e.g. 450 -> "7:30 AM". 1440 -> "Midnight". */
function formatMinutes(minutes: number): string {
  if (minutes === 1440) return "Midnight";
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Every half hour of the day, 0 (Midnight) through 1440 (Midnight, end-of-day). */
const TIME_OPTIONS = Array.from({ length: 49 }, (_, i) => i * 30);

export function CalendarHoursSettings() {
  const [startMinute, setStartMinute] = useState<number | null>(null);
  const [endMinute, setEndMinute] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tenant-settings");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!cancelled) {
          setStartMinute(data.settings.calendarStartMinute);
          setEndMinute(data.settings.calendarEndMinute);
        }
      } catch {
        if (!cancelled) setError("Couldn't load calendar hours.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isFullDay = startMinute === 0 && endMinute === 1440;

  async function save(nextStart: number, nextEnd: number) {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarStartMinute: nextStart, calendarEndMinute: nextEnd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setStartMinute(nextStart);
      setEndMinute(nextEnd);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (startMinute === null || endMinute === null) return;
    if (endMinute <= startMinute) {
      setError("End time must be after start time.");
      return;
    }
    void save(startMinute, endMinute);
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Calendar hours</h2>
      <p className="mt-1 text-sm text-gray-500">
        The range of time shown on the Week/Day calendar grid, for everyone on your team. Defaults to the
        full day — narrow it to your actual business hours to get rid of dead overnight space nobody needs
        to scroll past.
      </p>

      {loading || startMinute === null || endMinute === null ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Starts at
            <select
              value={startMinute}
              onChange={(e) => {
                setSaved(false);
                setStartMinute(Number(e.target.value));
              }}
              className="rounded-md border border-gray-300 px-2 py-1"
            >
              {TIME_OPTIONS.filter((m) => m < 1440).map((m) => (
                <option key={m} value={m}>
                  {formatMinutes(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Ends at
            <select
              value={endMinute}
              onChange={(e) => {
                setSaved(false);
                setEndMinute(Number(e.target.value));
              }}
              className="rounded-md border border-gray-300 px-2 py-1"
            >
              {TIME_OPTIONS.filter((m) => m > 0).map((m) => (
                <option key={m} value={m}>
                  {formatMinutes(m)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {!isFullDay && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(0, 1440)}
              className="text-sm text-gray-500 underline-offset-2 hover:text-primary-600 hover:underline disabled:opacity-50"
            >
              Reset to full day
            </button>
          )}
          {saved && <span className="text-sm text-green-600">Saved.</span>}
        </form>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
