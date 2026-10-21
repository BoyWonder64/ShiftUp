"use client";

import { useEffect, useState } from "react";

interface StaffOption {
  id: string;
  displayName: string;
}

interface WorkingHoursWindow {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

/**
 * A staff member's recurring weekly availability (WorkingHours) - what the
 * public booking engine (src/modules/scheduling/availability.ts) reads to
 * decide whether a staff member is bookable at all. Distinct from
 * Tenant.calendarStartMinute/endMinute (just the internal calendar grid's
 * display range) - a staff member with no working hours set here never
 * shows up on the public booking page, regardless of that setting.
 */
export function WorkingHoursEditor() {
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [windows, setWindows] = useState<WorkingHoursWindow[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [loadingWindows, setLoadingWindows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newDay, setNewDay] = useState(1);
  const [newStart, setNewStart] = useState(9 * 60);
  const [newEnd, setNewEnd] = useState(17 * 60);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/staff");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        const options: StaffOption[] = data.staff.map((s: { id: string; displayName: string }) => ({
          id: s.id,
          displayName: s.displayName,
        }));
        setStaffList(options);
        if (options.length > 0) setSelectedStaffId(options[0].id);
      } catch {
        setError("Couldn't load staff.");
      } finally {
        setLoadingStaff(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedStaffId) return;
    let cancelled = false;
    (async () => {
      setLoadingWindows(true);
      setSaved(false);
      try {
        const res = await fetch(`/api/staff/${selectedStaffId}/working-hours`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!cancelled) {
          setWindows(
            data.workingHours.map((w: WorkingHoursWindow) => ({
              dayOfWeek: w.dayOfWeek,
              startMinute: w.startMinute,
              endMinute: w.endMinute,
            }))
          );
        }
      } catch {
        if (!cancelled) setError("Couldn't load working hours.");
      } finally {
        if (!cancelled) setLoadingWindows(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedStaffId]);

  function addWindow() {
    if (newEnd <= newStart) {
      setError("End time must be after start time.");
      return;
    }
    setError(null);
    setSaved(false);
    setWindows((prev) =>
      [...prev, { dayOfWeek: newDay, startMinute: newStart, endMinute: newEnd }].sort(
        (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute
      )
    );
  }

  function removeWindow(index: number) {
    setSaved(false);
    setWindows((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    if (!selectedStaffId) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/staff/${selectedStaffId}/working-hours`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Staff working hours</h2>
      <p className="mt-1 text-sm text-gray-500">
        When each staff member is open to be booked publicly. A staff member with no working hours set here
        never shows up as bookable, even while public booking is on.
      </p>

      {loadingStaff ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : staffList.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No staff yet - add one under Settings &gt; Staff.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Staff member
            <select
              value={selectedStaffId ?? ""}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="w-56 rounded-md border border-gray-300 px-2 py-1"
            >
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </label>

          {loadingWindows ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : (
            <>
              {windows.length === 0 ? (
                <p className="text-sm text-gray-400">No working hours set yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {windows.map((w, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
                    >
                      <span>
                        <span className="font-medium text-gray-900">{DAY_LABELS[w.dayOfWeek]}</span>{" "}
                        <span className="text-gray-500">
                          {formatMinutes(w.startMinute)} – {formatMinutes(w.endMinute)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeWindow(i)}
                        className="text-xs text-gray-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
                <label className="flex flex-col gap-1 text-xs">
                  Day
                  <select
                    value={newDay}
                    onChange={(e) => setNewDay(Number(e.target.value))}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  >
                    {DAY_LABELS.map((label, i) => (
                      <option key={i} value={i}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Starts
                  <select
                    value={newStart}
                    onChange={(e) => setNewStart(Number(e.target.value))}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  >
                    {TIME_OPTIONS.filter((m) => m < 1440).map((m) => (
                      <option key={m} value={m}>
                        {formatMinutes(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Ends
                  <select
                    value={newEnd}
                    onChange={(e) => setNewEnd(Number(e.target.value))}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  >
                    {TIME_OPTIONS.filter((m) => m > 0).map((m) => (
                      <option key={m} value={m}>
                        {formatMinutes(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={addWindow}
                  className="rounded-lg border border-primary-300 px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50"
                >
                  + Add window
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                {saved && <span className="text-sm text-green-600">Saved.</span>}
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
