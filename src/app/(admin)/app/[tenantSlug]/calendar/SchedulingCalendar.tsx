"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, type SlotInfo } from "react-big-calendar";
import withDragAndDrop, { type EventInteractionArgs } from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import type { PermissionKey } from "@/lib/permissions/catalog";

// IMPORTANT: pass date-fns's startOfWeek directly. dateFnsLocalizer calls it
// itself as startOfWeek(date, { locale }) for whatever date it's currently
// computing boundaries for - wrapping it in a function that ignores its
// arguments (as an earlier version of this file did) silently pins every
// week-boundary calculation to today's real-world week, which breaks Day/
// Week/Month switching, Today/Back/Next navigation, and drag/resize/drop
// positioning all at once, since they all depend on this being correct.
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { "en-US": enUS },
});

const DnDCalendar = withDragAndDrop<CalendarEvent, object>(Calendar);

type EntryMode = "appointment" | "shift";

/** Status/type color system - shared by the calendar events, the legend, and the detail panel's status pill. */
const COLORS = {
  appointment: { bg: "var(--color-primary-500)", border: "var(--color-primary-600)", text: "#ffffff" },
  shift: { bg: "#7c3aed", border: "#6d28d9", text: "#ffffff" },
  completed: { bg: "#9ca3af", border: "#6b7280", text: "#ffffff" },
  noShow: { bg: "#f59e0b", border: "#d97706", text: "#ffffff" },
  cancelled: { bg: "#e5e7eb", border: "#d1d5db", text: "#6b7280" },
} as const;

const LEGEND = [
  { label: "Appointment", color: COLORS.appointment.bg },
  { label: "Shift", color: COLORS.shift.bg },
  { label: "Completed", color: COLORS.completed.bg },
  { label: "No-show", color: COLORS.noShow.bg },
  { label: "Cancelled", color: COLORS.cancelled.bg },
];

interface StaffOption {
  id: string;
  displayName: string;
}
interface ServiceTypeOption {
  id: string;
  name: string;
  durationMinutes: number;
  price: string;
}
interface ClientOption {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}
interface ApiAppointment {
  id: string;
  staffId: string;
  clientId: string | null;
  serviceTypeId: string | null;
  startTime: string;
  endTime: string;
  status: string;
  priceCharged: string | null;
  paymentStatus: string;
  estimatedDurationMinutes: number | null;
  estimatedValue: string | null;
  locationType: "IN_PERSON" | "ONLINE";
  location: string | null;
  client: ClientOption | null;
  serviceType: ServiceTypeOption | null;
  staff: StaffOption;
}
interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: ApiAppointment;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function isShift(appt: ApiAppointment): boolean {
  return !appt.clientId;
}

function toEvent(appt: ApiAppointment): CalendarEvent {
  const title = isShift(appt)
    ? `Shift${appt.serviceType ? ` – ${appt.serviceType.name}` : ""} (${appt.staff.displayName})`
    : `${appt.client?.name ?? "Client"}${appt.serviceType ? ` – ${appt.serviceType.name}` : ""}`;
  return {
    id: appt.id,
    title,
    start: new Date(appt.startTime),
    end: new Date(appt.endTime),
    resource: appt,
  };
}

/** Default time range when opening the create panel from a button rather than clicking a calendar slot - the next full hour, one hour long. */
function nextHourSlot(): { start: Date; end: Date } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return { start, end };
}

