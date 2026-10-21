import { addDays, startOfDay } from "date-fns";
import type { Tx } from "@/lib/tenant-context";
import { createAppointment, SchedulingConflictError } from "./service";

/**
 * Reusable shift-schedule templates (TODO.md): build a weekly/N-day pattern
 * once, then apply it to any target period to generate real Appointment rows
 * (shifts - clientId null) instead of rebuilding the same pattern from
 * scratch every time. A ScheduleTemplateShift is relative to the template's
 * period (dayOffset, 0-indexed) rather than a real calendar date - the same
 * template can be applied starting from any week.
 */

const shiftInclude = {
  staff: { select: { id: true, displayName: true } },
  shiftServiceType: { select: { id: true, name: true } },
} as const;

export interface ScheduleTemplateShiftInput {
  staffId: string;
  dayOffset: number;
  startMinute: number;
  endMinute: number;
  serviceTypeId?: string | null;
}

/** Validates a shift's own fields are internally consistent and fit within the template's period - not staff/service-type existence, which callers check separately since they need the tenant-scoped lookup anyway. */
function assertValidShiftFields(
  periodLengthDays: number,
  shift: Pick<ScheduleTemplateShiftInput, "dayOffset" | "startMinute" | "endMinute">
) {
  if (!Number.isInteger(shift.dayOffset) || shift.dayOffset < 0 || shift.dayOffset >= periodLengthDays) {
    throw new Error("INVALID_DAY_OFFSET");
  }
  if (shift.startMinute < 0 || shift.endMinute > 24 * 60 || shift.endMinute <= shift.startMinute) {
    throw new Error("INVALID_TIME_RANGE");
  }
}

export function listTemplates(tx: Tx, tenantId: string) {
  return tx.scheduleTemplate.findMany({
    where: { tenantId },
    include: { shifts: { include: shiftInclude, orderBy: [{ dayOffset: "asc" }, { startMinute: "asc" }] } },
    orderBy: { name: "asc" },
  });
}

export function getTemplate(tx: Tx, tenantId: string, id: string) {
  return tx.scheduleTemplate.findFirst({
    where: { id, tenantId },
    include: { shifts: { include: shiftInclude, orderBy: [{ dayOffset: "asc" }, { startMinute: "asc" }] } },
  });
}

export function createTemplate(tx: Tx, tenantId: string, data: { name: string; periodLengthDays: number }) {
  return tx.scheduleTemplate.create({ data: { tenantId, ...data } });
}

export async function updateTemplate(
  tx: Tx,
  tenantId: string,
  id: string,
  data: { name?: string; periodLengthDays?: number }
) {
  if (data.periodLengthDays !== undefined) {
    const { _max } = await tx.scheduleTemplateShift.aggregate({
      where: { templateId: id, tenantId },
      _max: { dayOffset: true },
    });
    if (_max.dayOffset !== null && _max.dayOffset >= data.periodLengthDays) {
      throw new Error("PERIOD_TOO_SHORT");
    }
  }
  const result = await tx.scheduleTemplate.updateMany({ where: { id, tenantId }, data });
  if (result.count === 0) throw new Error("NOT_FOUND");
  return getTemplate(tx, tenantId, id);
}

export async function deleteTemplate(tx: Tx, tenantId: string, id: string) {
  const result = await tx.scheduleTemplate.deleteMany({ where: { id, tenantId } });
  if (result.count === 0) throw new Error("NOT_FOUND");
}

/** Starts a new template as a copy of an existing one, including all its shifts. */
export async function cloneTemplate(tx: Tx, tenantId: string, id: string, name: string) {
  const original = await getTemplate(tx, tenantId, id);
  if (!original) throw new Error("NOT_FOUND");

  const clone = await tx.scheduleTemplate.create({
    data: { tenantId, name, periodLengthDays: original.periodLengthDays },
  });

  if (original.shifts.length > 0) {
    await tx.scheduleTemplateShift.createMany({
      data: original.shifts.map((s) => ({
        tenantId,
        templateId: clone.id,
        staffId: s.staffId,
        dayOffset: s.dayOffset,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        shiftServiceTypeId: s.shiftServiceTypeId,
      })),
    });
  }

  return getTemplate(tx, tenantId, clone.id);
}

