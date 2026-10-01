"use client";

import { Fragment, useEffect, useState } from "react";
import {
  CONFIGURABLE_ROLES,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  type ConfigurableRole,
  type PermissionKey,
} from "@/lib/permissions/catalog";

type Grants = Record<ConfigurableRole, Record<PermissionKey, boolean>>;
type Visibility = Record<ConfigurableRole, Record<ConfigurableRole, boolean>>;

const ROLE_LABELS: Record<ConfigurableRole, string> = {
  MANAGER: "Manager",
  SUPERVISOR: "Supervisor",
  EMPLOYEE: "Employee",
  CUSTOMER: "Customer",
};

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
    keys: ["VIEW_APPOINTMENTS", "CREATE_APPOINTMENTS", "EDIT_APPOINTMENTS", "CANCEL_APPOINTMENTS"],
  },
  { label: "Job estimates", keys: ["VIEW_JOB_ESTIMATES", "EDIT_JOB_ESTIMATES"] },
  { label: "Clients", keys: ["VIEW_CLIENTS", "CREATE_CLIENTS", "EDIT_CLIENTS", "DELETE_CLIENTS"] },
  { label: "Staff", keys: ["VIEW_STAFF", "CREATE_STAFF", "EDIT_STAFF", "DELETE_STAFF"] },
  { label: "Services", keys: ["VIEW_SERVICES", "CREATE_SERVICES", "EDIT_SERVICES", "DELETE_SERVICES"] },
  { label: "Time off", keys: ["VIEW_TIME_OFF", "APPROVE_TIME_OFF"] },
];

export function PermissionMatrixEditor() {
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

  function toggleGrant(role: ConfigurableRole, key: PermissionKey) {
    setSaved(false);
    setGrants((prev) =>
      prev ? { ...prev, [role]: { ...prev[role], [key]: !prev[role][key] } } : prev
    );
  }

  function toggleVisibility(viewer: ConfigurableRole, target: ConfigurableRole) {
    setSaved(false);
    setVisibility((prev) =>
      prev ? { ...prev, [viewer]: { ...prev[viewer], [target]: !prev[viewer][target] } } : prev
    );
  }

  async function handleSave() {
    if (!grants || !visibility) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const permissionUpdates = CONFIGURABLE_ROLES.flatMap((role) =>
        PERMISSION_KEYS.map((permissionKey) => ({
          role,
          permissionKey,
          granted: grants[role][permissionKey],
        }))
      );
      const visibilityUpdates = CONFIGURABLE_ROLES.flatMap((viewerRole) =>
        CONFIGURABLE_ROLES.map((targetRole) => ({
          viewerRole,
          targetRole,
          canView: visibility[viewerRole][targetRole],
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
                {CONFIGURABLE_ROLES.map((role) => (
                  <th
                    key={role}
                    className="w-24 border-b-2 border-gray-200 p-2 text-center font-medium text-gray-500"
                  >
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((group) => (
                <Fragment key={group.label}>
                  <tr>
                    <td
                      colSpan={CONFIGURABLE_ROLES.length + 1}
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
                      {CONFIGURABLE_ROLES.map((role) => (
                        <td key={role} className="border-b border-gray-100 p-2 text-center">
                          <input
                            type="checkbox"
                            checked={grants[role][key]}
                            onChange={() => toggleGrant(role, key)}
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
          schedule and data of roles in that column - e.g. checking
          &quot;Employee&quot; in the <span className="font-medium">Supervisor</span>{" "}
          row lets supervisors see employees&apos; schedules.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-32 border-b-2 border-gray-200 p-2 text-left font-medium text-gray-500">
                  This role...
                </th>
                {CONFIGURABLE_ROLES.map((role) => (
                  <th
                    key={role}
                    className="w-24 border-b-2 border-gray-200 p-2 text-center font-medium text-gray-500"
                  >
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CONFIGURABLE_ROLES.map((viewer) => (
                <tr key={viewer}>
                  <td className="border-b border-gray-100 p-2 font-medium">{ROLE_LABELS[viewer]}</td>
                  {CONFIGURABLE_ROLES.map((target) => {
                    const self = viewer === target;
                    return (
                      <td
                        key={target}
                        className={`border-b border-gray-100 p-2 text-center ${self ? "bg-gray-50" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={self ? true : visibility[viewer][target]}
                          disabled={self}
                          onChange={() => toggleVisibility(viewer, target)}
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
          The shaded diagonal (e.g. Manager → Manager) is always checked and
          can&apos;t be turned off - a role always sees its own role.
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