export function SchedulingCalendar({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeOption[]>([]);
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean> | null>(null);
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [range, setRange] = useState<{ start: Date; end: Date }>(() => {
    const now = new Date();
    const start = startOfWeek(now, { locale: enUS });
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  });
  const [selected, setSelected] = useState<ApiAppointment | null>(null);
  const [creating, setCreating] = useState<{ start: Date; end: Date; mode: EntryMode } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAppointments = useCallback(async (r: { start: Date; end: Date }) => {
    try {
      const data = await fetchJson<{ appointments: ApiAppointment[] }>(
        `/api/appointments?start=${r.start.toISOString()}&end=${r.end.toISOString()}`
      );
      setEvents(data.appointments.map(toEvent));
    } catch {
      setError("Couldn't load appointments.");
    }
  }, []);

  const loadStaff = useCallback(async () => {
    try {
      const data = await fetchJson<{ staff: StaffOption[] }>("/api/staff");
      setStaff(data.staff);
    } catch {
      setError("Couldn't load staff.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [serviceData, permData] = await Promise.all([
          fetchJson<{ serviceTypes: ServiceTypeOption[] }>("/api/service-types"),
          fetchJson<{ permissions: Record<PermissionKey, boolean> }>("/api/me/permissions"),
        ]);
        setServiceTypes(serviceData.serviceTypes);
        setPermissions(permData.permissions);
      } catch {
        setError("Couldn't load service data.");
      }
      await loadStaff();
    })();
  }, [loadStaff]);

  useEffect(() => {
    (async () => {
      await loadAppointments(range);
    })();
  }, [range, loadAppointments]);

  const handleRangeChange = useCallback((r: Date[] | { start: Date; end: Date }) => {
    if (Array.isArray(r)) {
      if (r.length === 0) return;
      setRange({ start: r[0], end: r[r.length - 1] });
    } else {
      setRange(r);
    }
  }, []);

  async function applyReschedule(id: string, start: Date, end: Date) {
    try {
      await fetchJson(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: start.toISOString(), endTime: end.toISOString() }),
      });
      await loadAppointments(range);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reschedule.");
      await loadAppointments(range); // revert any optimistic UI by refetching truth
    }
  }

  const handleEventDrop = useCallback(
    ({ event, start, end }: EventInteractionArgs<CalendarEvent>) => {
      void applyReschedule(event.id, start as Date, end as Date);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range]
  );

  const handleEventResize = useCallback(
    ({ event, start, end }: EventInteractionArgs<CalendarEvent>) => {
      void applyReschedule(event.id, start as Date, end as Date);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range]
  );

  // readOnly always wins, regardless of what the viewer's actual permissions
  // would otherwise allow - this is what makes the dedicated read-only
  // calendar view (see the /calendar/view route) genuinely non-interactive
  // rather than just "happens to be viewed by someone without edit rights".
  const canCreate = !readOnly && (permissions?.CREATE_APPOINTMENTS ?? false);
  const canEdit = !readOnly && (permissions?.EDIT_APPOINTMENTS ?? false);
  const canCancel = !readOnly && (permissions?.CANCEL_APPOINTMENTS ?? false);

  const visibleEvents = useMemo(
    () => (staffFilter === "all" ? events : events.filter((e) => e.resource.staffId === staffFilter)),
    [events, staffFilter]
  );

  const eventPropGetter = useCallback((event: CalendarEvent) => {
    const appt = event.resource;
    let c: { bg: string; border: string; text: string } = isShift(appt) ? COLORS.shift : COLORS.appointment;
    if (appt.status === "CANCELLED") c = COLORS.cancelled;
    else if (appt.status === "NO_SHOW") c = COLORS.noShow;
    else if (appt.status === "COMPLETED") c = COLORS.completed;

    return {
      style: {
        backgroundColor: c.bg,
        borderColor: c.border,
        color: c.text,
        textDecoration: appt.status === "CANCELLED" ? "line-through" : undefined,
      },
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {readOnly && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-600">
          <span className="h-2 w-2 rounded-full bg-gray-400" />
          View only — this link can&apos;t create, reschedule, or cancel anything.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {staff.length > 1 ? (
          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="all">All staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        ) : (
          <div />
        )}

        {canCreate && (
          <div className="flex gap-2">
            <button
              onClick={() => setCreating({ ...nextHourSlot(), mode: "appointment" })}
              className="rounded-lg bg-linear-to-r from-primary-500 to-primary-550 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
            >
              + Add appointment
            </button>
            <button
              onClick={() => setCreating({ ...nextHourSlot(), mode: "shift" })}
              className="rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-violet-700 shadow-sm transition-all hover:bg-violet-50 hover:shadow-md"
            >
              + Schedule shift
            </button>
          </div>
        )}
      </div>

      <div style={{ height: 650 }} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <DnDCalendar
          localizer={localizer}
          events={visibleEvents}
          startAccessor="start"
          endAccessor="end"
          defaultView="week"
          views={["month", "week", "day"]}
          selectable={canCreate}
          resizable={canEdit}
          draggableAccessor={() => canEdit}
          onRangeChange={handleRangeChange}
          onSelectSlot={(slot: SlotInfo) => {
            if (!canCreate) return;
            setCreating({ start: slot.start, end: slot.end, mode: "appointment" });
          }}
          onSelectEvent={(event: CalendarEvent) => setSelected(event.resource)}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          eventPropGetter={eventPropGetter}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5">
        {LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </div>
        ))}
      </div>

      {selected && (
        <AppointmentDetailPanel
          appointment={selected}
          permissions={permissions}
          canCancel={canCancel}
          canFindCoverage={canEdit}
          readOnly={readOnly}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            void loadAppointments(range);
          }}
        />
      )}

      {creating && (
        <CreateEntryPanel
          slot={creating}
          mode={creating.mode}
          staff={staff}
          serviceTypes={serviceTypes}
          canEditEstimates={permissions?.EDIT_JOB_ESTIMATES ?? false}
          canCreateStaff={permissions?.CREATE_STAFF ?? false}
          onStaffCreated={loadStaff}
          onClose={() => setCreating(null)}
          onCreated={() => {
            setCreating(null);
            void loadAppointments(range);
          }}
        />
      )}
    </div>
  );
}