async function assertStaffAndServiceBelongToTenant(tx: Tx, tenantId: string, staffId: string, serviceTypeId?: string | null) {
  const staff = await tx.staffProfile.findFirst({ where: { id: staffId, tenantId } });
  if (!staff) throw new Error("INVALID_STAFF");
  if (serviceTypeId) {
    const serviceType = await tx.shiftServiceType.findFirst({ where: { id: serviceTypeId, tenantId } });
    if (!serviceType) throw new Error("INVALID_SERVICE_TYPE");
  }
}

export async function addTemplateShift(
  tx: Tx,
  tenantId: string,
  templateId: string,
  input: ScheduleTemplateShiftInput
) {
  const template = await tx.scheduleTemplate.findFirst({ where: { id: templateId, tenantId } });
  if (!template) throw new Error("NOT_FOUND");
  assertValidShiftFields(template.periodLengthDays, input);
  await assertStaffAndServiceBelongToTenant(tx, tenantId, input.staffId, input.serviceTypeId);

  return tx.scheduleTemplateShift.create({
    data: {
      tenantId,
      templateId,
      staffId: input.staffId,
      dayOffset: input.dayOffset,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      shiftServiceTypeId: input.serviceTypeId ?? null,
    },
    include: shiftInclude,
  });
}

export async function updateTemplateShift(
  tx: Tx,
  tenantId: string,
  templateId: string,
  shiftId: string,
  input: Partial<ScheduleTemplateShiftInput>
) {
  const template = await tx.scheduleTemplate.findFirst({ where: { id: templateId, tenantId } });
  if (!template) throw new Error("NOT_FOUND");
  const existing = await tx.scheduleTemplateShift.findFirst({ where: { id: shiftId, templateId, tenantId } });
  if (!existing) throw new Error("NOT_FOUND");

  const merged = {
    dayOffset: input.dayOffset ?? existing.dayOffset,
    startMinute: input.startMinute ?? existing.startMinute,
    endMinute: input.endMinute ?? existing.endMinute,
  };
  assertValidShiftFields(template.periodLengthDays, merged);
  if (input.staffId || input.serviceTypeId !== undefined) {
    await assertStaffAndServiceBelongToTenant(
      tx,
      tenantId,
      input.staffId ?? existing.staffId,
      input.serviceTypeId !== undefined ? input.serviceTypeId : existing.shiftServiceTypeId
    );
  }

  return tx.scheduleTemplateShift.update({
    where: { id: shiftId },
    data: {
      staffId: input.staffId,
      dayOffset: input.dayOffset,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      shiftServiceTypeId: input.serviceTypeId === undefined ? undefined : input.serviceTypeId,
    },
    include: shiftInclude,
  });
}

export async function deleteTemplateShift(tx: Tx, tenantId: string, templateId: string, shiftId: string) {
  const result = await tx.scheduleTemplateShift.deleteMany({ where: { id: shiftId, templateId, tenantId } });
  if (result.count === 0) throw new Error("NOT_FOUND");
}

export interface TemplateApplyPlanItem {
  templateShiftId: string;
  staffId: string;
  staffName: string;
  serviceTypeId: string | null;
  serviceTypeName: string | null;
  dayOffset: number;
  startTime: Date;
  endTime: Date;
  /** Would double-book the staff member against an existing appointment, or against another shift in this same plan. */
  conflict: boolean;
}

function computeShiftRange(periodStart: Date, dayOffset: number, startMinute: number, endMinute: number) {
  const dayStart = addDays(periodStart, dayOffset);
  return {
    start: new Date(dayStart.getTime() + startMinute * 60_000),
    end: new Date(dayStart.getTime() + endMinute * 60_000),
  };
}

/**
 * Dry-run: computes exactly what applying this template starting at
 * `periodStart` would create, flagging any shift that would double-book a
 * staff member - either against an existing appointment, or against another
 * shift earlier in this same template (checked in template order, so the
 * first of two overlapping template rows "wins" and only the second is
 * flagged). Never writes anything - used both for the apply-preview UI and
 * as the first step of a real apply (see applyTemplate below).
 */
