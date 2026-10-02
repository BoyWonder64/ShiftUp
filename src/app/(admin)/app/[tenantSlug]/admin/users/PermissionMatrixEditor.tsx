"use client";

import { Fragment, useEffect, useState } from "react";
import { PERMISSION_KEYS, PERMISSION_LABELS, type PermissionKey } from "@/lib/permissions/catalog";

interface RoleOption {
  id: string;
  name: string;
}

type Grants = Record<string, Record<PermissionKey, boolean>>;
type Visibility = Record<string, Record<string, boolean>>;

/**
 * Groups PERMISSION_KEYS for display only - no new permission keys, no
 * change to what's actually enforced. "Scheduling" deliberately covers both
 * appointments and shifts together (not two separate sections) because
 * they share one set of permission keys in the data model - a shift is just
 * an Appointment row with no client attached, see ARCHITECTURE.md. Splitting
 * that into real independent appointment/shift permissions would need new
 * catalog keys and route/UI changes, which wasn't what was asked for here.
 */
const PERMISSION_GROUPS: Array<{ label: string; note?: string; keys: PermissionKey[] }> = [
  {
    label: "Scheduling (appointments & shifts)",
    note: "Applies to both - appointments and shifts share these permissions, there's no separate shift-only permission yet.",
    keys: [
      "VIEW_APPOINTMENTS",
      "CREATE_APPOINTMENTS",
      "EDIT_APPOINTMENTS",
      "CANCEL_APPOINTMENTS",
      "VIEW_CALENDAR_TOGGLE",
    ],
  },
  { label: "Job estimates", keys: ["VIEW_JOB_ESTIMATES", "EDIT_JOB_ESTIMATES"] },
  { label: "Clients", keys: ["VIEW_CLIENTS", "CREATE_CLIENTS", "EDIT_CLIENTS", "DELETE_CLIENTS"] },
  { label: "Staff", keys: ["VIEW_STAFF", "CREATE_STAFF", "EDIT_STAFF", "DELETE_STAFF"] },
  { label: "Services", keys: ["VIEW_SERVICES", "CREATE_SERVICES", "EDIT_SERVICES", "DELETE_SERVICES"] },
  { label: "Roster", keys: ["VIEW_ROSTER"] },
  { label: "Time off", keys: ["VIEW_TIME_OFF", "APPROVE_TIME_OFF"] },
];

export function PermissionMatrixEditor() {
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [grants, setGrants] = useState<Grants | null>(null);
  const [visibility, setVisibility] = useState<Visibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/permissions");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!cancelled) {
          setRoles(data.permissions.roles);
          setGrants(data.permissions.grants);
          setVisibility(data.visibility.canView);
        }
      } catch {
        if (!cancelled) setError("Couldn't load the current permissions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleGrant(roleId: string, key: PermissionKey) {
    setSaved(false);
    setGrants((prev) =>
      prev ? { ...prev, [roleId]: { ...prev[roleId], [key]: !prev[roleId][key] } } : prev
    );
  }

  function toggleVisibility(viewerId: string, targetId: string) {
    setSaved(false);
    setVisibility((prev) =>
      prev ? { ...prev, [viewerId]: { ...prev[viewerId], [targetId]: !prev[viewerId][targetId] } } : prev
    );
  }

  async function handleSave() {
    if (!grants || !visibility) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const permissionUpdates = roles.flatMap((role) =>
        PERMISSION_KEYS.map((permissionKey) => ({
          roleId: role.id,
          permissionKey,
          granted: grants[role.id][permissionKey],
        }))
      );
      const visibilityUpdates = roles.flatMap((viewer) =>
        roles
          .filter((target) => target.id !== viewer.id)
          .map((target) => ({
            viewerRoleId: viewer.id,
            targetRoleId: target.id,
            canView: visibility[viewer.id][target.id],
          }))
      );

      const res = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionUpdates, visibilityUpdates }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save");
      }
      setSaved(true);
    } catch {
      setError("Couldn't save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-gray-600">Loading...</p>;
  if (!grants || !visibility) {
    return <p className="text-red-600">{error ?? "Couldn't load permissions."}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-medium">What each role can do</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-56 border-b-2 border-gray-200 p-2 text-left font-medium text-gray-500">
                  Permission
                </th>
                {roles.map((role) => (
                  <th
                    key={role.id}
                    className="w-24 border-b-2 border-gray-200 p-2 text-center font-medium text-gray-500"
                  >
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((group) => (
                <Fragment key={group.label}>
                  <tr>
                    <td
                      colSpan={roles.length + 1}
                      className="border-b border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-semibold tracking-wide text-gray-600 uppercase"
                    >
                      {group.label}
                      {group.note && (
                        <span className="ml-2 font-normal tracking-normal normal-case text-gray-400">
                          — {group.note}
                        </span>
                      )}
                    </td>
                  </tr>
                  {group.keys.map((key) => (
                    <tr key={key}>
                      <td className="border-b border-gray-100 p-2 pl-4">{PERMISSION_LABELS[key]}</td>
                      {roles.map((role) => (
                        <td key={role.id} className="border-b border-gray-100 p-2 text-center">
                          <input
                            type="checkbox"
                            checked={grants[role.id][key]}
                            onChange={() => toggleGrant(role.id, key)}
                            className="h-4 w-4 accent-primary-500"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-medium">Who can see whom</h2>
        <p className="mb-3 text-sm text-gray-600">
          Each row is a role. Check a column to let that row&apos;s role see the
          schedule and data of roles in that column - e.g. checking a target
          role in a viewer role&apos;s row lets that viewer see the target&apos;s
          schedules.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-32 border-b-2 border-gray-200 p-2 text-left font-medium text-gray-500">
                  This role...
                </th>
                {roles.map((role) => (
                  <th
                    key={role.id}
                    className="w-24 border-b-2 border-gray-200 p-2 text-center font-medium text-gray-500"
                  >
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((viewer) => (
                <tr key={viewer.id}>
                  <td className="border-b border-gray-100 p-2 font-medium">{viewer.name}</td>
                  {roles.map((target) => {
                    const self = viewer.id === target.id;
                    return (
                      <td
                        key={target.id}
                        className={`border-b border-gray-100 p-2 text-center ${self ? "bg-gray-50" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={self ? true : visibility[viewer.id][target.id]}
                          disabled={self}
                          onChange={() => toggleVisibility(viewer.id, target.id)}
                          className="h-4 w-4 accent-primary-500 disabled:opacity-40"
                          title={self ? "A role always sees its own role" : undefined}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          The shaded diagonal is always checked and can&apos;t be turned off - a
          role always sees its own role.
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-primary-500 px-4 py-2 text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {saved && <span className="text-sm text-green-600">Saved.</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
