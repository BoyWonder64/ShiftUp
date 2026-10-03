"use client";

import { useEffect, useState } from "react";

interface StaffRow {
  id: string;
  displayName: string;
  user: {
    email: string;
    username: string | null;
    role: string;
    customRole: { id: string; name: string } | null;
  };
}

interface RoleOption {
  id: string;
  name: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function StaffManager() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [roleUpdateError, setRoleUpdateError] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [adminActionId, setAdminActionId] = useState<string | null>(null);
  const [adminActionError, setAdminActionError] = useState<string | null>(null);
  const [demotingRoleId, setDemotingRoleId] = useState<Record<string, string>>({});

  async function loadStaff() {
    try {
      const data = await fetchJson<{ staff: StaffRow[] }>("/api/staff");
      setStaff(data.staff);
    } catch {
      setLoadError("Couldn't load staff.");
    } finally {
      setLoading(false);
    }
  }

  async function loadRoles() {
    try {
      const data = await fetchJson<{ roles: RoleOption[] }>("/api/roles");
      setRoles(data.roles);
      setRoleId((prev) => prev || data.roles[0]?.id || "");
    } catch {
      // Not fatal on its own - the role dropdown just stays empty until retried.
    }
  }

  async function loadMyRole() {
    try {
      const data = await fetchJson<{ role: string }>("/api/me/permissions");
      setMyRole(data.role);
    } catch {
      // Not fatal - worst case the admin-only controls below just stay
      // hidden until retried; the server-side check is the real enforcement.
    }
  }

  useEffect(() => {
    (async () => {
      await Promise.all([loadStaff(), loadRoles(), loadMyRole()]);
    })();
  }, []);

  const isAdmin = myRole === "ADMIN";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!roleId) {
      setFormError("Pick a role.");
      return;
    }
    setSubmitting(true);
    try {
      await fetchJson("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, username, password, roleId }),
      });
      setDisplayName("");
      setEmail("");
      setUsername("");
      setPassword("");
      await loadStaff();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't add staff.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRoleChange(s: StaffRow, newRoleId: string) {
    setRoleUpdateError(null);
    setRoleUpdatingId(s.id);
    try {
      await fetchJson(`/api/staff/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: newRoleId }),
      });
      await loadStaff();
    } catch (err) {
      setRoleUpdateError(err instanceof Error ? err.message : "Couldn't change role.");
    } finally {
      setRoleUpdatingId(null);
    }
  }

  async function handlePromote(s: StaffRow) {
    if (!window.confirm(`Make ${s.displayName} an admin? They'll be able to do anything in this account, including managing other admins.`)) return;
    setAdminActionError(null);
    setAdminActionId(s.id);
    try {
      await fetchJson(`/api/staff/${s.id}/promote`, { method: "POST" });
      await loadStaff();
    } catch (err) {
      setAdminActionError(err instanceof Error ? err.message : "Couldn't promote to admin.");
    } finally {
      setAdminActionId(null);
    }
  }

  async function handleDemote(s: StaffRow) {
    const landingRoleId = demotingRoleId[s.id];
    if (!landingRoleId) {
      setAdminActionError("Pick a role to demote into first.");
      return;
    }
    setAdminActionError(null);
    setAdminActionId(s.id);
    try {
      await fetchJson(`/api/staff/${s.id}/demote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: landingRoleId }),
      });
      await loadStaff();
    } catch (err) {
      setAdminActionError(err instanceof Error ? err.message : "Couldn't demote admin.");
    } finally {
      setAdminActionId(null);
    }
  }

  async function handleDelete(s: StaffRow) {
    if (!window.confirm(`Remove ${s.displayName} from staff? This can't be undone.`)) return;
    setDeleteError(null);
    setDeletingId(s.id);
    try {
      await fetchJson(`/api/staff/${s.id}`, { method: "DELETE" });
      await loadStaff();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't remove staff.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-medium">Staff</h2>
        <p className="text-sm text-gray-500">
          {isAdmin
            ? "Add team members and set their role. Only admins can add staff, reassign roles, remove staff, or promote/demote admins."
            : "View-only - adding staff, reassigning roles, and removing staff are admin-only. Roles themselves (their names, descriptions, and what they can do) are managed in the Roles and permission sections below."}
        </p>
      </div>

      {isAdmin && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-xl border border-primary-100 bg-linear-to-br from-primary-50 to-white p-5 shadow-sm sm:flex-row sm:flex-wrap sm:items-end"
        >
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={30}
              pattern="[a-z0-9]+([_-][a-z0-9]+)*"
              title="Lowercase letters, numbers, - and _ only"
              className="rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Role
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-[radial-gradient(circle_at_center,var(--color-primary-500)_0%,var(--color-primary-700)_100%)] hover:shadow-md disabled:opacity-50"
          >
            {submitting ? "Adding..." : "Add staff"}
          </button>
        </form>
      )}
      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Username</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-3 text-gray-400" colSpan={5}>
                  Loading...
                </td>
              </tr>
            ) : staff.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-gray-400" colSpan={5}>
                  No staff yet.
                </td>
              </tr>
            ) : (
              staff.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2">{s.displayName}</td>
                  <td className="px-4 py-2 text-gray-600">{s.user.username ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-600">{s.user.email}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {s.user.role === "STAFF" ? (
                      isAdmin ? (
                        <select
                          value={s.user.customRole?.id ?? ""}
                          onChange={(e) => handleRoleChange(s, e.target.value)}
                          disabled={roleUpdatingId === s.id}
                          className="rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>{s.user.customRole?.name ?? "—"}</span>
                      )
                    ) : isAdmin ? (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">ADMIN</span>
                        <select
                          value={demotingRoleId[s.id] ?? ""}
                          onChange={(e) => setDemotingRoleId((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                        >
                          <option value="">Demote to...</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleDemote(s)}
                          disabled={adminActionId === s.id || !demotingRoleId[s.id]}
                          className="text-xs font-medium text-primary-600 hover:underline disabled:text-gray-300"
                        >
                          {adminActionId === s.id ? "Demoting..." : "Confirm"}
                        </button>
                      </div>
                    ) : (
                      s.user.role
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {isAdmin && s.user.role === "STAFF" && (
                        <button
                          type="button"
                          onClick={() => handlePromote(s)}
                          disabled={adminActionId === s.id}
                          className="text-sm font-medium text-primary-600 hover:underline disabled:opacity-50"
                        >
                          {adminActionId === s.id ? "Promoting..." : "Make admin"}
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDelete(s)}
                          disabled={deletingId === s.id}
                          className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          {deletingId === s.id ? "Removing..." : "Remove"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {roleUpdateError && <p className="text-sm text-red-600">{roleUpdateError}</p>}
      {adminActionError && <p className="text-sm text-red-600">{adminActionError}</p>}
      {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
    </section>
  );
}
