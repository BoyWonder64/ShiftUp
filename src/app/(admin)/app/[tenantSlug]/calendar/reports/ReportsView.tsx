"use client";

import { useEffect, useMemo, useState } from "react";
import { startOfWeek, format } from "date-fns";
import { enUS } from "date-fns/locale";
import type { PermissionKey } from "@/lib/permissions/catalog";
import {
  buildColorTriples,
  resolveEventColors,
  type ColorTriple,
  type EventColorKey,
} from "@/lib/colors/eventColors";
import {
  AppointmentDetailPanel,
  Modal,
  appointmentTitle,
  fetchJson,
  isCustomEntry,
  isShift,
  type ApiAppointment,
  type ClientOption,
  type CustomCalendarOption,
  type ServiceTypeOption,
  type StaffOption,
  type TagOption,
} from "../SchedulingCalendar";

type StatusFilter = "ALL" | "BOOKED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
// Same four-way split as the main calendar's Appointments/Shifts/Custom/Both
// switcher (SchedulingCalendar.tsx) - this dashboard mixed every kind
// together with no way to separate them, raised directly as still-combined.
type KindFilter = "both" | "appointment" | "shift" | "custom";
const KIND_LABELS: Record<KindFilter, string> = {
  both: "Both",
  appointment: "Appointments",
  shift: "Shifts",
  custom: "Custom",
};

