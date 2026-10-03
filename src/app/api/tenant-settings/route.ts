import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { EVENT_COLOR_KEYS, isValidHexColor, resolveEventColors } from "@/lib/colors/eventColors";
import { assertCalendarHoursEnabled, PlanLimitError } from "@/lib/licensing/limits";

const SETTINGS_SELECT = {
  requireClientForAppointments: true,
  enableMapsNavigation: true,
  eventColors: true,
  enabledHolidayNames: true,
  blockedHolidayNames: true,
  showJobTypeOnShiftForm: true,
  showJobEstimateOnShiftForm: true,
  showColorKeyOnShiftForm: true,
  allowOverlappingShifts: true,
  allowEditingBookedEvents: true,
  calendarStartMinute: true,
  calendarEndMinute: true,
} as const;

// Readable by any signed-in tenant member (not just ADMIN) - this drives
// client-side form/calendar behavior (e.g. whether the appointment form
// requires a client, what colors to render events in) for whoever is
// actually using the calendar, not just the admin who configured it.
export async function GET() {
  try {
    const session = await requireTenantSession();
    const tenant = await runInTenantContext(session.tenantId, session.userId, session.role, (tx) =>
      tx.tenant.findUniqueOrThrow({
        where: { id: session.tenantId },
        select: SETTINGS_SELECT,
      })
    );
    return NextResponse.json({
      settings: { ...tenant, eventColors: resolveEventColors(tenant.eventColors) },
    });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to load tenant settings", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

// Partial - the admin UI toggles one setting at a time, each firing its own
// PUT, rather than requiring every field on every save.
const updateSchema = z
  .object({
    requireClientForAppointments: z.boolean(),
    enableMapsNavigation: z.boolean(),
    enabledHolidayNames: z.array(z.string()),
    blockedHolidayNames: z.array(z.string()),
    showJobTypeOnShiftForm: z.boolean(),
    showJobEstimateOnShiftForm: z.boolean(),
    showColorKeyOnShiftForm: z.boolean(),
    allowOverlappingShifts: z.boolean(),
    allowEditingBookedEvents: z.boolean(),
    // Minutes-from-midnight bounds on the calendar grid's displayed range
    // (see Tenant.calendarStartMinute/calendarEndMinute) - always sent as a
    // pair (see CalendarHoursSettings.tsx), checked together below since
    // neither bound means anything validated alone.
    calendarStartMinute: z.number().int().min(0).max(1440),
    calendarEndMinute: z.number().int().min(0).max(1440),
    // Sparse - only the keys being changed need be present; merged onto the
    // existing stored overrides below rather than replacing them wholesale,
    // so changing one color doesn't require resending all five.
    // partialRecord (not record) - z.record with an enum key schema requires
    // every enum key to be present, which would reject the single-key
    // payloads the admin UI actually sends (see EventColorSettings.tsx).
    eventColors: z
      .partialRecord(z.enum(EVENT_COLOR_KEYS), z.string())
      .refine((obj) => Object.values(obj).every(isValidHexColor), "Colors must be #rrggbb hex values."),
  })
  .partial()
  .refine(
    (data) =>
      (data.calendarStartMinute === undefined && data.calendarEndMinute === undefined) ||
      (data.calendarStartMinute !== undefined &&
        data.calendarEndMinute !== undefined &&
        data.calendarEndMinute > data.calendarStartMinute),
    { message: "End time must be after start time." }
  );

// Each field below belongs to a specific Settings section with its own
// gate, checked inside the transaction (not one blanket role check up
// front): the Appointments/Shifts form toggles stay ADMIN-only (same as
// their own settings pages, see sections.ts), while the Calendar section's
// fields (holidays, event colors, calendar hours) are gated on
// EDIT_CALENDAR_SETTINGS instead, now that that section is reachable by any
// role holding it, not just ADMIN.
export async function PUT(request: NextRequest) {
  try {
    const session = await requireTenantSession();

    const json = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { eventColors: eventColorUpdates, ...rest } = parsed.data;

    const tenant = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const touchesAdminOnlySettings =
        rest.requireClientForAppointments !== undefined ||
        rest.enableMapsNavigation !== undefined ||
        rest.showJobTypeOnShiftForm !== undefined ||
        rest.showJobEstimateOnShiftForm !== undefined ||
        rest.showColorKeyOnShiftForm !== undefined ||
        rest.allowOverlappingShifts !== undefined ||
        rest.allowEditingBookedEvents !== undefined;
      if (touchesAdminOnlySettings && session.role !== "ADMIN") throw new Error("FORBIDDEN");

      const touchesCalendarSettings =
        rest.enabledHolidayNames !== undefined ||
        rest.blockedHolidayNames !== undefined ||
        rest.calendarStartMinute !== undefined ||
        rest.calendarEndMinute !== undefined ||
        eventColorUpdates !== undefined;
      if (touchesCalendarSettings) {
        const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_CALENDAR_SETTINGS");
        if (!allowed) throw new Error("FORBIDDEN");
      }

      // Calendar hours specifically (not the rest of the Calendar section)
      // is a paid feature - see assertCalendarHoursEnabled.
      if (rest.calendarStartMinute !== undefined || rest.calendarEndMinute !== undefined) {
        await assertCalendarHoursEnabled(tx, session.tenantId);
      }

      let mergedColors: Record<string, string> | undefined;
      if (eventColorUpdates) {
        const current = await tx.tenant.findUniqueOrThrow({
          where: { id: session.tenantId! },
          select: { eventColors: true },
        });
        mergedColors = { ...resolveEventColors(current.eventColors), ...eventColorUpdates };
      }
      return tx.tenant.update({
        where: { id: session.tenantId! },
        data: { ...rest, ...(mergedColors ? { eventColors: mergedColors } : {}) },
        select: SETTINGS_SELECT,
      });
    });

    return NextResponse.json({
      settings: { ...tenant, eventColors: resolveEventColors(tenant.eventColors) },
    });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof PlanLimitError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("Failed to update tenant settings", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
