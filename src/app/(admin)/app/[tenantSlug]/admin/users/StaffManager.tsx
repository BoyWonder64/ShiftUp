"use client";

import { useEffect, useState } from "react";

interface StaffRow {
  id: string;
  displayName: string;
  user: { email: string; role: string };
}

const ROLE_OPTIONS = ["MANAGER", "SUPERVISOR", "EMPLOYEE"] as const;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function StaffManager() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]>("EMPLOYEE");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  useEffect(() => {
    (async () => {
      await loadStaff();
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await fetchJson("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, password, role }),
      });
      setDisplayName("");
      setEmail("");
      setPassword("");
      setRole("EMPLOYEE");
      await loadStaff();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't add staff.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Staff</h2>
        <p className="text-sm text-gray-500">
          Add team members and set their role. Admin can&apos;t be assigned here -
          only the account creator is admin.
        </p>
      </div>

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
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof ROLE_OPTIONS)[number])}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0) + r.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-linear-to-r from-primary-500 to-primary-550 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50"
        >
          {submitting ? "Adding..." : "Add staff"}
        </button>
      </form>
      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-3 text-gray-400" colSpan={3}>
                  Loading...
                </td>
              </tr>
            ) : staff.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-gray-400" colSpan={3}>
                  No staff yet.
                </td>
              </tr>
            ) : (
              staff.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2">{s.displayName}</td>
                  <td className="px-4 py-2 text-gray-600">{s.user.email}</td>
                  <td className="px-4 py-2 text-gray-600">{s.user.role}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
    </section>
  );
}
