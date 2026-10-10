"use client";

import { useEffect, useState } from "react";

interface StaffOption {
  id: string;
  displayName: string;
}

interface WorkingHoursRow {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Human-readable label for a minutes-from-midnight value, e.g. 450 -> "7:30 AM". Same convention as CalendarHoursSettings.tsx. */
function formatMinutes(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30); // every half hour, 0 (Midnight) .. 1410 (11:30 PM)

/** One day's window, or null = not working that day - the UI's simplification of WorkingHours (one window per day, not an arbitrary list), enforced here, not at the DB level. */
type DayWindow = { startMinute: number; endMinute: number } | null;

function rowsToWindows(rows: WorkingHoursRow[]): DayWindow[] {
  const windows: DayWindow[] = Array(7).fill(null);
  for (const r of rows) {
    windows[r.dayOfWeek] = { startMinute: r.startMinute, endMinute: r.endMinute };
  }
  return windows;
}

/** Per-staff-member weekly bookable hours (WorkingHours) - what the public booking widget's availability engine reads to decide when that staff member can be booked at all. */
export function WorkingHoursEditor() {
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [windows, setWindows] = useState<DayWindow[]>(Array(7).fill(null));
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [loadingHours, setLoadingHours] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setStaffOptions(options);
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
    setLoadingHours(true);
    setSaved(false);
    (async () => {
      try {
        const res = await fetch(`/api/staff/${selectedStaffId}/working-hours`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!cancelled) setWindows(rowsToWindows(data.workingHours));
      } catch {
        if (!cancelled) setError("Couldn't load working hours.");
      } finally {
        if (!cancelled) setLoadingHours(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedStaffId]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const body = {
        windows: windows
          .map((w, dayOfWeek) => (w ? { dayOfWeek, startMinute: w.startMinute, endMinute: w.endMinute } : null))
          .filter((w): w is { dayOfWeek: number; startMinute: number; endMinute: number } => w !== null),
      };
      const res = await fetch(`/api/staff/${selectedStaffId}/working-hours`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setWindows(rowsToWindows(data.workingHours));
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
        When each staff member is available to be booked publicly - a staff member with no hours set here never
        shows up on the public booking page at all, regardless of which services are bookable.
      </p>

      {loadingStaff ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : staffOptions.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No staff yet - add one under Settings &gt; Staff.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Staff member
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="w-56 rounded-md border border-gray-300 px-2 py-1"
            >
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </label>

          {loadingHours ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : (
            <div className="flex flex-col gap-2">
              {DAY_LABELS.map((label, dayOfWeek) => {
                const w = windows[dayOfWeek];
                return (
                  <div key={dayOfWeek} className="flex items-center gap-3 text-sm">
                    <label className="flex w-28 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={w !== null}
                        onChange={(e) => {
                          setSaved(false);
                          setWindows((prev) => {
                            const next = [...prev];
                            next[dayOfWeek] = e.target.checked ? { startMinute: 9 * 60, endMinute: 17 * 60 } : null;
                            return next;
                          });
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      {label}
                    </label>
                    {w && (
                      <>
                        <select
                          value={w.startMinute}
                          onChange={(e) => {
                            setSaved(false);
                            setWindows((prev) => {
                              const next = [...prev];
                              next[dayOfWeek] = { ...w, startMinute: Number(e.target.value) };
                              return next;
                            });
                          }}
                          className="rounded-md border border-gray-300 px-2 py-1"
                        >
                          {TIME_OPTIONS.map((m) => (
                            <option key={m} value={m}>
                              {formatMinutes(m)}
                            </option>
                          ))}
                        </select>
                        <span className="text-gray-400">to</span>
                        <select
                          value={w.endMinute}
                          onChange={(e) => {
                            setSaved(false);
                            setWindows((prev) => {
                              const next = [...prev];
                              next[dayOfWeek] = { ...w, endMinute: Number(e.target.value) };
                              return next;
                            });
                          }}
                          className="rounded-md border border-gray-300 px-2 py-1"
                        >
                          {[...TIME_OPTIONS, 1440].map((m) => (
                            <option key={m} value={m}>
                              {m === 1440 ? "Midnight" : formatMinutes(m)}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                );
              })}

              <div className="mt-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || windows.some((w) => w && w.endMinute <= w.startMinute)}
                  className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                {saved && <span className="text-sm text-green-600">Saved.</span>}
                {windows.some((w) => w && w.endMinute <= w.startMinute) && (
                  <span className="text-sm text-red-600">End time must be after start time.</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
