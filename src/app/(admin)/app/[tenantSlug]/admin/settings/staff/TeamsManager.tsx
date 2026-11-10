"use client";

import { useEffect, useState } from "react";

interface TeamMemberRow {
  staffProfileId: string;
  displayName: string;
}

interface TeamRow {
  id: string;
  name: string;
  description: string | null;
  members: TeamMemberRow[];
}

interface StaffOption {
  id: string;
  displayName: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

// Admin-only to use, per the original ask - this isn't gated behind the
// permission matrix the way Staff/Services are, same as Roles/Permissions.
// Rendered only for ADMIN viewers (see staff/page.tsx) since this moved
// in under the Staff section, which itself gates on VIEW_STAFF - a
// permission some non-admin roles can hold, broader than this ever was.
export function TeamsManager() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [addingStaffId, setAddingStaffId] = useState<Record<string, string>>({});
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [memberActionTeamId, setMemberActionTeamId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function loadTeams() {
    try {
      const data = await fetchJson<{ teams: TeamRow[] }>("/api/teams");
      setTeams(data.teams);
    } catch {
      setLoadError("Couldn't load teams.");
    } finally {
      setLoading(false);
    }
  }

  async function loadStaff() {
    try {
      const data = await fetchJson<{ staff: { id: string; displayName: string }[] }>("/api/staff");
      setStaff(data.staff);
    } catch {
      // Not fatal - the "add member" dropdown just stays empty until retried.
    }
  }

  useEffect(() => {
    (async () => {
      await Promise.all([loadTeams(), loadStaff()]);
    })();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await fetchJson("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null }),
      });
      setName("");
      setDescription("");
      await loadTeams();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't create team.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(team: TeamRow) {
    if (!window.confirm(`Delete "${team.name}"? This can't be undone.`)) return;
    setDeleteError(null);
    setDeletingId(team.id);
    try {
      await fetchJson(`/api/teams/${team.id}`, { method: "DELETE" });
      await loadTeams();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete team.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAddMember(team: TeamRow) {
    const staffProfileId = addingStaffId[team.id];
    if (!staffProfileId) {
      setMemberActionError("Pick a staff member to add first.");
      return;
    }
    setMemberActionError(null);
    setMemberActionTeamId(team.id);
    try {
      await fetchJson(`/api/teams/${team.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffProfileId }),
      });
      setAddingStaffId((prev) => ({ ...prev, [team.id]: "" }));
      await loadTeams();
    } catch (err) {
      setMemberActionError(err instanceof Error ? err.message : "Couldn't add that staff member.");
    } finally {
      setMemberActionTeamId(null);
    }
  }

  async function handleRemoveMember(team: TeamRow, staffProfileId: string) {
    setMemberActionError(null);
    setMemberActionTeamId(team.id);
    try {
      await fetchJson(`/api/teams/${team.id}/members/${staffProfileId}`, { method: "DELETE" });
      await loadTeams();
    } catch (err) {
      setMemberActionError(err instanceof Error ? err.message : "Couldn't remove that staff member.");
    } finally {
      setMemberActionTeamId(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-medium">Teams</h2>
        <p className="text-sm text-gray-500">
          Group staff into teams (e.g. &quot;Morning crew&quot;, &quot;Plumbing team&quot;) - used to filter the calendar
          and roster. Only admins can create teams or change membership.
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-xl border border-primary-100 bg-linear-to-br from-primary-50 to-white p-5 shadow-sm sm:flex-row sm:flex-wrap sm:items-end"
      >
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Description (optional)
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-[radial-gradient(circle_at_center,var(--color-primary-500)_0%,var(--color-primary-700)_100%)] hover:shadow-md disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create team"}
        </button>
      </form>
      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="flex flex-col gap-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : teams.length === 0 ? (
          <p className="text-sm text-gray-400">No teams yet.</p>
        ) : (
          teams.map((team) => {
            const memberIds = new Set(team.members.map((m) => m.staffProfileId));
            const availableStaff = staff.filter((s) => !memberIds.has(s.id));
            return (
              <div key={team.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-medium text-gray-900">{team.name}</h3>
                    {team.description && <p className="text-sm text-gray-500">{team.description}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(team)}
                    disabled={deletingId === team.id}
                    className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    {deletingId === team.id ? "Deleting..." : "Delete team"}
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {team.members.length === 0 ? (
                    <span className="text-sm text-gray-400">No members yet.</span>
                  ) : (
                    team.members.map((m) => (
                      <span
                        key={m.staffProfileId}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
                      >
                        {m.displayName}
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(team, m.staffProfileId)}
                          disabled={memberActionTeamId === team.id}
                          className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                          aria-label={`Remove ${m.displayName} from ${team.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {availableStaff.length > 0 && (
                  <div className="mt-3 flex items-end gap-2">
                    <select
                      value={addingStaffId[team.id] ?? ""}
                      onChange={(e) => setAddingStaffId((prev) => ({ ...prev, [team.id]: e.target.value }))}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value="">Add a staff member...</option>
                      {availableStaff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleAddMember(team)}
                      disabled={memberActionTeamId === team.id || !addingStaffId[team.id]}
                      className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {memberActionTeamId === team.id ? "Adding..." : "Add"}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {memberActionError && <p className="text-sm text-red-600">{memberActionError}</p>}
      {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
    </section>
  );
}
