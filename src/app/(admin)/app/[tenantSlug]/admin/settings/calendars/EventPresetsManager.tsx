"use client";

import { useEffect, useState } from "react";

type EntryKind = "SHIFT" | "APPOINTMENT" | "CUSTOM";

interface EventPreset {
  id: string;
  label: string;
  entryKind: EntryKind;
  customCalendarId: string | null;
  durationMinutes: number;
}

interface CustomCalendarOption {
  id: string;
  name: string;
}

interface Draft {
  label: string;
  kindValue: string; // "SHIFT" | "APPOINTMENT" | `CUSTOM:<id>` - see kindValueFor/parseKindValue
  durationMinutes: string;
}

// Combines entryKind + customCalendarId into one <select> value, same
// pattern SchedulingCalendar.tsx's Color key picker uses for built-in vs.
// custom tag options - keeps "which kind" a single control instead of a
// second dropdown that only sometimes applies.
function kindValueFor(entryKind: EntryKind, customCalendarId: string | null): string {
  return entryKind === "CUSTOM" ? `CUSTOM:${customCalendarId ?? ""}` : entryKind;
}

function parseKindValue(value: string): { entryKind: EntryKind; customCalendarId: string | null } {
  if (value.startsWith("CUSTOM:")) {
    return { entryKind: "CUSTOM", customCalendarId: value.slice("CUSTOM:".length) || null };
  }
  return { entryKind: value as "SHIFT" | "APPOINTMENT", customCalendarId: null };
}

function kindLabel(preset: EventPreset, customCalendars: CustomCalendarOption[]): string {
  if (preset.entryKind === "SHIFT") return "Shift";
  if (preset.entryKind === "APPOINTMENT") return "Appointment";
  return customCalendars.find((c) => c.id === preset.customCalendarId)?.name ?? "Custom";
}

function toDraft(p: EventPreset): Draft {
  return {
    label: p.label,
    kindValue: kindValueFor(p.entryKind, p.customCalendarId),
    durationMinutes: String(p.durationMinutes),
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

/**
 * Settings > Calendars > "Preset events" - admin-defined quick-fill
 * templates (see EventPreset in prisma/schema.prisma) for one-off entries
 * that don't deserve their own job type, e.g. "Lunch outing." Picking one in
 * the calendar's create form sets the entry's kind/custom calendar and
 * computes its end time from durationMinutes in one step.
 */
export function EventPresetsManager() {
  const [presets, setPresets] = useState<EventPreset[]>([]);
  const [customCalendars, setCustomCalendars] = useState<CustomCalendarOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [kindValue, setKindValue] = useState<string>("SHIFT");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [presetsData, calendarsData] = await Promise.all([
          fetchJson<{ eventPresets: EventPreset[] }>("/api/event-presets"),
          fetchJson<{ customCalendars: CustomCalendarOption[] }>("/api/custom-calendars"),
        ]);
        setPresets(presetsData.eventPresets);
        setCustomCalendars(calendarsData.customCalendars);
      } catch {
        setError("Couldn't load preset events.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function buildPayload(label: string, kindValue: string, durationMinutes: string) {
    const minutes = Number(durationMinutes);
    if (!label.trim() || !Number.isInteger(minutes) || minutes <= 0) return null;
    const { entryKind, customCalendarId } = parseKindValue(kindValue);
    if (entryKind === "CUSTOM" && !customCalendarId) return null;
    return { label: label.trim(), entryKind, customCalendarId: customCalendarId ?? undefined, durationMinutes: minutes };
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildPayload(label, kindValue, durationMinutes);
    if (!payload) return;
    setCreating(true);
    setError(null);
    try {
      const data = await fetchJson<{ eventPreset: EventPreset }>("/api/event-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setPresets((prev) => [...prev, data.eventPreset]);
      setLabel("");
      setDurationMinutes("60");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add preset.");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(p: EventPreset) {
    setEditingId(p.id);
    setEditDraft(toDraft(p));
  }

  async function handleSaveEdit(id: string) {
    if (!editDraft) return;
    const payload = buildPayload(editDraft.label, editDraft.kindValue, editDraft.durationMinutes);
    if (!payload) return;
    setSavingId(id);
    setError(null);
    try {
      const data = await fetchJson<{ eventPreset: EventPreset }>(`/api/event-presets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setPresets((prev) => prev.map((p) => (p.id === id ? data.eventPreset : p)));
      setEditingId(null);
      setEditDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      await fetchJson(`/api/event-presets/${id}`, { method: "DELETE" });
      setPresets((prev) => prev.filter((p) => p.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setEditDraft(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove preset.");
    } finally {
      setDeletingId(null);
    }
  }

  const kindOptions = (
    <>
      <option value="SHIFT">Shift</option>
      <option value="APPOINTMENT">Appointment</option>
      {customCalendars.map((c) => (
        <option key={c.id} value={`CUSTOM:${c.id}`}>
          {c.name}
        </option>
      ))}
    </>
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Preset events</h2>
      <p className="mt-1 text-sm text-gray-500">
        Quick-fill templates for things staff add to the calendar repeatedly but that aren&apos;t a client
        appointment or a work shift - &quot;Lunch outing,&quot; &quot;Doctor&apos;s appointment,&quot; whatever
        your team needs. Picking one when creating an entry sets its kind and length in one step.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : (
        <>
          {presets.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5">
              {presets.map((p) => {
                const isEditing = editingId === p.id;
                return (
                  <li key={p.id} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                    {isEditing && editDraft ? (
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="flex flex-col gap-1 text-xs text-gray-500">
                          Label
                          <input
                            value={editDraft.label}
                            onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-gray-500">
                          Creates a
                          <select
                            value={editDraft.kindValue}
                            onChange={(e) => setEditDraft({ ...editDraft, kindValue: e.target.value })}
                            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                          >
                            {kindOptions}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-gray-500">
                          Minutes
                          <input
                            type="number"
                            min={1}
                            value={editDraft.durationMinutes}
                            onChange={(e) => setEditDraft({ ...editDraft, durationMinutes: e.target.value })}
                            className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void handleSaveEdit(p.id)}
                          disabled={savingId === p.id}
                          className="rounded-lg bg-primary-500 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50"
                        >
                          {savingId === p.id ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditDraft(null);
                          }}
                          className="text-xs text-gray-400 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span>
                          <span className="font-medium text-gray-900">{p.label}</span>{" "}
                          <span className="text-gray-500">
                            — {kindLabel(p, customCalendars)} · {p.durationMinutes} min
                          </span>
                        </span>
                        <span className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            className="text-xs text-gray-400 hover:text-primary-600"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(p.id)}
                            disabled={deletingId === p.id}
                            className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Label
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Lunch outing"
                maxLength={200}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Creates a
              <select
                value={kindValue}
                onChange={(e) => setKindValue(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1"
              >
                {kindOptions}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Minutes
              <input
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-20 rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <button
              type="submit"
              disabled={creating || !label.trim()}
              className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-50"
            >
              {creating ? "Adding..." : "+ Add preset"}
            </button>
          </form>
        </>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