const STATUS_LABELS: Record<StatusFilter, string> = {
  ALL: "All statuses",
  BOOKED: "Booked",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

function toInputDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function thisWeekRange(): { start: Date; end: Date } {
  const start = startOfWeek(new Date(), { locale: enUS });
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function Tile({
  label,
  value,
  status,
  activeStatus,
  onSelect,
}: {
  label: string;
  value: string | number;
  status: StatusFilter;
  activeStatus: StatusFilter;
  onSelect: (status: StatusFilter) => void;
}) {
  const active = activeStatus === status;
  return (
    <button
      type="button"
      onClick={() => onSelect(status)}
      className={`flex flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left shadow-sm transition-colors ${
        active ? "border-primary-400 bg-primary-50" : "border-gray-200 bg-white hover:border-primary-200"
      }`}
    >
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className="text-2xl font-semibold text-gray-900">{value}</span>
    </button>
  );
}

interface Settings {
  eventColors: Record<EventColorKey, string>;
  enableMapsNavigation: boolean;
  showPaymentStatus: boolean;
  showJobTypeOnShiftForm: boolean;
  showJobEstimateOnShiftForm: boolean;
  showColorKeyOnShiftForm: boolean;
  allowEditingBookedEvents: boolean;
}

/**
 * ISSUES.md #4 - manager-facing reporting dashboard. Fetches the full
 * (date/staff/service-filtered, but not status-filtered) event set from
 * `/api/reports/shifts` so the summary tiles can show every status's count
 * at once; the status dropdown/tile clicks then narrow the drill-down list
 * client-side rather than refetching, since the counts themselves depend on
 * seeing every status.
 */
export function ReportsView() {
  const [range, setRange] = useState(() => thisWeekRange());
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [kindFilter, setKindFilter] = useState<KindFilter>("both");

  const [events, setEvents] = useState<ApiAppointment[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [appointmentServiceTypes, setAppointmentServiceTypes] = useState<ServiceTypeOption[]>([]);
  const [shiftServiceTypes, setShiftServiceTypes] = useState<ServiceTypeOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean> | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [customCalendars, setCustomCalendars] = useState<CustomCalendarOption[]>([]);
  const [colorTriples, setColorTriples] = useState<Record<EventColorKey, ColorTriple>>(() =>
    buildColorTriples(resolveEventColors(undefined))
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApiAppointment | null>(null);

  // Loaded once - staff/service-type/tag/client lists, permissions, and the
  // tenant's display settings that AppointmentDetailPanel needs to render a
  // clicked row (the dashboard reuses that panel rather than building a
  // second one - see ISSUES.md #4's drill-down decision).
  useEffect(() => {
    (async () => {
      try {
        const [
          staffData,
          apptServiceData,
          shiftServiceData,
          clientsData,
          tagsData,
          permData,
          settingsData,
          customCalendarsData,
        ] = await Promise.all([
          fetchJson<{ staff: StaffOption[] }>("/api/staff"),
          fetchJson<{ serviceTypes: ServiceTypeOption[] }>("/api/appointment-service-types"),
          fetchJson<{ serviceTypes: ServiceTypeOption[] }>("/api/shift-service-types"),
          fetchJson<{ clients: ClientOption[] }>("/api/clients").catch(() => ({ clients: [] })),
          fetchJson<{ tags: TagOption[] }>("/api/event-tags").catch(() => ({ tags: [] })),
          fetchJson<{ permissions: Record<PermissionKey, boolean> }>("/api/me/permissions"),
          fetchJson<{ settings: Settings }>("/api/tenant-settings"),
          fetchJson<{ customCalendars: CustomCalendarOption[] }>("/api/custom-calendars").catch(() => ({
            customCalendars: [],
          })),
        ]);
        setStaff(staffData.staff);
        setAppointmentServiceTypes(apptServiceData.serviceTypes);
        setShiftServiceTypes(shiftServiceData.serviceTypes);
        setClients(clientsData.clients);
        setTags(tagsData.tags);
        setPermissions(permData.permissions);
        setSettings(settingsData.settings);
        setCustomCalendars(customCalendarsData.customCalendars);
        setColorTriples(buildColorTriples(resolveEventColors(settingsData.settings.eventColors)));
      } catch {
        // Not fatal on its own - the main events fetch below still runs; the
        // drill-down panel just won't have every nicety populated.
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          start: range.start.toISOString(),
          end: range.end.toISOString(),
        });
        if (staffFilter !== "all") params.set("staffId", staffFilter);
        if (serviceTypeFilter !== "all") params.set("serviceTypeId", serviceTypeFilter);
        const data = await fetchJson<{ events: ApiAppointment[] }>(`/api/reports/shifts?${params.toString()}`);
        if (!cancelled) setEvents(data.events);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load the report.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, staffFilter, serviceTypeFilter]);

  const filteredEvents = useMemo(() => {
    if (kindFilter === "both") return events;
    if (kindFilter === "shift") return events.filter(isShift);
    if (kindFilter === "custom") return events.filter(isCustomEntry);
    return events.filter((e) => !isShift(e) && !isCustomEntry(e));
  }, [events, kindFilter]);

  const metrics = useMemo(() => {
    const counts = { BOOKED: 0, COMPLETED: 0, CANCELLED: 0, NO_SHOW: 0, PENDING_PAYMENT: 0 };
    let shiftHours = 0;
    for (const e of filteredEvents) {
      counts[e.status as keyof typeof counts] = (counts[e.status as keyof typeof counts] ?? 0) + 1;
      // isShift checks entryKind === "SHIFT" specifically, so custom entries
      // (entryKind === "CUSTOM") are already excluded here - these are
      // shift-completion-rate/hours stats specifically, and a custom entry
      // isn't a shift, so it shouldn't count toward "hours worked" either.
      if (isShift(e) && e.status === "COMPLETED") {
        shiftHours += (new Date(e.endTime).getTime() - new Date(e.startTime).getTime()) / 3_600_000;
      }
    }
    const outcomeTotal = counts.COMPLETED + counts.NO_SHOW;
    const completionRate = outcomeTotal > 0 ? Math.round((counts.COMPLETED / outcomeTotal) * 100) : null;
    return { counts, shiftHours: Math.round(shiftHours * 10) / 10, completionRate };
  }, [filteredEvents]);

  const perStaff = useMemo(() => {
    const map = new Map<
      string,
      { staffName: string; booked: number; completed: number; cancelled: number; noShow: number; hours: number }
    >();
    for (const e of filteredEvents) {
      const entry = map.get(e.staffId) ?? {
        staffName: e.staff.displayName,
        booked: 0,
        completed: 0,
        cancelled: 0,
        noShow: 0,
        hours: 0,
      };
      if (e.status === "BOOKED") entry.booked += 1;
      if (e.status === "COMPLETED") entry.completed += 1;
      if (e.status === "CANCELLED") entry.cancelled += 1;
      if (e.status === "NO_SHOW") entry.noShow += 1;
      if (isShift(e) && e.status === "COMPLETED") {
        entry.hours += (new Date(e.endTime).getTime() - new Date(e.startTime).getTime()) / 3_600_000;
      }
      map.set(e.staffId, entry);
    }
    return Array.from(map.entries())
      .map(([staffId, v]) => ({ staffId, ...v, hours: Math.round(v.hours * 10) / 10 }))
      .sort((a, b) => a.staffName.localeCompare(b.staffName));
  }, [filteredEvents]);

  const drillDown = useMemo(
    () => (statusFilter === "ALL" ? filteredEvents : filteredEvents.filter((e) => e.status === statusFilter)),
    [filteredEvents, statusFilter]
  );

  const serviceTypeOptions = useMemo(
    () => [
      ...appointmentServiceTypes.map((s) => ({ id: s.id, label: s.name })),
      ...shiftServiceTypes.map((s) => ({ id: s.id, label: s.name })),
    ],
    [appointmentServiceTypes, shiftServiceTypes]
  );

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-sm">
          From
          <input
            type="date"
            value={toInputDate(range.start)}
            onChange={(e) => setRange((prev) => ({ ...prev, start: new Date(`${e.target.value}T00:00:00`) }))}
            className="rounded-md border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          To
          <input
            type="date"
            value={toInputDate(new Date(range.end.getTime() - 1))}
            onChange={(e) =>
              setRange((prev) => ({ ...prev, end: new Date(`${e.target.value}T00:00:00`) }))
            }
            className="rounded-md border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Staff
          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1"
          >
            <option value="all">Everyone</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Service
          <select
            value={serviceTypeFilter}
            onChange={(e) => setServiceTypeFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1"
          >
            <option value="all">Any service</option>
            {serviceTypeOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Kind
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as KindFilter)}
            className="rounded-md border border-gray-300 px-2 py-1"
          >
            {(Object.keys(KIND_LABELS) as KindFilter[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-md border border-gray-300 px-2 py-1"
          >
            {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setRange(thisWeekRange())}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          This week
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile
              label="Booked"
              value={metrics.counts.BOOKED}
              status="BOOKED"
              activeStatus={statusFilter}
              onSelect={setStatusFilter}
            />
            <Tile
              label="Completed"
              value={metrics.counts.COMPLETED}
              status="COMPLETED"
              activeStatus={statusFilter}
              onSelect={setStatusFilter}
            />
            <Tile
              label="Cancelled"
              value={metrics.counts.CANCELLED}
              status="CANCELLED"
              activeStatus={statusFilter}
              onSelect={setStatusFilter}
            />
            <Tile
              label="No-shows"
              value={metrics.counts.NO_SHOW}
              status="NO_SHOW"
              activeStatus={statusFilter}
              onSelect={setStatusFilter}
            />
            <div className="flex flex-col items-start gap-1 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <span className="text-xs font-medium text-gray-500">Completion rate</span>
              <span className="text-2xl font-semibold text-gray-900">
                {metrics.completionRate === null ? "—" : `${metrics.completionRate}%`}
              </span>
            </div>
            <div className="flex flex-col items-start gap-1 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <span className="text-xs font-medium text-gray-500">Hours worked (shifts)</span>
              <span className="text-2xl font-semibold text-gray-900">{metrics.shiftHours}</span>
            </div>
          </div>

          {perStaff.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Staff</th>
                    <th className="px-4 py-2">Booked</th>
                    <th className="px-4 py-2">Completed</th>
                    <th className="px-4 py-2">Cancelled</th>
                    <th className="px-4 py-2">No-show</th>
                    <th className="px-4 py-2">Hours worked</th>
                  </tr>
                </thead>
                <tbody>
                  {perStaff.map((row) => (
                    <tr key={row.staffId} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2 font-medium text-gray-900">{row.staffName}</td>
                      <td className="px-4 py-2">{row.booked}</td>
                      <td className="px-4 py-2">{row.completed}</td>
                      <td className="px-4 py-2">{row.cancelled}</td>
                      <td className="px-4 py-2">{row.noShow}</td>
                      <td className="px-4 py-2">{row.hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
              <h2 className="text-sm font-medium text-gray-700">
                {STATUS_LABELS[statusFilter]} ({drillDown.length})
              </h2>
            </div>
            {drillDown.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">Nothing matches the current filters.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {drillDown.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(e)}
                      className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{appointmentTitle(e)}</span>
                        <span className="text-gray-500">{e.staff.displayName}</span>
                      </span>
                      <span className="text-xs text-gray-400">
                        {format(new Date(e.startTime), "MMM d, h:mm a")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {selected && settings && (
        <Modal onClose={() => setSelected(null)}>
          <AppointmentDetailPanel
            appointment={selected}
            permissions={permissions}
            allowEditingBookedEvents={settings.allowEditingBookedEvents}
            canCancel={false}
            canEdit={false}
            canFindCoverage={false}
            readOnly
            enableMapsNavigation={settings.enableMapsNavigation}
            showPaymentStatus={settings.showPaymentStatus}
            showJobType={settings.showJobTypeOnShiftForm}
            showJobEstimate={settings.showJobEstimateOnShiftForm}
            showColorKey={settings.showColorKeyOnShiftForm}
            customSettings={(() => {
              const found = customCalendars.find((c) => c.id === selected.customCalendarId);
              return {
                showClient: found?.showClient ?? false,
                requireClient: found?.requireClient ?? false,
                showJobType: found?.showJobType ?? true,
                showJobEstimate: found?.showJobEstimate ?? true,
                showColorKey: found?.showColorKey ?? true,
                showPaymentStatus: found?.showPaymentStatus ?? false,
              };
            })()}
            colorTriples={colorTriples}
            tags={tags}
            staff={staff}
            serviceTypes={isShift(selected) || isCustomEntry(selected) ? shiftServiceTypes : appointmentServiceTypes}
            clients={clients}
            canCreateTag={false}
            onTagCreated={() => {}}
            onClose={() => setSelected(null)}
            onChanged={() => {}}
          />
        </Modal>
      )}
    </div>
  );
}
