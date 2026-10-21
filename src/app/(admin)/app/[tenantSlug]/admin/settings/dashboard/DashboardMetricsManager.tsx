"use client";

import { useEffect, useState } from "react";

type MetricType = "STAFF_COUNT" | "APPOINTMENT_COUNT";
type EntryKindFilter = "SHIFT" | "APPOINTMENT" | "CUSTOM" | null;
type DateRange = "ALL_TIME" | "UPCOMING" | "PAST" | "TODAY" | "THIS_WEEK" | "THIS_MONTH";
type StatusFilter = "ANY" | "EXCLUDE_CANCELLED" | "PENDING_PAYMENT" | "BOOKED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

interface DashboardMetricRow {
  id: string;
  label: string;
  metricType: MetricType;
  entryKindFilter: EntryKindFilter;
  dateRange: DateRange;
  statusFilter: StatusFilter;
}

const METRIC_TYPE_LABELS: Record<MetricType, string> = {
  STAFF_COUNT: "Staff count",
  APPOINTMENT_COUNT: "Appointment count",
};
const ENTRY_KIND_LABELS: Record<NonNullable<EntryKindFilter> | "ALL", string> = {
  ALL: "All kinds",
  APPOINTMENT: "Appointments",
  SHIFT: "Shifts",
  CUSTOM: "Custom entries",
};
const DATE_RANGE_LABELS: Record<DateRange, string> = {
  ALL_TIME: "All time",
  UPCOMING: "Upcoming",
  PAST: "Past",
  TODAY: "Today",
  THIS_WEEK: "This week",
  THIS_MONTH: "This month",
};
const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  ANY: "Any status",
  EXCLUDE_CANCELLED: "Not cancelled",
  PENDING_PAYMENT: "Pending payment",
  BOOKED: "Booked",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

const DEFAULT_NEW: Pick<DashboardMetricRow, "metricType" | "entryKindFilter" | "dateRange" | "statusFilter"> = {
  metricType: "APPOINTMENT_COUNT",
  entryKindFilter: null,
  dateRange: "UPCOMING",
  statusFilter: "EXCLUDE_CANCELLED",
};

/**
 * Settings > Dashboard > "Dashboard metrics" - fully replaces the old
 * hardcoded Staff/Upcoming-appointments tiles with a tenant-built list: name
 * each tile, pick what it counts (staff headcount, or an appointment count
 * narrowed by kind/date range/status), delete, or add as many more as
 * wanted. See src/modules/dashboard/service.ts for how a row here becomes
 * an actual number on the dashboard.
 */