export async function planTemplateApply(
  tx: Tx,
  tenantId: string,
  templateId: string,
  periodStart: Date
): Promise<{ template: { id: string; name: string; periodLengthDays: number }; items: TemplateApplyPlanItem[] }> {
  const template = await getTemplate(tx, tenantId, templateId);
  if (!template) throw new Error("NOT_FOUND");

  const start = startOfDay(periodStart);
  const end = addDays(start, template.periodLengthDays);
  const staffIds = [...new Set(template.shifts.map((s) => s.staffId))];

  const existing = staffIds.length
    ? await tx.appointment.findMany({
        where: {
          tenantId,
          staffId: { in: staffIds },
          status: { not: "CANCELLED" },
          startTime: { lt: end },
          endTime: { gt: start },
        },
        select: { staffId: true, startTime: true, endTime: true },
      })
    : [];

  const accepted: Array<{ staffId: string; start: Date; end: Date }> = [];
  const items: TemplateApplyPlanItem[] = template.shifts.map((shift) => {
    const { start: shiftStart, end: shiftEnd } = computeShiftRange(start, shift.dayOffset, shift.startMinute, shift.endMinute);
    const conflict =
      existing.some((a) => a.staffId === shift.staffId && a.startTime < shiftEnd && a.endTime > shiftStart) ||
      accepted.some((a) => a.staffId === shift.staffId && a.start < shiftEnd && a.end > shiftStart);
    if (!conflict) accepted.push({ staffId: shift.staffId, start: shiftStart, end: shiftEnd });

    return {
      templateShiftId: shift.id,
      staffId: shift.staffId,
      staffName: shift.staff.displayName,
      serviceTypeId: shift.shiftServiceTypeId,
      serviceTypeName: shift.shiftServiceType?.name ?? null,
      dayOffset: shift.dayOffset,
      startTime: shiftStart,
      endTime: shiftEnd,
      conflict,
    };
  });

  return { template: { id: template.id, name: template.name, periodLengthDays: template.periodLengthDays }, items };
}

export interface TemplateApplyResult {
  created: Array<{ templateShiftId: string; appointmentId: string }>;
  skipped: Array<{ templateShiftId: string; staffId: string; dayOffset: number; reason: "CONFLICT" }>;
}

/**
 * Creates a real Appointment for every non-conflicting planned shift
 * (clientId null - these are shifts, not client appointments), skipping
 * flagged conflicts rather than blocking the whole apply - matches the
 * preview the admin already confirmed. No free-plan appointment-cap check
 * here: schedule templates are themselves a paid-only feature (gated by
 * assertScheduleTemplatesEnabled in the API route, before this ever runs),
 * so by the time a tenant can reach this function their plan is already
 * uncapped. A defensive SchedulingConflictError catch covers the (unlikely)
 * race where something else books the exact slot between the preview and
 * this call.
 */
export async function applyTemplate(
  tx: Tx,
  tenantId: string,
  templateId: string,
  periodStart: Date,
  createdByUserId: string
): Promise<TemplateApplyResult> {
  const { items } = await planTemplateApply(tx, tenantId, templateId, periodStart);

  const result: TemplateApplyResult = { created: [], skipped: [] };

  for (const item of items) {
    if (item.conflict) {
      result.skipped.push({ templateShiftId: item.templateShiftId, staffId: item.staffId, dayOffset: item.dayOffset, reason: "CONFLICT" });
      continue;
    }

    try {
      const appointment = await createAppointment(tx, tenantId, {
        staffId: item.staffId,
        entryKind: "SHIFT",
        clientId: null,
        serviceTypeId: item.serviceTypeId,
        startTime: item.startTime,
        endTime: item.endTime,
        createdByUserId,
        source: "ADMIN",
      });
      result.created.push({ templateShiftId: item.templateShiftId, appointmentId: appointment.id });
    } catch (err) {
      if (!(err instanceof SchedulingConflictError)) throw err;
      result.skipped.push({ templateShiftId: item.templateShiftId, staffId: item.staffId, dayOffset: item.dayOffset, reason: "CONFLICT" });
    }
  }

  return result;
}
