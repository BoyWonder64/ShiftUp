"use client";

import { useState } from "react";
import { PERMISSION_LABELS, type PermissionKey } from "@/lib/permissions/catalog";
import {
  PERMISSION_CATEGORIES,
  permissionCategoryKeys,
  permissionGroupKeys,
  type PermissionGroup,
  type RoleRow,
} from "./RolesAndPermissionsEditor";

interface Props {
  role: RoleRow;
  roles: RoleRow[];
  grants: Record<PermissionKey, boolean>;
  visibility: Record<string, boolean>;
  onSaveField: (patch: Partial<Pick<RoleRow, "name" | "description" | "reportsToId" | "level">>) => Promise<void>;
  onDelete: () => Promise<void>;
  onToggleGrant: (key: PermissionKey) => void;
  onBulkToggleGrant: (keys: PermissionKey[], granted: boolean) => void;
  onToggleVisibility: (targetId: string) => void;
}

// A resource row's column keys, in fixed display order - undefined entries
// (e.g. most resources have no "Apply") render as an empty cell.
const RESOURCE_COLUMNS = ["view", "create", "edit", "delete", "apply"] as const;
const RESOURCE_COLUMN_LABELS: Record<(typeof RESOURCE_COLUMNS)[number], string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  apply: "Apply",
};

function GroupActions({
  group,
  grants,
  onBulkToggleGrant,
}: {
  group: PermissionGroup;
  grants: Record<PermissionKey, boolean>;
  onBulkToggleGrant: (keys: PermissionKey[], granted: boolean) => void;
}) {
  const keys = permissionGroupKeys(group);
  if (keys.length < 2) return null;
  const allGranted = keys.every((k) => grants[k]);
  const noneGranted = keys.every((k) => !grants[k]);
  return (
    <span className="flex shrink-0 items-center gap-2 text-xs font-normal tracking-normal normal-case">
      <button
        type="button"
        onClick={() => onBulkToggleGrant(keys, true)}
        disabled={allGranted}
        className="text-primary-600 hover:underline disabled:text-gray-300 disabled:no-underline"
      >
        All
      </button>
      <span className="text-gray-300">/</span>
      <button
        type="button"
        onClick={() => onBulkToggleGrant(keys, false)}
        disabled={noneGranted}
        className="text-primary-600 hover:underline disabled:text-gray-300 disabled:no-underline"
      >
        None
      </button>
    </span>
  );
}

export function RoleDetailPanel({
  role,
  roles,
  grants,
  visibility,
  onSaveField,
  onDelete,
  onToggleGrant,
  onBulkToggleGrant,
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
          <label className="flex flex-col gap-1 text-sm">
            Rank
            <input
              key={`${role.id}-level`}
              type="number"
              min={0}
              max={1000}
              defaultValue={role.level}
              onBlur={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value) && value !== role.level) void onSaveField({ level: value });
              }}
              className="w-24 rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Higher rank outranks lower. {role.name} can only reassign staff currently in a lower-ranked role, and only
          into another role ranked below it.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-medium">What {role.name} can do</h2>
        <p className="mb-4 text-sm text-gray-500">Changes save immediately.</p>
        <div className="flex flex-col gap-3">
          {PERMISSION_CATEGORIES.map((category) => {
            const categoryKeys = permissionCategoryKeys(category);
            const categoryGranted = categoryKeys.filter((k) => grants[k]).length;
            return (
              <details key={category.id} open className="group rounded-lg border border-gray-100">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-50">
                  <span className="flex items-baseline gap-2">
                    <svg
                      viewBox="0 0 20 20"
                      className="h-3.5 w-3.5 shrink-0 self-center fill-gray-400 transition-transform group-open:rotate-90"
                    >
                      <path d="M7 4l6 6-6 6V4z" />
                    </svg>
                    <span className="font-medium text-gray-800">{category.label}</span>
                    <span className="text-sm text-gray-400">{category.description}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                      categoryGranted === 0
                        ? "bg-gray-100 text-gray-400"
                        : categoryGranted === categoryKeys.length
                          ? "bg-primary-100 text-primary-700"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {categoryGranted}/{categoryKeys.length}
                  </span>
                </summary>

                <div className="flex flex-col gap-4 border-t border-gray-100 px-3 pb-4 pt-3">
                  {category.groups.map((group) => (
                    <div key={group.label}>
                      <h3 className="flex items-baseline justify-between gap-3">
                        <span className="text-xs font-semibold tracking-wide text-gray-600 uppercase">
                          {group.label}
                          {group.note && (
                            <span className="ml-2 font-normal tracking-normal normal-case text-gray-400">
                              — {group.note}
                            </span>
                          )}
                        </span>
                        <GroupActions group={group} grants={grants} onBulkToggleGrant={onBulkToggleGrant} />
                      </h3>

                      {"matrix" in group && (
                        <table className="mt-2 w-full max-w-md text-sm">
                          <thead>
                            <tr className="text-xs text-gray-400">
                              <th className="text-left font-normal" />
                              <th className="w-20 text-center font-normal">Shifts</th>
                              <th className="w-28 text-center font-normal">Appointments</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.matrix.map((row) => (
                              <tr key={row.label}>
                                <td className="py-1 text-gray-700">{row.label}</td>
                                <td className="text-center">
                                  <input
                                    type="checkbox"
                                    checked={grants[row.shiftKey] ?? false}
                                    onChange={() => onToggleGrant(row.shiftKey)}
                                    className="h-4 w-4 accent-primary-500"
                                  />
                                </td>
                                <td className="text-center">
                                  <input
                                    type="checkbox"
                                    checked={grants[row.appointmentKey] ?? false}
                                    onChange={() => onToggleGrant(row.appointmentKey)}
                                    className="h-4 w-4 accent-primary-500"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {"resourceMatrix" in group && (
                        <table className="mt-2 w-full max-w-lg text-sm">
                          <thead>
                            <tr className="text-xs text-gray-400">
                              <th className="text-left font-normal" />
                              {RESOURCE_COLUMNS.filter((col) => group.resourceMatrix.some((row) => row[col])).map(
                                (col) => (
                                  <th key={col} className="w-16 text-center font-normal">
                                    {RESOURCE_COLUMN_LABELS[col]}
                                  </th>
                                )
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {group.resourceMatrix.map((row) => (
                              <tr key={row.label}>
                                <td className="py-1 text-gray-700">{row.label}</td>
                                {RESOURCE_COLUMNS.filter((col) => group.resourceMatrix.some((r) => r[col])).map(
                                  (col) => {
                                    const key = row[col];
                                    return (
                                      <td key={col} className="text-center">
                                        {key ? (
                                          <input
                                            type="checkbox"
                                            checked={grants[key] ?? false}
                                            onChange={() => onToggleGrant(key)}
                                            className="h-4 w-4 accent-primary-500"
                                          />
                                        ) : (
                                          <span className="text-gray-300">–</span>
                                        )}
                                      </td>
                                    );
                                  }
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {"keys" in group && group.keys && group.keys.length > 0 && (
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
                      )}
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
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
