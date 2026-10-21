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
 * change to what's actually enforced. "Scheduling" renders as a matrix
 * (one row per action, one column per Shifts/Appointments) rather than a
 * flat checkbox list, since every action here (ISSUES.md #6) is genuinely
 * two independent keys that look identical if just dropped into a flat
 * list side by side - the matrix makes which toggle governs which event
 * type legible at a glance. VIEW_CALENDAR_TOGGLE doesn't split, so it stays
 * a flat row underneath the matrix.
 *
 * "resourceMatrix" groups are the same idea applied to plain CRUD
 * resources (Staff/Clients/Services/Schedule templates): one row per
 * resource, one column per action, instead of four separate flat
 * checkbox grids that each repeat "View X / Add X / Edit X / Remove X" in
 * words. A resource with no key for a given column (e.g. templates is the
 * only row with "Apply") just leaves that cell blank.
 *
 * Groups are further bucketed into top-level categories purely for
 * display (collapsible sections with a granted-count badge) - categories
 * carry no semantics of their own, just groups.
 */
export interface PermissionMatrixRow {
  label: string;
  shiftKey: PermissionKey;
  appointmentKey: PermissionKey;
}

export interface ResourceMatrixRow {
  label: string;
  view: PermissionKey;
  create?: PermissionKey;
  edit?: PermissionKey;
  delete?: PermissionKey;
  apply?: PermissionKey;
}

export type PermissionGroup =
  | { label: string; note?: string; keys: PermissionKey[] }
  | { label: string; note?: string; matrix: PermissionMatrixRow[]; keys?: PermissionKey[] }
  | { label: string; note?: string; resourceMatrix: ResourceMatrixRow[] };

export interface PermissionCategory {
  id: string;
  label: string;
  description: string;
  groups: PermissionGroup[];
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: "scheduling",
    label: "Scheduling",
    description: "Shifts, appointments, schedule templates, and time off.",
    groups: [
      {
        label: "Shifts & appointments",
        note: "Each row is two independent toggles - granting one doesn't grant the other.",
        matrix: [
          { label: "View", shiftKey: "VIEW_SHIFTS", appointmentKey: "VIEW_APPOINTMENTS" },
          { label: "Create", shiftKey: "CREATE_SHIFTS", appointmentKey: "CREATE_APPOINTMENTS" },
          { label: "Edit", shiftKey: "EDIT_SHIFTS", appointmentKey: "EDIT_APPOINTMENTS" },
          { label: "Cancel", shiftKey: "CANCEL_SHIFTS", appointmentKey: "CANCEL_APPOINTMENTS" },
          {
            label: "See all (outside your own)",
            shiftKey: "VIEW_ALL_SHIFTS",
            appointmentKey: "VIEW_ALL_APPOINTMENTS",
          },
        ],
        keys: ["VIEW_CALENDAR_TOGGLE"],
      },
      {
        label: "Schedule templates",
        note: "Applying a template creates real shifts, so it's a separate permission from editing a template's definition - a role can be allowed to apply existing templates without being able to redefine them.",
        resourceMatrix: [
          {
            label: "Templates",
            view: "VIEW_SCHEDULE_TEMPLATES",
            create: "CREATE_SCHEDULE_TEMPLATES",
            edit: "EDIT_SCHEDULE_TEMPLATES",
            delete: "DELETE_SCHEDULE_TEMPLATES",
            apply: "APPLY_SCHEDULE_TEMPLATES",
          },
        ],
      },
      { label: "Time off", keys: ["VIEW_TIME_OFF", "APPROVE_TIME_OFF"] },
    ],
  },
  {
    id: "records",
    label: "People & records",
    description: "Staff, clients, service types, the roster, and job estimates.",
    groups: [
      {
        label: "Staff, clients & services",
        resourceMatrix: [
          { label: "Staff", view: "VIEW_STAFF", create: "CREATE_STAFF", edit: "EDIT_STAFF", delete: "DELETE_STAFF" },
          {
            label: "Clients",
            view: "VIEW_CLIENTS",
            create: "CREATE_CLIENTS",
            edit: "EDIT_CLIENTS",
            delete: "DELETE_CLIENTS",
          },
          {
            label: "Service types",
            view: "VIEW_SERVICES",
            create: "CREATE_SERVICES",
            edit: "EDIT_SERVICES",
            delete: "DELETE_SERVICES",
          },
        ],
      },
      { label: "Roster & reports", keys: ["VIEW_ROSTER", "VIEW_SHIFT_REPORTS"] },
      { label: "Job estimates", keys: ["VIEW_JOB_ESTIMATES", "EDIT_JOB_ESTIMATES"] },
    ],
  },
];

export function permissionGroupKeys(group: PermissionGroup): PermissionKey[] {
  const keys: PermissionKey[] = [];
  if ("matrix" in group) {
    for (const row of group.matrix) keys.push(row.shiftKey, row.appointmentKey);
  }
  if ("resourceMatrix" in group) {
    for (const row of group.resourceMatrix) {
      for (const key of [row.view, row.create, row.edit, row.delete, row.apply]) {
        if (key) keys.push(key);
      }
    }
  }
  if ("keys" in group && group.keys) keys.push(...group.keys);
  return keys;
}

export function permissionCategoryKeys(category: PermissionCategory): PermissionKey[] {
  return category.groups.flatMap(permissionGroupKeys);
}

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

  // Backs each group's "All"/"None" shortcut - sends every changed key as
  // one PUT (the API already accepts an array of permissionUpdates) rather
  // than one request per checkbox.
  async function handleBulkToggleGrant(roleId: string, keys: PermissionKey[], granted: boolean) {
    const current = grants[roleId] ?? ({} as Record<PermissionKey, boolean>);
    const changingKeys = keys.filter((k) => Boolean(current[k]) !== granted);
    if (changingKeys.length === 0) return;
    setGrants((prev) => ({
      ...prev,
      [roleId]: { ...prev[roleId], ...Object.fromEntries(changingKeys.map((k) => [k, granted])) },
    }));
    try {
      await fetchJson("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissionUpdates: changingKeys.map((key) => ({ roleId, permissionKey: key, granted })),
        }),
      });
    } catch {
      setGrants((prev) => ({
        ...prev,
        [roleId]: { ...prev[roleId], ...Object.fromEntries(changingKeys.map((k) => [k, !granted])) },
      }));
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
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                role.id === selectedRoleId ? "bg-primary-50 text-primary-700" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="truncate">{role.name}</span>
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
            onBulkToggleGrant={(keys, granted) => handleBulkToggleGrant(selectedRole.id, keys, granted)}
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
