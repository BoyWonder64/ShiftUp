"use client";

import { useEffect, useState } from "react";

interface TimeOffRow {
  id: string;
  startTime: string;
  endTime: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "DENIED";
  staffProfile: { id: string; displayName: string };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function toInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TimeOffManager() {
  const [rows, setRows] = useState<TimeOffRow[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [startTime, setStartTime] = useState(toInputValue(new Date()));
  const [endTime, setEndTime] = useState(toInputValue(new Date(Date.now() + 86_400_000)));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    try {
      const [timeOffData, permData] = await Promise.all([
        fetchJson<{ timeOff: TimeOffRow[] }>("/api/time-off"),
        fetchJson<{ permissions: Record<string, boolean> }>("/api/me/permissions"),
      ]);
      setRows(timeOffData.timeOff);
      setCanApprove(permData.permissions.APPROVE_TIME_OFF ?? false);
    } catch {
      setLoadError("Couldn't load time-off requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await fetchJson("/api/time-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          reason: reason.trim() || null,
        }),
      });
      setReason("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't submit request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function review(id: string, status: "APPROVED" | "DENIED") {
    await fetchJson(`/api/time-off/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-xl border border-primary-100 bg-linear-to-br from-primary-50 to-white p-5 shadow-sm sm:flex-row sm:flex-wrap sm:items-end"
      >
        <label className="flex flex-col gap-1 text-sm">
          Start
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          End
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Reason (optional)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-linear-to-r from-primary-500 to-primary-550 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50"
        >
          {submitting ? "Requesting..." : "Request time off"}
        </button>
      </form>
      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Staff</th>
              <th className="px-4 py-2 font-medium">Start</th>
              <th className="px-4 py-2 font-medium">End</th>
              <th className="px-4 py-2 font-medium">Reason</th>
              <th className="px-4 py-2 font-medium">Status</th>
              {canApprove && <th className="px-4 py-2 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-3 text-gray-400" colSpan={6}>
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-gray-400" colSpan={6}>
                  No time-off requests yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2">{row.staffProfile.displayName}</td>
                  <td className="px-4 py-2 text-gray-600">{new Date(row.startTime).toLocaleString()}</td>
                  <td className="px-4 py-2 text-gray-600">{new Date(row.endTime).toLocaleString()}</td>
                  <td className="px-4 py-2 text-gray-600">{row.reason ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        row.status === "APPROVED"
                          ? "bg-green-100 text-green-700"
                          : row.status === "DENIED"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  {canApprove && (
                    <td className="px-4 py-2">
                      {row.status === "PENDING" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => review(row.id, "APPROVED")}
                            className="rounded-md border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => review(row.id, "DENIED")}
                            className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                          >
                            Deny
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
    </div>
  );
}
