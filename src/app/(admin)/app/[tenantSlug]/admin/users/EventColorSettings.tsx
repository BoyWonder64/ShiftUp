"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_EVENT_COLORS,
  EVENT_COLOR_KEYS,
  EVENT_COLOR_LABELS,
  type EventColorKey,
} from "@/lib/colors/eventColors";

export function EventColorSettings() {
  const [colors, setColors] = useState<Record<EventColorKey, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<EventColorKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tenant-settings");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!cancelled) setColors(data.settings.eventColors);
      } catch {
        if (!cancelled) setError("Couldn't load colors.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(key: EventColorKey, color: string) {
    setColors((prev) => (prev ? { ...prev, [key]: color } : prev));
    setSavingKey(key);
    setError(null);
    try {
      const res = await fetch("/api/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventColors: { [key]: color } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setColors(data.settings.eventColors);
    } catch {
      setError("Couldn't save - try again.");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Color key</h2>
      <p className="mt-1 text-sm text-gray-500">
        Personalize the colors behind the calendar&apos;s legend and event
        pills. Applies for everyone on your team.
      </p>

      {loading || !colors ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-4">
          {EVENT_COLOR_KEYS.map((key) => (
            <div key={key} className="flex flex-col items-center gap-1.5">
              <label className="text-xs font-medium text-gray-600">{EVENT_COLOR_LABELS[key]}</label>
              <input
                type="color"
                value={colors[key]}
                onChange={(e) => void save(key, e.target.value)}
                disabled={savingKey === key}
                className="h-9 w-14 cursor-pointer rounded-md border border-gray-300 disabled:opacity-50"
              />
              {colors[key] !== DEFAULT_EVENT_COLORS[key] && (
                <button
                  type="button"
                  onClick={() => void save(key, DEFAULT_EVENT_COLORS[key])}
                  className="text-[11px] text-gray-400 hover:text-primary-600 hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
