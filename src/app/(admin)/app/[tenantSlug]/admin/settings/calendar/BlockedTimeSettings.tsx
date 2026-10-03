"use client";

import { useEffect, useState } from "react";

interface BlockedTime {
  id: string;
  label: string | null;
  startTime: string;
  endTime: string;
}

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateFmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${start.toLocaleDateString("en-US", dateFmt)}, ${start.toLocaleTimeString("en-US", timeFmt)} – ${end.toLocaleTimeString("en-US", timeFmt)}`;
  }
  return `${start.toLocaleDateString("en-US", dateFmt)} ${start.toLocaleTimeString("en-US", timeFmt)} – ${end.toLocaleDateString("en-US", dateFmt)} ${end.toLocaleTimeString("en-US", timeFmt)}`;
}

/**
 * Business-wide, visual-only "blocked time" spans (greyed out on the
 * calendar, not a hard constraint - see BlockedTime's schema doc comment).
 * Pairs with HolidaySettings' per-holiday "Block" checkboxes, which cover
 * the holiday case; this is for anything else (half-day closures, a
 * standing weekly maintenance window, etc.) via an arbitrary start/end.
 */
export function BlockedTimeSettings() {
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/blocked-time");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!cancelled) setBlockedTimes(data.blockedTimes);
      } catch {
        if (!cancelled) setError("Couldn't load blocked time.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!start || !end) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/blocked-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || undefined,
          // datetime-local inputs have no timezone suffix, so `new Date(...)`
          // parses them in the viewer's own local time, same as every other
          // date-time input already in this app.
          startTime: new Date(start).toISOString(),
          endTime: new Date(end).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      setBlockedTimes((prev) => [...prev, data.blockedTime].sort((a, b) => a.startTime.localeCompare(b.startTime)));
      setLabel("");
      setStart("");
      setEnd("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add blocked time.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/blocked-time/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      setBlockedTimes((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove blocked time.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Blocked time</h2>
      <p className="mt-1 text-sm text-gray-500">
        Mark a span of time as unavailable on the calendar for everyone on your team - shown greyed out,
        but it&apos;s a visual cue only, not a hard limit, so an appointment or shift can still be created
        over it if you choose to. For a whole holiday, use the <span className="font-medium text-gray-600">Block</span>{" "}
        checkbox on the Holidays card above instead.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : (
        <>
          {blockedTimes.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5">
              {blockedTimes.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
                >
                  <span>
                    {formatRange(b.startTime, b.endTime)}
                    {b.label && <span className="ml-1.5 text-gray-500">— {b.label}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(b.id)}
                    disabled={deletingId === b.id}
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
              Label (optional)
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Staff lunch"
                maxLength={100}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              From
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              To
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <button
              type="submit"
              disabled={creating || !start || !end}
              className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-50"
            >
              {creating ? "Adding..." : "+ Block time"}
            </button>
          </form>
        </>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