function StatusPill({ appointment }: { appointment: ApiAppointment }) {
  let c: { bg: string; border: string; text: string } = isShift(appointment)
    ? COLORS.shift
    : COLORS.appointment;
  if (appointment.status === "CANCELLED") c = COLORS.cancelled;
  else if (appointment.status === "NO_SHOW") c = COLORS.noShow;
  else if (appointment.status === "COMPLETED") c = COLORS.completed;

  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {appointment.status}
    </span>
  );
}

function AppointmentDetailPanel({
  appointment,
  permissions,
  canCancel,
  canFindCoverage,
  readOnly = false,
  onClose,
  onChanged,
}: {
  appointment: ApiAppointment;
  permissions: Record<PermissionKey, boolean> | null;
  canCancel: boolean;
  canFindCoverage: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const canViewEstimates = permissions?.VIEW_JOB_ESTIMATES ?? false;
  const canEditEstimates = !readOnly && (permissions?.EDIT_JOB_ESTIMATES ?? false);
  const [duration, setDuration] = useState(appointment.estimatedDurationMinutes?.toString() ?? "");
  const [value, setValue] = useState(appointment.estimatedValue ?? "");
  const [saving, setSaving] = useState(false);
  const [coverageCandidates, setCoverageCandidates] = useState<
    Array<{ staffId: string; displayName: string; hoursThisWeek: number }> | null
  >(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);

  async function findCoverage() {
    setCoverageLoading(true);
    setCoverageError(null);
    try {
      const { candidates } = await fetchJson<{
        candidates: Array<{ staffId: string; displayName: string; hoursThisWeek: number }>;
      }>(`/api/appointments/${appointment.id}/coverage`);
      setCoverageCandidates(candidates);
    } catch (err) {
      setCoverageError(err instanceof Error ? err.message : "Couldn't find coverage.");
    } finally {
      setCoverageLoading(false);
    }
  }

  async function assignCoverage(staffId: string) {
    setAssigning(staffId);
    try {
      await fetchJson(`/api/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId }),
      });
      onChanged();
    } catch (err) {
      setCoverageError(err instanceof Error ? err.message : "Couldn't assign coverage.");
      setAssigning(null);
    }
  }

  async function saveEstimates() {
    setSaving(true);
    try {
      await fetchJson(`/api/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimatedDurationMinutes: duration === "" ? null : Number(duration),
          estimatedValue: value === "" ? null : Number(value),
        }),
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function cancelAppointment() {
    await fetchJson(`/api/appointments/${appointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    onChanged();
  }

  return (
    <div className="rounded-xl border border-primary-100 bg-linear-to-br from-primary-50 to-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-medium">{isShift(appointment) ? "Shift details" : "Appointment details"}</h2>
          <div className="mt-1">
            <StatusPill appointment={appointment} />
          </div>
        </div>
        <button onClick={onClose} className="text-sm text-gray-500 hover:underline">
          Close
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-gray-500">Client</dt>
        <dd>{appointment.client?.name ?? "— (internal/shift)"}</dd>
        {appointment.client?.email && (
          <>
            <dt className="text-gray-500">Email</dt>
            <dd>{appointment.client.email}</dd>
          </>
        )}
        {appointment.client?.phone && (
          <>
            <dt className="text-gray-500">Phone</dt>
            <dd>{appointment.client.phone}</dd>
          </>
        )}
        <dt className="text-gray-500">Service</dt>
        <dd>{appointment.serviceType?.name ?? "—"}</dd>
        <dt className="text-gray-500">Staff</dt>
        <dd>{appointment.staff.displayName}</dd>
        <dt className="text-gray-500">Meeting</dt>
        <dd>{appointment.locationType === "ONLINE" ? "Online" : "In person"}</dd>
        {appointment.location && (
          <>
            <dt className="text-gray-500">
              {appointment.locationType === "ONLINE" ? "Link" : "Address"}
            </dt>
            <dd>{appointment.location}</dd>
          </>
        )}
        <dt className="text-gray-500">Payment</dt>
        <dd>{appointment.paymentStatus}</dd>
      </dl>

      {canViewEstimates && (
        <div className="mt-4 border-t border-primary-100 pt-3">
          <h3 className="mb-2 text-sm font-medium text-primary-700">Job estimate</h3>
          {canEditEstimates ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-xs text-gray-600">
                Est. minutes
                <input
                  type="number"
                  min={0}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col text-xs text-gray-600">
                Est. value ($)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
              </label>
              <button
                onClick={saveEstimates}
                disabled={saving}
                className="rounded-md bg-primary-500 px-3 py-1 text-sm text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save estimate"}
              </button>
            </div>
          ) : (
            <p className="text-sm">
              {appointment.estimatedDurationMinutes ?? "—"} min · $
              {appointment.estimatedValue ?? "—"}
            </p>
          )}
        </div>
      )}

      {canFindCoverage && appointment.status !== "CANCELLED" && (
        <div className="mt-4 border-t border-primary-100 pt-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-primary-700">Need this covered?</h3>
            <button
              onClick={findCoverage}
              disabled={coverageLoading}
              className="rounded-md border border-primary-300 px-3 py-1 text-xs text-primary-700 hover:bg-primary-50 disabled:opacity-50"
            >
              {coverageLoading ? "Searching..." : "Find coverage"}
            </button>
          </div>
          {coverageError && <p className="mt-2 text-sm text-red-600">{coverageError}</p>}
          {coverageCandidates && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {coverageCandidates.length === 0 ? (
                <li className="text-sm text-gray-500">No one is free for this slot.</li>
              ) : (
                coverageCandidates.map((c) => (
                  <li
                    key={c.staffId}
                    className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm"
                  >
                    <span>
                      {c.displayName}{" "}
                      <span className="text-xs text-gray-400">({c.hoursThisWeek}h this week)</span>
                    </span>
                    <button
                      onClick={() => assignCoverage(c.staffId)}
                      disabled={assigning !== null}
                      className="rounded-md bg-primary-500 px-2 py-1 text-xs text-white hover:bg-primary-600 disabled:opacity-50"
                    >
                      {assigning === c.staffId ? "Assigning..." : "Assign"}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      {canCancel && appointment.status !== "CANCELLED" && (
        <button
          onClick={cancelAppointment}
          className="mt-4 rounded-md border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
        >
          Cancel {isShift(appointment) ? "shift" : "appointment"}
        </button>
      )}
    </div>
  );
}

const NEW_STAFF_VALUE = "__new_staff__";
const NEW_STAFF_ROLE_OPTIONS = ["MANAGER", "SUPERVISOR", "EMPLOYEE"] as const;

function CreateEntryPanel({
  slot,
  mode,
  staff,
  serviceTypes,
  canEditEstimates,
  canCreateStaff,
  onStaffCreated,
  onClose,
  onCreated,
}: {
  slot: { start: Date; end: Date };
  mode: EntryMode;
  staff: StaffOption[];
  serviceTypes: ServiceTypeOption[];
  canEditEstimates: boolean;
  canCreateStaff: boolean;
  onStaffCreated: () => void;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [staffId, setStaffId] = useState(
    staff[0]?.id ?? (canCreateStaff ? NEW_STAFF_VALUE : "")
  );
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<(typeof NEW_STAFF_ROLE_OPTIONS)[number]>("EMPLOYEE");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [clientName, setClientName] = useState("");
  const [startTime, setStartTime] = useState(slot.start);
  const [endTime, setEndTime] = useState(slot.end);
  const [locationType, setLocationType] = useState<"IN_PERSON" | "ONLINE">("IN_PERSON");
  const [location, setLocation] = useState("");
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toInputValue(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!staffId) {
      setError("Pick a staff member.");
      return;
    }
    if (staffId === NEW_STAFF_VALUE && (!newStaffName.trim() || !newStaffEmail.trim() || !newStaffPassword)) {
      setError("Fill in the new staff member's name, email, and password.");
      return;
    }
    if (endTime <= startTime) {
      setError("End time must be after start time.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let resolvedStaffId = staffId;
      if (staffId === NEW_STAFF_VALUE) {
        const { staff: newStaff } = await fetchJson<{ staff: { id: string } }>("/api/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: newStaffName.trim(),
            email: newStaffEmail.trim(),
            password: newStaffPassword,
            role: newStaffRole,
          }),
        });
        resolvedStaffId = newStaff.id;
        onStaffCreated();
      }

      let clientId: string | null = null;
      if (mode === "appointment" && clientName.trim()) {
        const { client } = await fetchJson<{ client: { id: string } }>("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: clientName.trim() }),
        });
        clientId = client.id;
      }

      await fetchJson("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: resolvedStaffId,
          clientId,
          serviceTypeId: serviceTypeId || null,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          estimatedDurationMinutes:
            canEditEstimates && estimatedDurationMinutes ? Number(estimatedDurationMinutes) : null,
          estimatedValue: canEditEstimates && estimatedValue ? Number(estimatedValue) : null,
          locationType,
          location: location.trim() || null,
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Couldn't create ${mode}.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex flex-col gap-3 rounded-xl border p-5 shadow-sm ${
        mode === "shift"
          ? "border-violet-100 bg-linear-to-br from-violet-50 to-white"
          : "border-primary-100 bg-linear-to-br from-primary-50 to-white"
      }`}
    >
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-medium">{mode === "shift" ? "New shift" : "New appointment"}</h2>
        <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:underline">
          Close
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Start
          <input
            type="datetime-local"
            value={toInputValue(startTime)}
            onChange={(e) => e.target.value && setStartTime(new Date(e.target.value))}
            className="rounded-md border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          End
          <input
            type="datetime-local"
            value={toInputValue(endTime)}
            onChange={(e) => e.target.value && setEndTime(new Date(e.target.value))}
            className="rounded-md border border-gray-300 px-2 py-1"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Staff
        <select
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1"
        >
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
          {canCreateStaff && <option value={NEW_STAFF_VALUE}>+ Add new staff member</option>}
        </select>
      </label>

      {staffId === NEW_STAFF_VALUE && (
        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white/60 p-3">
          <p className="text-xs font-medium text-gray-500">New staff member</p>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Name
              <input
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Email
              <input
                type="email"
                value={newStaffEmail}
                onChange={(e) => setNewStaffEmail(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Password
              <input
                type="password"
                value={newStaffPassword}
                onChange={(e) => setNewStaffPassword(e.target.value)}
                minLength={8}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Role
              <select
                value={newStaffRole}
                onChange={(e) => setNewStaffRole(e.target.value as (typeof NEW_STAFF_ROLE_OPTIONS)[number])}
                className="rounded-md border border-gray-300 px-2 py-1"
              >
                {NEW_STAFF_ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0) + r.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm">
        {mode === "shift" ? "Job type (optional)" : "Service (optional)"}
        <select
          value={serviceTypeId}
          onChange={(e) => setServiceTypeId(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1"
        >
          <option value="">—</option>
          {serviceTypes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {mode === "appointment" && (
        <label className="flex flex-col gap-1 text-sm">
          Client name
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1"
          />
        </label>
      )}

      <div className="flex flex-col gap-1 text-sm">
        Meeting
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setLocationType("IN_PERSON")}
            className={`rounded-md border px-3 py-1 text-sm transition-colors ${
              locationType === "IN_PERSON"
                ? "border-primary-500 bg-primary-50 text-primary-700"
                : "border-gray-300 text-gray-600 hover:border-primary-300"
            }`}
          >
            In person
          </button>
          <button
            type="button"
            onClick={() => setLocationType("ONLINE")}
            className={`rounded-md border px-3 py-1 text-sm transition-colors ${
              locationType === "ONLINE"
                ? "border-primary-500 bg-primary-50 text-primary-700"
                : "border-gray-300 text-gray-600 hover:border-primary-300"
            }`}
          >
            Online
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        {locationType === "ONLINE" ? "Meeting link" : "Address (optional)"}
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={locationType === "ONLINE" ? "https://..." : "123 Main St"}
          className="rounded-md border border-gray-300 px-2 py-1"
        />
      </label>

      {canEditEstimates && (
        <div className="flex gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Est. minutes
            <input
              type="number"
              min={0}
              value={estimatedDurationMinutes}
              onChange={(e) => setEstimatedDurationMinutes(e.target.value)}
              className="w-28 rounded-md border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Est. value ($)
            <input
              type="number"
              min={0}
              step="0.01"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              className="w-28 rounded-md border border-gray-300 px-2 py-1"
            />
          </label>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className={`self-start rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50 ${
          mode === "shift"
            ? "bg-linear-to-r from-violet-500 to-violet-600"
            : "bg-linear-to-r from-primary-500 to-primary-550"
        }`}
      >
        {submitting ? "Creating..." : mode === "shift" ? "Create shift" : "Create appointment"}
      </button>
    </form>
  );
}
