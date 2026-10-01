"use client";

import { useEffect, useState } from "react";
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
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-lg font-medium">What each role can do</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-gray-200 p-2 text-left font-medium text-gray-500">
                  Permission
                </th>
                {CONFIGURABLE_ROLES.map((role) => (
                  <th
                    key={role}
                    className="border-b border-gray-200 p-2 text-center font-medium text-gray-500"
                  >
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_KEYS.map((key) => (
                <tr key={key}>
                  <td className="border-b border-gray-100 p-2">{PERMISSION_LABELS[key]}</td>
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
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Who can see whom</h2>
        <p className="mb-2 text-sm text-gray-600">
          Rows are the viewer, columns are who they can see (e.g. can a supervisor see an employee&apos;s schedule).
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-gray-200 p-2 text-left font-medium text-gray-500">
                  Viewer \ Target
                </th>
                {CONFIGURABLE_ROLES.map((role) => (
                  <th
                    key={role}
                    className="border-b border-gray-200 p-2 text-center font-medium text-gray-500"
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
                  {CONFIGURABLE_ROLES.map((target) => (
                    <td key={target} className="border-b border-gray-100 p-2 text-center">
                      <input
                        type="checkbox"
                        checked={viewer === target ? true : visibility[viewer][target]}
                        disabled={viewer === target}
                        onChange={() => toggleVisibility(viewer, target)}
                        className="h-4 w-4 accent-primary-500 disabled:opacity-40"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
