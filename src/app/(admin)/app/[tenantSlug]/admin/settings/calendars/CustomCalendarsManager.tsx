"use client";

import { useEffect, useState } from "react";

interface CustomCalendarRow {
  id: string;
  name: string;
  showClient: boolean;
  requireClient: boolean;
  showJobType: boolean;
  showJobEstimate: boolean;
  showColorKey: boolean;
  showPaymentStatus: boolean;
  _count: { appointments: number };
}

type ToggleKey = "showJobType" | "showJobEstimate" | "showColorKey" | "showPaymentStatus";

const FIELD_TOGGLES: Array<{ key: ToggleKey; label: string; description: string }> = [
  { key: "showJobType", label: "Show job type field", description: "Lets staff pick a job type when scheduling or viewing an entry." },
  {
    key: "showJobEstimate",
    label: "Show job estimate field",
    description: "Lets staff with estimate permissions record an estimated duration and value.",
  },
  { key: "showColorKey", label: "Show color key field", description: "Lets staff tag an entry with a custom color key for the calendar." },
  { key: "showPaymentStatus", label: "Show payment status field", description: "Shows a Paid/Unpaid/Waived/Refunded field on the detail panel." },
];

/**
 * Settings > Calendars > "Custom calendars" - a tenant can create as
 * many named custom calendars as it wants, free on every plan (replaces the old single
 * customCalendarEnabled checkbox + one flat set of form toggles), each with
 * its own independent field-visibility settings. See CustomCalendar in
 * prisma/schema.prisma and the /api/custom-calendars routes.
 */
export function CustomCalendarsManager() {
  const [calendars, setCalendars] = useState<CustomCalendarRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [savingField, setSavingField] = useState<string | null>(null); // `${calendarId}:${field}`
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/custom-calendars");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setCalendars(data.customCalendars);
      setNameDrafts(Object.fromEntries(data.customCalendars.map((c: CustomCalendarRow) => [c.id, c.name])));
    } catch {
      setListError("Couldn't load custom calendars.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function createCalendar(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/custom-calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error ?? "Couldn't create calendar.");
        return;
      }
      setNewName("");
      // Append locally from the POST response rather than re-fetching the
      // whole list - a full reload here could race an in-flight autosave on
      // another row's field (saveField below) and clobber it with
      // not-yet-committed server state.
      const created: CustomCalendarRow = { ...data.customCalendar, _count: { appointments: 0 } };
      setCalendars((prev) => [...(prev ?? []), created]);
      setNameDrafts((prev) => ({ ...prev, [created.id]: created.name }));
    } finally {
      setCreating(false);
    }
  }

  async function saveField(id: string, field: string, value: string | boolean) {
    setSavingField(`${id}:${field}`);
    setFieldError(null);
    try {
      const res = await fetch(`/api/custom-calendars/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setCalendars((prev) => prev?.map((c) => (c.id === id ? { ...c, [field]: value } : c)) ?? prev);
    } catch {
      setFieldError("Couldn't save - try again.");
      await load(); // revert to server truth
    } finally {
      setSavingField(null);
    }
  }

  function toggleField(calendar: CustomCalendarRow, field: ToggleKey) {
    void saveField(calendar.id, field, !calendar[field]);
  }

  function saveNameIfChanged(calendar: CustomCalendarRow) {
    const draft = (nameDrafts[calendar.id] ?? "").trim();
    if (!draft || draft === calendar.name) {
      setNameDrafts((prev) => ({ ...prev, [calendar.id]: calendar.name }));
      return;
    }
    void saveField(calendar.id, "name", draft);
  }

  async function deleteCalendar(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/custom-calendars/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete");
      }
      setConfirmDeleteId(null);
      await load();
    } catch {
      setFieldError("Couldn't delete - try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Custom calendars</h2>
      <p className="mt-1 text-sm text-gray-500">
        Create as many named calendars as you want, each with its own entries and its own form field
        settings - for anything that isn&apos;t a client appointment or a work shift (a lunch outing, a
        personal doctor&apos;s appointment, whatever your team needs to track). Appointments and Shifts
        keep their fixed field sets; these are fully yours to configure.
      </p>

      <form onSubmit={createCalendar} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          New calendar name
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Site Visits"
            className="w-56 rounded-md border border-gray-300 px-2 py-1"
          />
        </label>
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {creating ? "Creating..." : "+ Add calendar"}
        </button>
      </form>
      {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : listError ? (
        <p className="mt-4 text-sm text-red-600">{listError}</p>
      ) : calendars && calendars.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No custom calendars yet - add one above.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {calendars?.map((c) => (
            <div key={c.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  value={nameDrafts[c.id] ?? c.name}
                  onChange={(e) => setNameDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  onBlur={() => saveNameIfChanged(c)}
                  disabled={savingField === `${c.id}:name`}
                  className="rounded-md border border-gray-300 px-2 py-1 text-sm font-medium"
                />
                {confirmDeleteId === c.id ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">
                      Delete &quot;{c.name}&quot;{c._count.appointments > 0 ? ` and its ${c._count.appointments} entr${c._count.appointments === 1 ? "y" : "ies"}` : ""}?
                    </span>
                    <button
                      type="button"
                      onClick={() => void deleteCalendar(c.id)}
                      disabled={deletingId === c.id}
                      className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deletingId === c.id ? "Deleting..." : "Confirm delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs text-gray-500 hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(c.id)}
                    className="text-sm font-medium text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-col gap-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={c.showClient}
                    onChange={() => toggleField(c, "showClient" as ToggleKey)}
                    disabled={savingField === `${c.id}:showClient`}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-gray-900">Show client field</span>
                    <br />
                    <span className="text-gray-500">Lets staff attach a client to an entry on this calendar.</span>
                  </span>
                </label>
                <label className={`ml-7 flex items-start gap-3 ${c.showClient ? "" : "opacity-50"}`}>
                  <input
                    type="checkbox"
                    checked={c.requireClient}
                    onChange={() => toggleField(c, "requireClient" as ToggleKey)}
                    disabled={savingField === `${c.id}:requireClient` || !c.showClient}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-gray-900">Require a client</span>
                    <br />
                    <span className="text-gray-500">Only meaningful when the client field above is shown.</span>
                  </span>
                </label>

                {FIELD_TOGGLES.map((f) => (
                  <label key={f.key} className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={c[f.key]}
                      onChange={() => toggleField(c, f.key)}
                      disabled={savingField === `${c.id}:${f.key}`}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm">
                      <span className="font-medium text-gray-900">{f.label}</span>
                      <br />
                      <span className="text-gray-500">{f.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {fieldError && <p className="mt-2 text-sm text-red-600">{fieldError}</p>}
    </section>
  );
}
