"use client";

import { useEffect, useState } from "react";

interface StaffOption {
  id: string;
  displayName: string;
}

interface ServiceTypeOption {
  id: string;
  name: string;
}

interface TemplateShift {
  id: string;
  staffId: string;
  staff: { id: string; displayName: string };
  dayOffset: number;
  startMinute: number;
  endMinute: number;
  shiftServiceTypeId: string | null;
  shiftServiceType: { id: string; name: string } | null;
}

interface Template {
  id: string;
  name: string;
  periodLengthDays: number;
  shifts: TemplateShift[];
}

interface PlanItem {
  templateShiftId: string;
  staffId: string;
  staffName: string;
  serviceTypeId: string | null;
  serviceTypeName: string | null;
  dayOffset: number;
  startTime: string;
  endTime: string;
  conflict: boolean;
}

interface ApplyResult {
  created: Array<{ templateShiftId: string; appointmentId: string }>;
  skipped: Array<{ templateShiftId: string; staffId: string; dayOffset: number; reason: "CONFLICT" }>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function timeInputToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutes(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

export function ScheduleTemplatesView() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newPeriodLengthDays, setNewPeriodLengthDays] = useState("7");
  const [creating, setCreating] = useState(false);

  async function reload(selectId?: string) {
    const [templatesData, staffData, serviceTypesData] = await Promise.all([
      fetchJson<{ templates: Template[] }>("/api/schedule-templates"),
      fetchJson<{ staff: Array<{ id: string; displayName: string }> }>("/api/staff"),
      fetchJson<{ serviceTypes: ServiceTypeOption[] }>("/api/shift-service-types?activeOnly=true"),
    ]);
    setTemplates(templatesData.templates);
    setStaff(staffData.staff.map((s) => ({ id: s.id, displayName: s.displayName })));
    setServiceTypes(serviceTypesData.serviceTypes);
    setSelectedId((prev) => {
      if (selectId) return selectId;
      if (prev && templatesData.templates.some((t) => t.id === prev)) return prev;
      return templatesData.templates[0]?.id ?? null;
    });
  }

