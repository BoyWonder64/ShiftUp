import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { EVENT_COLOR_KEYS, isValidHexColor, resolveEventColors } from "@/lib/colors/eventColors";

const SETTINGS_SELECT = {
  requireClientForAppointments: true,
  enableMapsNavigation: true,
  eventColors: true,
  showFederalHolidays: true,
  showJobTypeOnShiftForm: true,
  showJobEstimateOnShiftForm: true,
  showColorKeyOnShiftForm: true,
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
    showFederalHolidays: z.boolean(),
    showJobTypeOnShiftForm: z.boolean(),
    showJobEstimateOnShiftForm: z.boolean(),
    showColorKeyOnShiftForm: z.boolean(),
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
  .partial();

// Changing how the form/calendar behaves for everyone else is an ADMIN-only
// action - same reasoning as the permission matrix.
export async function PUT(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN"]);
    if (!session.tenantId) throw new Error("FORBIDDEN");

    const json = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { eventColors: eventColorUpdates, ...rest } = parsed.data;

    const tenant = await runInTenantContext(session.tenantId, session.userId, "ADMIN", async (tx) => {
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
    console.error("Failed to update tenant settings", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