export function DashboardMetricsManager() {
  const [metrics, setMetrics] = useState<DashboardMetricRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState("");
  const [newFields, setNewFields] = useState(DEFAULT_NEW);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [savingField, setSavingField] = useState<string | null>(null); // `${id}:${field}`
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/dashboard-metrics");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setMetrics(data.dashboardMetrics);
      setLabelDrafts(Object.fromEntries(data.dashboardMetrics.map((m: DashboardMetricRow) => [m.id, m.label])));
    } catch {
      setListError("Couldn't load dashboard metrics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function createMetric(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/dashboard-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), ...newFields }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error ?? "Couldn't create metric.");
        return;
      }
      setNewLabel("");
      setNewFields(DEFAULT_NEW);
      // Append locally from the POST response rather than re-fetching the
      // whole list - a full reload here could race an in-flight autosave on
      // another row's field (saveField below) and clobber it with
      // not-yet-committed server state.
      const created: DashboardMetricRow = data.dashboardMetric;
      setMetrics((prev) => [...(prev ?? []), created]);
      setLabelDrafts((prev) => ({ ...prev, [created.id]: created.label }));
    } finally {
      setCreating(false);
    }
  }

  async function saveField(id: string, field: string, value: unknown) {
    setSavingField(`${id}:${field}`);
    setFieldError(null);
    try {
      const res = await fetch(`/api/dashboard-metrics/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setMetrics((prev) => prev?.map((m) => (m.id === id ? { ...m, [field]: value } : m)) ?? prev);
    } catch {
      setFieldError("Couldn't save - try again.");
      await load(); // revert to server truth
    } finally {
      setSavingField(null);
    }
  }

  function saveLabelIfChanged(metric: DashboardMetricRow) {
    const draft = (labelDrafts[metric.id] ?? "").trim();
    if (!draft || draft === metric.label) {
      setLabelDrafts((prev) => ({ ...prev, [metric.id]: metric.label }));
      return;
    }
    void saveField(metric.id, "label", draft);
  }

  async function deleteMetric(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/dashboard-metrics/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete");
      }
      await load();
    } catch {
      setFieldError("Couldn't delete - try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Dashboard metrics</h2>
      <p className="mt-1 text-sm text-gray-500">
        These are the stat tiles everyone sees at the top of the dashboard. Name them whatever makes sense for
        your business, and add as many counting metrics as you want.
      </p>

      <form onSubmit={createMetric} className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Tile name
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Bookings this week"
              className="w-56 rounded-md border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Counts
            <select
              value={newFields.metricType}
              onChange={(e) => setNewFields((f) => ({ ...f, metricType: e.target.value as MetricType }))}
              className="rounded-md border border-gray-300 px-2 py-1"
            >
              {Object.entries(METRIC_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {newFields.metricType === "APPOINTMENT_COUNT" && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              Kind
              <select
                value={newFields.entryKindFilter ?? "ALL"}
                onChange={(e) =>
                  setNewFields((f) => ({
                    ...f,
                    entryKindFilter: e.target.value === "ALL" ? null : (e.target.value as NonNullable<EntryKindFilter>),
                  }))
                }
                className="rounded-md border border-gray-300 px-2 py-1"
              >
                {Object.entries(ENTRY_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Date range
              <select
                value={newFields.dateRange}
                onChange={(e) => setNewFields((f) => ({ ...f, dateRange: e.target.value as DateRange }))}
                className="rounded-md border border-gray-300 px-2 py-1"
              >
                {Object.entries(DATE_RANGE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Status
              <select
                value={newFields.statusFilter}
                onChange={(e) => setNewFields((f) => ({ ...f, statusFilter: e.target.value as StatusFilter }))}
                className="rounded-md border border-gray-300 px-2 py-1"
              >
                {Object.entries(STATUS_FILTER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <button
          type="submit"
          disabled={creating || !newLabel.trim()}
          className="self-start rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {creating ? "Adding..." : "+ Add metric"}
        </button>
        {createError && <p className="text-sm text-red-600">{createError}</p>}
      </form>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : listError ? (
        <p className="mt-4 text-sm text-red-600">{listError}</p>
      ) : metrics && metrics.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No dashboard metrics yet - add one above.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {metrics?.map((m) => (
            <div key={m.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  value={labelDrafts[m.id] ?? m.label}
                  onChange={(e) => setLabelDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  onBlur={() => saveLabelIfChanged(m)}
                  disabled={savingField === `${m.id}:label`}
                  className="rounded-md border border-gray-300 px-2 py-1 text-sm font-medium"
                />
                <button
                  type="button"
                  onClick={() => void deleteMetric(m.id)}
                  disabled={deletingId === m.id}
                  className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                >
                  {deletingId === m.id ? "Deleting..." : "Delete"}
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <select
                  value={m.metricType}
                  onChange={(e) => void saveField(m.id, "metricType", e.target.value)}
                  disabled={savingField === `${m.id}:metricType`}
                  className="rounded-md border border-gray-300 px-2 py-1"
                >
                  {Object.entries(METRIC_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>

                {m.metricType === "APPOINTMENT_COUNT" && (
                  <>
                    <select
                      value={m.entryKindFilter ?? "ALL"}
                      onChange={(e) =>
                        void saveField(m.id, "entryKindFilter", e.target.value === "ALL" ? null : e.target.value)
                      }
                      disabled={savingField === `${m.id}:entryKindFilter`}
                      className="rounded-md border border-gray-300 px-2 py-1"
                    >
                      {Object.entries(ENTRY_KIND_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={m.dateRange}
                      onChange={(e) => void saveField(m.id, "dateRange", e.target.value)}
                      disabled={savingField === `${m.id}:dateRange`}
                      className="rounded-md border border-gray-300 px-2 py-1"
                    >
                      {Object.entries(DATE_RANGE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={m.statusFilter}
                      onChange={(e) => void saveField(m.id, "statusFilter", e.target.value)}
                      disabled={savingField === `${m.id}:statusFilter`}
                      className="rounded-md border border-gray-300 px-2 py-1"
                    >
                      {Object.entries(STATUS_FILTER_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {fieldError && <p className="mt-2 text-sm text-red-600">{fieldError}</p>}
    </section>
  );
}
