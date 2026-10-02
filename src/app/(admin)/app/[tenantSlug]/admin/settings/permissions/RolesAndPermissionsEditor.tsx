"use client";

import { useEffect, useState } from "react";
import { type PermissionKey } from "@/lib/permissions/catalog";
import { RoleDetailPanel } from "./RoleDetailPanel";

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  reportsToId: string | null;
}

export type Grants = Record<string, Record<PermissionKey, boolean>>;
export type Visibility = Record<string, Record<string, boolean>>;

/**
 * Groups PERMISSION_KEYS for display only - no new permission keys, no
 * change to what's actually enforced. "Scheduling" deliberately covers both
 * appointments and shifts together (not two separate sections) because
 * they share one set of permission keys in the data model - a shift is just
 * an Appointment row with no client attached, see ARCHITECTURE.md. The two
 * VIEW_ALL_* keys are the one exception - they're genuinely split per type
 * (a role can see all shifts without seeing all appointments, or vice versa)
 * since "see outside your own" is naturally a different call per type, unlike
 * create/edit/cancel which this app doesn't split that way.
 */
export const PERMISSION_GROUPS: Array<{ label: string; note?: string; keys: PermissionKey[] }> = [
  {
    label: "Scheduling (appointments & shifts)",
    note: "Create/edit/cancel apply to both - appointments and shifts share those permissions. \"See all\" is split per type below: without it, a role only sees its own shifts/appointments on the calendar (plus a toggle to deliberately narrow down even when it can see everyone's).",
    keys: [
      "VIEW_APPOINTMENTS",
      "CREATE_APPOINTMENTS",
      "EDIT_APPOINTMENTS",
      "CANCEL_APPOINTMENTS",
      "VIEW_CALENDAR_TOGGLE",
      "VIEW_ALL_SHIFTS",
      "VIEW_ALL_APPOINTMENTS",
    ],
  },
  { label: "Job estimates", keys: ["VIEW_JOB_ESTIMATES", "EDIT_JOB_ESTIMATES"] },
  { label: "Clients", keys: ["VIEW_CLIENTS", "CREATE_CLIENTS", "EDIT_CLIENTS", "DELETE_CLIENTS"] },
  { label: "Staff", keys: ["VIEW_STAFF", "CREATE_STAFF", "EDIT_STAFF", "DELETE_STAFF"] },
  { label: "Services", keys: ["VIEW_SERVICES", "CREATE_SERVICES", "EDIT_SERVICES", "DELETE_SERVICES"] },
  { label: "Roster", keys: ["VIEW_ROSTER"] },
  { label: "Time off", keys: ["VIEW_TIME_OFF", "APPROVE_TIME_OFF"] },
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function RolesAndPermissionsEditor() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [grants, setGrants] = useState<Grants>({});
  const [visibility, setVisibility] = useState<Visibility>({});
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newReportsTo, setNewReportsTo] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Single place both the role list and the permission/visibility matrices
  // come from, so creating/renaming/deleting a role and configuring its
  // permissions can never go out of sync with each other the way two
  // independently-fetching components used to.
  async function reload(selectId?: string) {
    const [rolesData, permsData] = await Promise.all([
      fetchJson<{ roles: RoleRow[] }>("/api/roles"),
      fetchJson<{ permissions: { grants: Grants }; visibility: { canView: Visibility } }>(
        "/api/admin/permissions"
      ),
    ]);
    setRoles(rolesData.roles);
    setGrants(permsData.permissions.grants);
    setVisibility(permsData.visibility.canView);
    setSelectedRoleId((prev) => {
      if (selectId) return selectId;
      if (prev && rolesData.roles.some((r) => r.id === prev)) return prev;
      return rolesData.roles[0]?.id ?? null;
    });
  }

  useEffect(() => {
    (async () => {
      try {
        await reload();
      } catch {
        setError("Couldn't load roles and permissions.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const { role } = await fetchJson<{ role: RoleRow }>("/api/roles", {
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
      // Jump straight to the new role so its permissions can be configured
      // immediately, instead of landing back on whatever was selected before.
      await reload(role.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Couldn't create role.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveField(
    id: string,
    patch: Partial<Pick<RoleRow, "name" | "description" | "reportsToId">>
  ) {
    setError(null);
    try {
      await fetchJson(`/api/roles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    await fetchJson(`/api/roles/${id}`, { method: "DELETE" });
    await reload();
  }

  async function handleToggleGrant(roleId: string, key: PermissionKey) {
    const next = !grants[roleId]?.[key];
    setGrants((prev) => ({ ...prev, [roleId]: { ...prev[roleId], [key]: next } }));
    try {
      await fetchJson("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionUpdates: [{ roleId, permissionKey: key, granted: next }] }),
      });
    } catch {
      setGrants((prev) => ({ ...prev, [roleId]: { ...prev[roleId], [key]: !next } }));
      setError("Couldn't save that change - try again.");
    }
  }

  async function handleToggleVisibility(viewerId: string, targetId: string) {
    const next = !visibility[viewerId]?.[targetId];
    setVisibility((prev) => ({ ...prev, [viewerId]: { ...prev[viewerId], [targetId]: next } }));
    try {
      await fetchJson("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visibilityUpdates: [{ viewerRoleId: viewerId, targetRoleId: targetId, canView: next }],
        }),
      });
    } catch {
      setVisibility((prev) => ({ ...prev, [viewerId]: { ...prev[viewerId], [targetId]: !next } }));
      setError("Couldn't save that change - try again.");
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading...</p>;

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <aside className="flex w-full flex-shrink-0 flex-col gap-3 lg:w-64">
        <div className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          {roles.length === 0 && <p className="px-2 py-1 text-sm text-gray-400">No roles yet.</p>}
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => setSelectedRoleId(role.id)}
              className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                role.id === selectedRoleId ? "bg-primary-50 text-primary-700" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {role.name}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-2 rounded-xl border border-primary-100 bg-linear-to-br from-primary-50 to-white p-3"
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
            className="rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-[radial-gradient(circle_at_center,var(--color-primary-500)_0%,var(--color-primary-700)_100%)] hover:shadow-md disabled:opacity-50"
          >
            {creating ? "Adding..." : "+ Add role"}
          </button>
          {createError && <p className="text-sm text-red-600">{createError}</p>}
        </form>
      </aside>

      <div className="min-w-0 flex-1">
        {selectedRole ? (
          <RoleDetailPanel
            role={selectedRole}
            roles={roles}
            grants={grants[selectedRole.id] ?? ({} as Record<PermissionKey, boolean>)}
            visibility={visibility[selectedRole.id] ?? {}}
            onSaveField={(patch) => handleSaveField(selectedRole.id, patch)}
            onDelete={() => handleDelete(selectedRole.id)}
            onToggleGrant={(key) => handleToggleGrant(selectedRole.id, key)}
            onToggleVisibility={(targetId) => handleToggleVisibility(selectedRole.id, targetId)}
          />
        ) : (
          <p className="text-sm text-gray-500">Add a role on the left to configure what it can do.</p>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
