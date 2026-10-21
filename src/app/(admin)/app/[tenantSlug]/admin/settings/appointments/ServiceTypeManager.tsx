"use client";

import { useEffect, useState } from "react";

interface ServiceType {
  id: string;
  name: string;
  durationMinutes: number;
  /** Null = no price set at all (e.g. police work that's never billed) - distinct from an explicit $0. */
  price: string | null;
  requiresPayment: boolean;
  isActive: boolean;
}

interface Draft {
  name: string;
  durationMinutes: string;
  price: string;
  requiresPayment: boolean;
}

function toDraft(s: ServiceType): Draft {
  return {
    name: s.name,
    durationMinutes: String(s.durationMinutes),
    price: s.price ?? "",
    requiresPayment: s.requiresPayment,
  };
}

/** Blank stays null (no price concept); otherwise the parsed dollar amount. */
function parsePrice(raw: string): number | null | undefined {
  if (raw.trim() === "") return null;
  const dollars = Number(raw);
  if (Number.isNaN(dollars) || dollars < 0) return undefined;
  return dollars;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

/**
 * Appointment-only job/service types (ISSUES.md #1) - split out from the
 * formerly-shared `ServiceType` table, which both this Appointments settings
 * page and the Shifts settings page used to render/edit together. The
 * Shifts settings page has its own, simpler `ShiftServiceTypeManager`
 * instead (no price/payment - a shift has neither).
 */
export function ServiceTypeManager() {
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [price, setPrice] = useState("");
  const [requiresPayment, setRequiresPayment] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchJson<{ serviceTypes: ServiceType[] }>("/api/appointment-service-types");
        setServiceTypes(data.serviceTypes);
      } catch {
        setError("Couldn't load service types.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const minutes = Number(durationMinutes);
    const dollars = parsePrice(price);
    if (!name.trim() || !Number.isInteger(minutes) || minutes <= 0 || dollars === undefined) return;
    setCreating(true);
    setError(null);
    try {
      const data = await fetchJson<{ serviceType: ServiceType }>("/api/appointment-service-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), durationMinutes: minutes, price: dollars, requiresPayment }),
      });
      setServiceTypes((prev) => [...prev, data.serviceType].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setDurationMinutes("60");
      setPrice("");
      setRequiresPayment(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add service type.");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(s: ServiceType) {
    setEditingId(s.id);
    setEditDraft(toDraft(s));
  }

  async function handleSaveEdit(id: string) {
    if (!editDraft) return;
    const minutes = Number(editDraft.durationMinutes);
    const dollars = parsePrice(editDraft.price);
    if (!editDraft.name.trim() || !Number.isInteger(minutes) || minutes <= 0 || dollars === undefined) return;
    setSavingId(id);
    setError(null);
    try {
      const data = await fetchJson<{ serviceType: ServiceType }>(`/api/appointment-service-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editDraft.name.trim(),
          durationMinutes: minutes,
          price: dollars,
          requiresPayment: editDraft.requiresPayment,
        }),
      });
      setServiceTypes((prev) =>
        prev.map((s) => (s.id === id ? data.serviceType : s)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
      setEditDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleToggleActive(s: ServiceType) {
    const next = !s.isActive;
    setServiceTypes((prev) => prev.map((t) => (t.id === s.id ? { ...t, isActive: next } : t)));
    setTogglingId(s.id);
    setError(null);
    try {
      await fetchJson(`/api/appointment-service-types/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
    } catch (err) {
      setServiceTypes((prev) => prev.map((t) => (t.id === s.id ? { ...t, isActive: s.isActive } : t))); // revert
      setError(err instanceof Error ? err.message : "Couldn't update status.");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      await fetchJson(`/api/appointment-service-types/${id}`, { method: "DELETE" });
      setServiceTypes((prev) => prev.filter((s) => s.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setEditDraft(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove service type.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section id="appointment-service-types" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Service types</h2>
      <p className="mt-1 text-sm text-gray-500">
        The job types staff pick from when scheduling an appointment - name, default duration, and an
        optional price. Leave price blank for work that doesn&apos;t have one (e.g. unbilled visits); an
        explicit $0 is stored separately but displays the same way - neither one shows a price. Turn a
        service type off to hide it from new scheduling without losing it from past appointments.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : (
        <>
          {serviceTypes.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5">
              {serviceTypes.map((s) => {
                const isEditing = editingId === s.id;
                return (
                  <li
                    key={s.id}
                    className={`rounded-md border border-gray-200 px-3 py-2 text-sm ${
                      s.isActive ? "bg-gray-50" : "bg-gray-100 opacity-60"
                    }`}
                  >
                    {isEditing && editDraft ? (
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="flex flex-col gap-1 text-xs text-gray-500">
                          Name
                          <input
                            value={editDraft.name}
                            onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                          />
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
                        <label className="flex flex-col gap-1 text-xs text-gray-500">
                          Price ($, optional)
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="None"
                            value={editDraft.price}
                            onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })}
                            title="A price of 0 won't be shown, same as leaving it blank"
                            className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={editDraft.requiresPayment}
                            onChange={(e) => setEditDraft({ ...editDraft, requiresPayment: e.target.checked })}
                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          Requires payment
                        </label>
                        <button
                          type="button"
                          onClick={() => void handleSaveEdit(s.id)}
                          disabled={savingId === s.id}
                          className="rounded-lg bg-primary-500 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50"
                        >
                          {savingId === s.id ? "Saving..." : "Save"}
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
                          <span className="font-medium text-gray-900">{s.name}</span>{" "}
                          <span className="text-gray-500">
                            — {s.durationMinutes} min
                            {s.price === null && " · no price set"}
                            {/* An explicit $0 is stored separately from "no price set" (see the
                                ServiceType interface above), but displays the same way - left out
                                entirely rather than printing "$0.00". */}
                            {s.price !== null && Number(s.price) > 0 && ` · $${Number(s.price).toFixed(2)}`}
                            {s.requiresPayment && " · requires payment"}
                            {!s.isActive && " · inactive"}
                          </span>
                        </span>
                        <span className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 text-xs text-gray-500">
                            <input
                              type="checkbox"
                              checked={s.isActive}
                              onChange={() => void handleToggleActive(s)}
                              disabled={togglingId === s.id}
                              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            Active
                          </label>
                          <button
                            type="button"
                            onClick={() => startEdit(s)}
                            className="text-xs text-gray-400 hover:text-primary-600"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(s.id)}
                            disabled={deletingId === s.id}
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
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard visit"
                maxLength={200}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
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
            <label className="flex flex-col gap-1 text-sm">
              Price ($, optional)
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="None"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                title="A price of 0 won't be shown, same as leaving it blank"
                className="w-24 rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-1.5 pb-1.5 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={requiresPayment}
                onChange={(e) => setRequiresPayment(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Requires payment
            </label>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-50"
            >
              {creating ? "Adding..." : "+ Add service type"}
            </button>
          </form>
        </>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