  useEffect(() => {
    (async () => {
      try {
        await reload();
      } catch {
        setError("Couldn't load schedule templates.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const days = Number(newPeriodLengthDays);
    if (!newName.trim() || !Number.isInteger(days) || days < 1) return;
    setCreating(true);
    setError(null);
    try {
      const { template } = await fetchJson<{ template: Template }>("/api/schedule-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), periodLengthDays: days }),
      });
      setNewName("");
      setNewPeriodLengthDays("7");
      await reload(template.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create template.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading...</p>;

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <aside className="flex w-full flex-shrink-0 flex-col gap-3 lg:w-64">
        <div className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          {templates.length === 0 && <p className="px-2 py-1 text-sm text-gray-400">No templates yet.</p>}
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                t.id === selectedId ? "bg-primary-50 text-primary-700" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {t.name}
              <span className="ml-1 text-xs font-normal text-gray-400">· {t.periodLengthDays}d</span>
            </button>
          ))}
        </div>

        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-2 rounded-xl border border-primary-100 bg-linear-to-br from-primary-50 to-white p-3"
        >
          <label className="flex flex-col gap-1 text-sm">
            New template name
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Standard week"
              required
              maxLength={200}
              className="rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Period length (days)
            <input
              type="number"
              min={1}
              max={90}
              value={newPeriodLengthDays}
              onChange={(e) => setNewPeriodLengthDays(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-50"
          >
            {creating ? "Adding..." : "+ Add template"}
          </button>
        </form>
      </aside>

      <div className="min-w-0 flex-1">
        {selected ? (
          <TemplateDetail
            // Remounts fresh (resetting local draft/plan state) whenever the
            // selected template changes, instead of an effect syncing props
            // into state on every switch.
            key={selected.id}
            template={selected}
            staff={staff}
            serviceTypes={serviceTypes}
            onChanged={(id) => reload(id)}
            onDeleted={() => reload()}
          />
        ) : (
          <p className="text-sm text-gray-500">Add a template on the left to start building its shifts.</p>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

function TemplateDetail({
  template,
  staff,
  serviceTypes,
  onChanged,
  onDeleted,
}: {
  template: Template;
  staff: StaffOption[];
  serviceTypes: ServiceTypeOption[];
  onChanged: (id: string) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [periodLengthDays, setPeriodLengthDays] = useState(String(template.periodLengthDays));
  const [savingField, setSavingField] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shiftDayOffset, setShiftDayOffset] = useState("0");
  const [shiftStaffId, setShiftStaffId] = useState(staff[0]?.id ?? "");
  const [shiftStart, setShiftStart] = useState("09:00");
  const [shiftEnd, setShiftEnd] = useState("17:00");
  const [shiftServiceTypeId, setShiftServiceTypeId] = useState("");
  const [addingShift, setAddingShift] = useState(false);
  const [removingShiftId, setRemovingShiftId] = useState<string | null>(null);

  const [periodStart, setPeriodStart] = useState("");
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  async function handleSaveField(patch: { name?: string; periodLengthDays?: number }) {
    setSavingField(true);
    setError(null);
    try {
      await fetchJson(`/api/schedule-templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      onChanged(template.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
    } finally {
      setSavingField(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await fetchJson(`/api/schedule-templates/${template.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete template.");
      setDeleting(false);
    }
  }

  async function handleClone() {
    setCloning(true);
    setError(null);
    try {
      const { template: clone } = await fetchJson<{ template: Template }>(
        `/api/schedule-templates/${template.id}/clone`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${template.name} (copy)` }),
        }
      );
      onChanged(clone.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't clone template.");
    } finally {
      setCloning(false);
    }
  }

  async function handleAddShift(e: React.FormEvent) {
    e.preventDefault();
    const dayOffset = Number(shiftDayOffset);
    const startMinute = timeInputToMinutes(shiftStart);
    const endMinute = timeInputToMinutes(shiftEnd);
    if (!shiftStaffId || !Number.isInteger(dayOffset) || startMinute === null || endMinute === null) return;
    setAddingShift(true);
    setError(null);
    try {
      await fetchJson(`/api/schedule-templates/${template.id}/shifts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: shiftStaffId,
          dayOffset,
          startMinute,
          endMinute,
          serviceTypeId: shiftServiceTypeId || null,
        }),
      });
      onChanged(template.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add shift.");
    } finally {
      setAddingShift(false);
    }
  }

  async function handleRemoveShift(shiftId: string) {
    setRemovingShiftId(shiftId);
    setError(null);
    try {
      await fetchJson(`/api/schedule-templates/${template.id}/shifts/${shiftId}`, { method: "DELETE" });
      onChanged(template.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove shift.");
    } finally {
      setRemovingShiftId(null);
    }
  }

  async function handlePreview() {
    if (!periodStart) return;
    setPlanning(true);
    setApplyResult(null);
    setError(null);
    try {
      const { plan } = await fetchJson<{ plan: { items: PlanItem[] } }>(
        `/api/schedule-templates/${template.id}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periodStart: new Date(periodStart).toISOString(), dryRun: true }),
        }
      );
      setPlan(plan.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't preview this apply.");
    } finally {
      setPlanning(false);
    }
  }

  async function handleConfirmApply() {
    if (!periodStart) return;
    setApplying(true);
    setError(null);
    try {
      const { result } = await fetchJson<{ result: ApplyResult }>(`/api/schedule-templates/${template.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodStart: new Date(periodStart).toISOString(), dryRun: false }),
      });
      setApplyResult(result);
      setPlan(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't apply this template.");
    } finally {
      setApplying(false);
    }
  }

  const conflictCount = plan?.filter((i) => i.conflict).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== template.name && handleSaveField({ name: name.trim() })}
              maxLength={200}
              className="rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Period length (days)
            <input
              type="number"
              min={1}
              max={90}
              value={periodLengthDays}
              onChange={(e) => setPeriodLengthDays(e.target.value)}
              onBlur={() => {
                const days = Number(periodLengthDays);
                if (Number.isInteger(days) && days >= 1 && days !== template.periodLengthDays) {
                  handleSaveField({ periodLengthDays: days });
                }
              }}
              className="w-28 rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          {savingField && <span className="pb-1.5 text-xs text-gray-400">Saving...</span>}
          <div className="ml-auto flex gap-2 pb-0.5">
            <button
              type="button"
              onClick={handleClone}
              disabled={cloning}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {cloning ? "Cloning..." : "Clone"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete template"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium">Shifts</h2>
        <p className="mt-1 text-sm text-gray-500">
          Each row is relative to the period&apos;s start (Day 0), not a real calendar date - that&apos;s what lets
          this template be applied starting from any week.
        </p>

        {template.shifts.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5">
            {template.shifts.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium text-gray-900">Day {s.dayOffset}</span>{" "}
                  <span className="text-gray-500">
                    · {formatMinutes(s.startMinute)}–{formatMinutes(s.endMinute)} · {s.staff.displayName}
                    {s.shiftServiceType && ` · ${s.shiftServiceType.name}`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveShift(s.id)}
                  disabled={removingShiftId === s.id}
                  className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAddShift} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Day (0-{template.periodLengthDays - 1})
            <input
              type="number"
              min={0}
              max={template.periodLengthDays - 1}
              value={shiftDayOffset}
              onChange={(e) => setShiftDayOffset(e.target.value)}
              className="w-20 rounded-md border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Start
            <input
              type="time"
              value={shiftStart}
              onChange={(e) => setShiftStart(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            End
            <input
              type="time"
              value={shiftEnd}
              onChange={(e) => setShiftEnd(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Staff
            <select
              value={shiftStaffId}
              onChange={(e) => setShiftStaffId(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1"
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Job type (optional)
            <select
              value={shiftServiceTypeId}
              onChange={(e) => setShiftServiceTypeId(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1"
            >
              <option value="">None</option>
              {serviceTypes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={addingShift || !shiftStaffId}
            className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-50"
          >
            {addingShift ? "Adding..." : "+ Add shift"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium">Apply to a week</h2>
        <p className="mt-1 text-sm text-gray-500">
          Pick the date this period should start on. Preview shows exactly what will be created and flags any
          double-booking before anything is actually scheduled.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Period start date
            <input
              type="date"
              value={periodStart}
              onChange={(e) => {
                setPeriodStart(e.target.value);
                setPlan(null);
                setApplyResult(null);
              }}
              className="rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <button
            type="button"
            onClick={handlePreview}
            disabled={!periodStart || planning || template.shifts.length === 0}
            className="rounded-lg border border-primary-300 px-4 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50"
          >
            {planning ? "Loading preview..." : "Preview"}
          </button>
        </div>

        {template.shifts.length === 0 && (
          <p className="mt-2 text-sm text-gray-400">Add at least one shift above before applying this template.</p>
        )}

        {plan && (
          <div className="mt-4">
            <p className="text-sm text-gray-600">
              {plan.length} shift{plan.length === 1 ? "" : "s"} would be created
              {conflictCount > 0 && (
                <span className="text-amber-700">
                  {" "}
                  - {conflictCount} would be skipped due to a scheduling conflict
                </span>
              )}
              .
            </p>
            <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
              {plan.map((item) => (
                <li
                  key={item.templateShiftId}
                  className={`flex items-center justify-between rounded-md border px-3 py-1.5 text-sm ${
                    item.conflict ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <span>
                    {new Date(item.startTime).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {" - "}
                    {new Date(item.endTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    {" · "}
                    {item.staffName}
                    {item.serviceTypeName && ` · ${item.serviceTypeName}`}
                  </span>
                  {item.conflict && <span className="text-xs font-medium text-amber-700">Conflict - will skip</span>}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleConfirmApply}
                disabled={applying}
                className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-50"
              >
                {applying ? "Applying..." : `Apply (create ${plan.length - conflictCount} shift${plan.length - conflictCount === 1 ? "" : "s"})`}
              </button>
              <button
                type="button"
                onClick={() => setPlan(null)}
                className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {applyResult && (
          <div className="mt-4 rounded-md border border-primary-200 bg-primary-50 p-3 text-sm text-primary-800">
            Created {applyResult.created.length} shift{applyResult.created.length === 1 ? "" : "s"}.
            {applyResult.skipped.length > 0 &&
              ` Skipped ${applyResult.skipped.length} due to a scheduling conflict.`}
          </div>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
