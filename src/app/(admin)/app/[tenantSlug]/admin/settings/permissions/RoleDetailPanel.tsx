"use client";

import { useState } from "react";
import { PERMISSION_LABELS, type PermissionKey } from "@/lib/permissions/catalog";
import { PERMISSION_GROUPS, type RoleRow } from "./RolesAndPermissionsEditor";

interface Props {
  role: RoleRow;
  roles: RoleRow[];
  grants: Record<PermissionKey, boolean>;
  visibility: Record<string, boolean>;
  onSaveField: (patch: Partial<Pick<RoleRow, "name" | "description" | "reportsToId">>) => Promise<void>;
  onDelete: () => Promise<void>;
  onToggleGrant: (key: PermissionKey) => void;
  onToggleVisibility: (targetId: string) => void;
}

export function RoleDetailPanel({
  role,
  roles,
  grants,
  visibility,
  onSaveField,
  onDelete,
  onToggleGrant,
  onToggleVisibility,
}: Props) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const otherRoles = roles.filter((r) => r.id !== role.id);

  async function handleDeleteClick() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't remove role.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-medium">Role details</h2>
          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={deleting}
            className="shrink-0 rounded-md border border-[#BD3039] px-3 py-1.5 text-sm text-[#BD3039] hover:bg-[#BD3039]/10 disabled:opacity-50"
          >
            {deleting ? "Removing..." : "Remove role"}
          </button>
        </div>
        {deleteError && <p className="mt-2 text-sm text-red-600">{deleteError}</p>}
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Name
            <input
              key={`${role.id}-name`}
              defaultValue={role.name}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value && value !== role.name) void onSaveField({ name: value });
              }}
              className="rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Description
            <input
              key={`${role.id}-description`}
              defaultValue={role.description ?? ""}
              placeholder="What is this role for?"
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value !== (role.description ?? "")) void onSaveField({ description: value || null });
              }}
              className="rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Reports to
            <select
              value={role.reportsToId ?? ""}
              onChange={(e) => void onSaveField({ reportsToId: e.target.value || null })}
              className="rounded-md border border-gray-300 px-2 py-1.5"
            >
              <option value="">None</option>
              {otherRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-medium">What {role.name} can do</h2>
        <p className="mb-3 text-sm text-gray-500">Changes save immediately.</p>
        <div className="flex flex-col gap-4">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label}>
              <h3 className="text-xs font-semibold tracking-wide text-gray-600 uppercase">
                {group.label}
                {group.note && (
                  <span className="ml-2 font-normal tracking-normal normal-case text-gray-400">
                    — {group.note}
                  </span>
                )}
              </h3>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {group.keys.map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={grants[key] ?? false}
                      onChange={() => onToggleGrant(key)}
                      className="h-4 w-4 accent-primary-500"
                    />
                    {PERMISSION_LABELS[key]}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {otherRoles.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-medium">Who {role.name} can see</h2>
          <p className="mb-3 text-sm text-gray-600">
            Check a role to let {role.name} see that role&apos;s schedule and data.
          </p>
          <div className="flex flex-col gap-2">
            {otherRoles.map((target) => (
              <label key={target.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={visibility[target.id] ?? false}
                  onChange={() => onToggleVisibility(target.id)}
                  className="h-4 w-4 accent-primary-500"
                />
                {target.name}
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
