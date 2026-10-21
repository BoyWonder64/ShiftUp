"use client";

import { useEffect, useState } from "react";

interface Settings {
  showJobTypeOnShiftForm: boolean;
  showJobEstimateOnShiftForm: boolean;
  showColorKeyOnShiftForm: boolean;
  allowOverlappingShifts: boolean;
}

export function ShiftFormSettings() {
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
      <h2 className="text-lg font-medium">Shift form</h2>
      <p className="mt-1 text-sm text-gray-500">
        Controls what the shift-creation and shift-detail forms show. A shift
        never has a client or location, so these are the only fields there
        are to toggle.
      </p>

      {loading || !settings ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={settings.showJobTypeOnShiftForm}
              onChange={() => toggle("showJobTypeOnShiftForm")}
              disabled={savingKey === "showJobTypeOnShiftForm"}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm">
              <span className="font-medium text-gray-900">Show job type</span>
              <br />
              <span className="text-gray-500">
                Lets staff pick a job type when scheduling or viewing a shift.
                Turn off if your shifts don&apos;t need one.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={settings.showJobEstimateOnShiftForm}
              onChange={() => toggle("showJobEstimateOnShiftForm")}
              disabled={savingKey === "showJobEstimateOnShiftForm"}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm">
              <span className="font-medium text-gray-900">Show job estimate</span>
              <br />
              <span className="text-gray-500">
                Lets staff with estimate permissions record an estimated
                duration and value on a shift.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={settings.showColorKeyOnShiftForm}
              onChange={() => toggle("showColorKeyOnShiftForm")}
              disabled={savingKey === "showColorKeyOnShiftForm"}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm">
              <span className="font-medium text-gray-900">Show color key</span>
              <br />
              <span className="text-gray-500">
                Lets staff tag a shift with a custom color key for the
                calendar.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={settings.allowOverlappingShifts}
              onChange={() => toggle("allowOverlappingShifts")}
              disabled={savingKey === "allowOverlappingShifts"}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm">
              <span className="font-medium text-gray-900">Allow overlapping shifts</span>
              <br />
              <span className="text-gray-500">
                Lets a staff member be scheduled on two shifts that overlap in
                time (e.g. a handoff, or covering two roles at once). Off by
                default - a staff member&apos;s shifts can&apos;t overlap each
                other. Appointments with a client attached never overlap for
                the same staff member either way.
              </span>
            </span>
          </label>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {savedKey && !savingKey && <p className="mt-2 text-sm text-green-600">Saved.</p>}

      <p className="mt-4 border-t border-gray-100 pt-3 text-sm text-gray-500">
        Need to add or edit the job types themselves (what shows up in the
        dropdown)?{" "}
        <a href="#shift-service-types" className="font-medium text-primary-700 hover:underline">
          Manage job types
        </a>{" "}
        below.
      </p>
    </section>
  );
}
