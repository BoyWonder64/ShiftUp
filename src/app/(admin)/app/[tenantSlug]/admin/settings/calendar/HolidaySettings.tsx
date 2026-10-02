"use client";

import { useEffect, useState } from "react";

interface Holiday {
  id: string;
  name: string;
  date: string;
  recurring: boolean;
}

function formatHolidayDate(iso: string): string {
  // Stored as a plain UTC-midnight date - format from the UTC fields
  // directly so the displayed month/day never shifts a day off because of
  // the viewer's own timezone.
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}

export function HolidaySettings() {
  const [showFederal, setShowFederal] = useState<boolean | null>(null);
  const [savingToggle, setSavingToggle] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [recurring, setRecurring] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settingsRes, holidaysRes] = await Promise.all([
          fetch("/api/tenant-settings"),
          fetch("/api/holidays"),
        ]);
        const settingsData = await settingsRes.json();
        const holidaysData = await holidaysRes.json();
        if (!settingsRes.ok) throw new Error(settingsData.error ?? "Failed to load");
        if (!holidaysRes.ok) throw new Error(holidaysData.error ?? "Failed to load");
        if (!cancelled) {
          setShowFederal(settingsData.settings.showFederalHolidays);
          setHolidays(holidaysData.holidays);
        }
      } catch {
        if (!cancelled) setError("Couldn't load holiday settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleFederal() {
    if (showFederal === null) return;
    const next = !showFederal;
    setShowFederal(next);
    setSavingToggle(true);
    setError(null);
    try {
      const res = await fetch("/api/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showFederalHolidays: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
    } catch {
      setShowFederal(!next);
      setError("Couldn't save - try again.");
    } finally {
      setSavingToggle(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !date) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), date, recurring }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      setHolidays((prev) =>
        [...prev, data.holiday].sort((a, b) => a.date.localeCompare(b.date))
      );
      setName("");
      setDate("");
      setRecurring(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add holiday.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/holidays/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      setHolidays((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove holiday.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Holidays</h2>
      <p className="mt-1 text-sm text-gray-500">
        Shown as highlighted days on the calendar for everyone on your team.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : (
        <>
          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              checked={showFederal ?? false}
              onChange={toggleFederal}
              disabled={savingToggle}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm">
              <span className="font-medium text-gray-900">Show US federal holidays</span>
              <br />
              <span className="text-gray-500">
                New Year&apos;s Day, MLK Day, Independence Day, Thanksgiving, Christmas, and the rest of
                the standard 11.
              </span>
            </span>
          </label>

          {holidays.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5">
              {holidays.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
                >
                  <span>
                    {formatHolidayDate(h.date)} — {h.name}
                    {h.recurring && <span className="ml-1.5 text-xs text-gray-400">(yearly)</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(h.id)}
                    disabled={deletingId === h.id}
                    className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Holiday name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Company Anniversary"
                maxLength={100}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-1.5 pb-1.5 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Repeats every year
            </label>
            <button
              type="submit"
              disabled={creating || !name.trim() || !date}
              className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-50"
            >
              {creating ? "Adding..." : "+ Add holiday"}
            </button>
          </form>
        </>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
