"use client";

import { useEffect, useState } from "react";

interface Settings {
  appointmentsCalendarEnabled: boolean;
  shiftsCalendarEnabled: boolean;
}

export function CalendarsToggleSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<keyof Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<keyof Settings | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tenant-settings");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!cancelled) setSettings(data.settings);
      } catch {
        if (!cancelled) setError("Couldn't load settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(key: keyof Settings) {
    if (!settings) return;
    const next = !settings[key];
    setSettings({ ...settings, [key]: next });
    setSavingKey(key);
    setError(null);
    setSavedKey(null);
    try {
      const res = await fetch("/api/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSavedKey(key);
    } catch {
      setSettings((prev) => (prev ? { ...prev, [key]: !next } : prev)); // revert on failure
      setError("Couldn't save - try again.");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Calendars</h2>
      <p className="mt-1 text-sm text-gray-500">
        Turn each calendar on or off tenant-wide. Both are on by default. Custom calendars (below) have no
        single on/off switch - creating or deleting one is how you turn it on or off.
      </p>

      {loading || !settings ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={settings.appointmentsCalendarEnabled}
              onChange={() => toggle("appointmentsCalendarEnabled")}
              disabled={savingKey === "appointmentsCalendarEnabled"}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm">
              <span className="font-medium text-gray-900">Appointments calendar</span>
              <br />
              <span className="text-gray-500">Lets staff schedule and view client appointments.</span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={settings.shiftsCalendarEnabled}
              onChange={() => toggle("shiftsCalendarEnabled")}
              disabled={savingKey === "shiftsCalendarEnabled"}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm">
              <span className="font-medium text-gray-900">Shifts calendar</span>
              <br />
              <span className="text-gray-500">Lets staff schedule and view work shifts.</span>
            </span>
          </label>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {savedKey && !savingKey && <p className="mt-2 text-sm text-green-600">Saved.</p>}
    </section>
  );
}
