"use client";

import { useEffect, useMemo, useState } from "react";
import { getHolidayCatalog, type HolidayRegion } from "@/lib/holidays/catalog";

interface Holiday {
  id: string;
  name: string;
  date: string;
  recurring: boolean;
  blocked: boolean;
}

const REGION_LABELS: Record<HolidayRegion, string> = {
  US: "United States",
  EU: "Europe",
};

function formatHolidayDate(iso: string): string {
  // Stored as a plain UTC-midnight date - format from the UTC fields
  // directly so the displayed month/day never shifts a day off because of
  // the viewer's own timezone.
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}

/** Catalog dates are plain local-time `Date`s (see catalog.ts) - no UTC adjustment needed, unlike `formatHolidayDate` above. */
function formatCatalogDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

export function HolidaySettings() {
  const [enabledNames, setEnabledNames] = useState<string[] | null>(null);
  const [blockedNames, setBlockedNames] = useState<string[] | null>(null);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [savingRegion, setSavingRegion] = useState<HolidayRegion | null>(null);
  // Separate from savingName above (which tracks the enable/disable
  // checkbox) so toggling "Block" on one holiday doesn't also disable the
  // enable checkbox of a different holiday mid-save.
  const [savingBlockedName, setSavingBlockedName] = useState<string | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [recurring, setRecurring] = useState(true);
  const [blockDay, setBlockDay] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingBlockedId, setTogglingBlockedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // This year's date for every known holiday - just a reference point shown
  // next to its checkbox, since most of these shift year to year (see
  // catalog.ts); doesn't affect which actual occurrences get shown.
  const catalog = useMemo(() => getHolidayCatalog(new Date().getFullYear()), []);
  const catalogByRegion = useMemo(() => {
    const byRegion = new Map<HolidayRegion, typeof catalog>();
    for (const h of catalog) {
      byRegion.set(h.region, [...(byRegion.get(h.region) ?? []), h]);
    }
    return byRegion;
  }, [catalog]);

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
          setEnabledNames(settingsData.settings.enabledHolidayNames);
          setBlockedNames(settingsData.settings.blockedHolidayNames);
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

  async function toggleHoliday(holidayName: string) {
    if (enabledNames === null) return;
    const isEnabled = enabledNames.includes(holidayName);
    const next = isEnabled ? enabledNames.filter((n) => n !== holidayName) : [...enabledNames, holidayName];
    setEnabledNames(next);
    setSavingName(holidayName);
    setError(null);
    try {
      const res = await fetch("/api/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledHolidayNames: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
    } catch {
      setEnabledNames(enabledNames);
      setError("Couldn't save - try again.");
    } finally {
      setSavingName(null);
    }
  }

  async function toggleRegion(region: HolidayRegion) {
    if (enabledNames === null) return;
    const regionNames = (catalogByRegion.get(region) ?? []).map((h) => h.name);
    const allEnabled = regionNames.length > 0 && regionNames.every((n) => enabledNames.includes(n));
    const next = allEnabled
      ? enabledNames.filter((n) => !regionNames.includes(n))
      : [...enabledNames, ...regionNames.filter((n) => !enabledNames.includes(n))];
    setEnabledNames(next);
    setSavingRegion(region);
    setError(null);
    try {
      const res = await fetch("/api/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledHolidayNames: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
    } catch {
      setEnabledNames(enabledNames);
      setError("Couldn't save - try again.");
    } finally {
      setSavingRegion(null);
    }
  }

  // Toggles whether an *enabled* catalog holiday also blocks out the whole
  // day (see Tenant.blockedHolidayNames) - a name here with no matching
  // enabled entry has no effect, so this is only exposed next to a holiday
  // that's already checked on.
  async function toggleBlockedHoliday(holidayName: string) {
    if (blockedNames === null) return;
    const isBlocked = blockedNames.includes(holidayName);
    const next = isBlocked ? blockedNames.filter((n) => n !== holidayName) : [...blockedNames, holidayName];
    setBlockedNames(next);
    setSavingBlockedName(holidayName);
    setError(null);
    try {
      const res = await fetch("/api/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockedHolidayNames: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
    } catch {
      setBlockedNames(blockedNames);
      setError("Couldn't save - try again.");
    } finally {
      setSavingBlockedName(null);
    }
  }

  async function toggleCustomHolidayBlocked(holiday: Holiday) {
    setTogglingBlockedId(holiday.id);
    setError(null);
    try {
      const res = await fetch(`/api/holidays/${holiday.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: !holiday.blocked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setHolidays((prev) => prev.map((h) => (h.id === holiday.id ? { ...h, blocked: !holiday.blocked } : h)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save - try again.");
    } finally {
      setTogglingBlockedId(null);
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
        body: JSON.stringify({ name: name.trim(), date, recurring, blocked: blockDay }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      setHolidays((prev) =>
        [...prev, data.holiday].sort((a, b) => a.date.localeCompare(b.date))
      );
      setName("");
      setDate("");
      setRecurring(true);
      setBlockDay(false);
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
        Shown as highlighted days on the calendar for everyone on your team. Check which ones apply to
        your business - US and European holidays never share a name, so it&apos;s safe to turn on any mix
        of both. Check <span className="font-medium text-gray-600">Block</span> on top of that for any
        holiday your business is fully closed on, so it also shows as blocked-out time, not just a tint.
      </p>

      {loading || enabledNames === null || blockedNames === null ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-6">
            {(["US", "EU"] as const).map((region) => {
              const regionHolidays = catalogByRegion.get(region) ?? [];
              const allEnabled =
                regionHolidays.length > 0 && regionHolidays.every((h) => enabledNames.includes(h.name));
              return (
                <div key={region} className="min-w-[16rem] flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                      {REGION_LABELS[region]}
                    </h3>
                    <label className="flex items-center gap-1.5 text-xs text-gray-500">
                      <input
                        type="checkbox"
                        checked={allEnabled}
                        onChange={() => void toggleRegion(region)}
                        disabled={savingRegion === region || regionHolidays.length === 0}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      Select all
                    </label>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {regionHolidays.map((h) => {
                      const isEnabled = enabledNames.includes(h.name);
                      return (
                        <li key={h.name} className="flex items-center gap-2.5 text-sm">
                          <label className="flex flex-1 items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={() => void toggleHoliday(h.name)}
                              disabled={savingName === h.name || savingRegion === region}
                              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-gray-900">{h.name}</span>
                            <span className="text-gray-400">{formatCatalogDate(h.date)}</span>
                          </label>
                          <label
                            className={`flex items-center gap-1 text-xs ${isEnabled ? "text-gray-500" : "text-gray-300"}`}
                            title="Also mark the day as blocked/unavailable on the calendar"
                          >
                            <input
                              type="checkbox"
                              checked={blockedNames.includes(h.name)}
                              onChange={() => void toggleBlockedHoliday(h.name)}
                              disabled={!isEnabled || savingBlockedName === h.name}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            Block
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>

          {holidays.length > 0 && (
            <ul className="mt-5 flex flex-col gap-1.5">
              {holidays.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
                >
                  <span>
                    {formatHolidayDate(h.date)} — {h.name}
                    {h.recurring && <span className="ml-1.5 text-xs text-gray-400">(yearly)</span>}
                  </span>
                  <div className="flex items-center gap-3">
                    <label
                      className="flex items-center gap-1 text-xs text-gray-500"
                      title="Also mark the day as blocked/unavailable on the calendar"
                    >
                      <input
                        type="checkbox"
                        checked={h.blocked}
                        onChange={() => void toggleCustomHolidayBlocked(h)}
                        disabled={togglingBlockedId === h.id}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      Block
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleDelete(h.id)}
                      disabled={deletingId === h.id}
                      className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
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
            <label
              className="flex items-center gap-1.5 pb-1.5 text-sm text-gray-600"
              title="Also mark the day as blocked/unavailable on the calendar"
            >
              <input
                type="checkbox"
                checked={blockDay}
                onChange={(e) => setBlockDay(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Block this day
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
