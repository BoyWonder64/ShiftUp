"use client";

import { useEffect, useState } from "react";
import { BookableServicesSettings } from "./BookableServicesSettings";
import { WorkingHoursEditor } from "./WorkingHoursEditor";
import { EmbedSnippet } from "./EmbedSnippet";

interface BookingSettings {
  publicBookingEnabled: boolean;
  publicBookingMinNoticeMinutes: number;
  publicBookingWindowDays: number;
}

export function BookingWidgetSettings({ tenantSlug }: { tenantSlug: string }) {
  const [settings, setSettings] = useState<BookingSettings | null>(null);
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
          setSettings({
            publicBookingEnabled: data.settings.publicBookingEnabled,
            publicBookingMinNoticeMinutes: data.settings.publicBookingMinNoticeMinutes,
            publicBookingWindowDays: data.settings.publicBookingWindowDays,
          });
        }
      } catch {
        if (!cancelled) setError("Couldn't load booking widget settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: BookingSettings) {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSettings(next);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium">Public booking</h2>
        <p className="mt-1 text-sm text-gray-500">
          Let clients see your real-time availability and book themselves, with no login - on a hosted page you
          can embed on your own website. Off by default.
        </p>

        {loading || !settings ? (
          <p className="mt-4 text-sm text-gray-400">Loading...</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(settings);
            }}
            className="mt-4 flex flex-col gap-3"
          >
            <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <input
                type="checkbox"
                checked={settings.publicBookingEnabled}
                onChange={(e) => {
                  setSaved(false);
                  void save({ ...settings, publicBookingEnabled: e.target.checked });
                }}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Enable public booking
            </label>

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Minimum notice (minutes)
                <input
                  type="number"
                  min={0}
                  value={settings.publicBookingMinNoticeMinutes}
                  onChange={(e) => {
                    setSaved(false);
                    setSettings({ ...settings, publicBookingMinNoticeMinutes: Number(e.target.value) });
                  }}
                  className="w-28 rounded-md border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Booking window (days)
                <input
                  type="number"
                  min={1}
                  value={settings.publicBookingWindowDays}
                  onChange={(e) => {
                    setSaved(false);
                    setSettings({ ...settings, publicBookingWindowDays: Number(e.target.value) });
                  }}
                  className="w-28 rounded-md border border-gray-300 px-2 py-1"
                />
              </label>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              {saved && <span className="text-sm text-green-600">Saved.</span>}
            </div>
          </form>
        )}

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      <BookableServicesSettings />
      <WorkingHoursEditor />
      <EmbedSnippet tenantSlug={tenantSlug} enabled={settings?.publicBookingEnabled ?? false} />
    </>
  );
}
