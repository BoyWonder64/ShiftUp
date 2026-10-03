"use client";

import { useEffect, useState } from "react";

export function EventEditingSettings() {
  const [allowEditingBookedEvents, setAllowEditingBookedEvents] = useState<boolean | null>(null);
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
        if (!cancelled) setAllowEditingBookedEvents(data.settings.allowEditingBookedEvents);
      } catch {
        if (!cancelled) setError("Couldn't load this setting.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    if (allowEditingBookedEvents === null) return;
    const next = !allowEditingBookedEvents;
    setAllowEditingBookedEvents(next);
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowEditingBookedEvents: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSaved(true);
    } catch {
      setAllowEditingBookedEvents(!next); // revert on failure
      setError("Couldn't save - try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Editing booked events</h2>
      <p className="mt-1 text-sm text-gray-500">
        Whether an appointment or shift can be changed after it&apos;s booked - reassigning staff,
        rescheduling, or updating the client, service, location, price, and payment status. Turning
        this off locks every booked event in place for everyone, regardless of their role&apos;s edit
        permissions. Cancelling a booking is unaffected either way.
      </p>

      {loading || allowEditingBookedEvents === null ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : (
        <label className="mt-4 flex items-start gap-3">
          <input
            type="checkbox"
            checked={allowEditingBookedEvents}
            onChange={toggle}
            disabled={saving}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm">
            <span className="font-medium text-gray-900">Allow editing booked events</span>
            <br />
            <span className="text-gray-500">On by default. Turn off to freeze every booked event as-is.</span>
          </span>
        </label>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {saved && !saving && <p className="mt-2 text-sm text-green-600">Saved.</p>}
    </section>
  );
}
