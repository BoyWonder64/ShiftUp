"use client";

import { useEffect, useState } from "react";

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  reportsToId: string | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function RoleManager() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newReportsTo, setNewReportsTo] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await fetchJson<{ roles: RoleRow[] }>("/api/roles");
      setRoles(data.roles);
    } catch {
      setError("Couldn't load roles.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function saveField(id: string, patch: Partial<Pick<RoleRow, "name" | "description" | "reportsToId">>) {
    setSavingId(id);
    setError(null);
    try {
      await fetchJson(`/api/roles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      await fetchJson(`/api/roles/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove role.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await fetchJson("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || null,
          reportsToId: newReportsTo || null,
        }),
      });
      setNewName("");
      setNewDescription("");
      setNewReportsTo("");
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Couldn't create role.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Roles</h2>
      <p className="mt-1 text-sm text-gray-500">
        Rename, describe, and organize your team&apos;s roles - add as many as
        your business needs (a police department and a plumbing company don&apos;t
        need the same ones). What each role can actually do is set separately
        below, in the permission matrix.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {roles.map((role) => (
            <div
              key={role.id}
              className="flex flex-col gap-3 rounded-lg border border-gray-200 p-3 sm:flex-row sm:items-end"
            >
              <label className="flex flex-1 flex-col gap-1 text-sm">
                Name
                <input
                  defaultValue={role.name}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && value !== role.name) void saveField(role.id, { name: value });
                  }}
                  disabled={savingId === role.id}
                  className="rounded-md border border-gray-300 px-2 py-1.5 disabled:opacity-50"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                Description
                <input
                  defaultValue={role.description ?? ""}
                  placeholder="What is this role for?"
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value !== (role.description ?? "")) void saveField(role.id, { description: value || null });
                  }}
                  disabled={savingId === role.id}
                  className="rounded-md border border-gray-300 px-2 py-1.5 disabled:opacity-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Reports to
                <select
                  value={role.reportsToId ?? ""}
                  onChange={(e) => void saveField(role.id, { reportsToId: e.target.value || null })}
                  disabled={savingId === role.id}
                  className="rounded-md border border-gray-300 px-2 py-1.5 disabled:opacity-50"
                >
                  <option value="">None</option>
                  {roles
                    .filter((r) => r.id !== role.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void handleDelete(role.id)}
                disabled={deletingId === role.id}
                className="rounded-md border border-[#BD3039] px-3 py-1.5 text-sm text-[#BD3039] hover:bg-[#BD3039]/10 disabled:opacity-50"
              >
                {deletingId === role.id ? "Removing..." : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <form
        onSubmit={handleCreate}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-primary-100 bg-linear-to-br from-primary-50 to-white p-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          New role name
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            maxLength={40}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Description (optional)
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            maxLength={300}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Reports to
          <select
            value={newReportsTo}
            onChange={(e) => setNewReportsTo(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          >
            <option value="">None</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-[radial-gradient(circle_at_center,var(--color-primary-500)_0%,var(--color-primary-700)_100%)] hover:shadow-md disabled:opacity-50"
        >
          {creating ? "Adding..." : "+ Add role"}
        </button>
      </form>
      {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}
    </section>
  );
}
