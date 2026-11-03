import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { assertScheduleTemplatesEnabled, PlanLimitError } from "@/lib/licensing/limits";
import {
  planTemplateApply,
  applyTemplate,
  planTemplateApplyRepeating,
  applyTemplateRepeating,
  MAX_TEMPLATE_APPLY_OCCURRENCES,
} from "@/modules/scheduling/templates";

const applySchema = z.object({
  periodStart: z.string().datetime(),
  // true = preview only, nothing written - the manager confirms before any
  // real shift is created. See TODO.md's conflict-handling decision: preview
  // first, then apply skips whatever's still flagged rather than blocking
  // the whole run.
  dryRun: z.boolean().default(true),
  // How many back-to-back periods to generate in one go (TODO.md: "repeat
  // the template"). 1 = today's single-period behavior.
  occurrences: z.number().int().min(1).max(MAX_TEMPLATE_APPLY_OCCURRENCES).default(1),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    const json = await request.json().catch(() => null);
    const parsed = applySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const periodStart = new Date(parsed.data.periodStart);

    const payload = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "APPLY_SCHEDULE_TEMPLATES");
      if (!allowed) throw new Error("FORBIDDEN");
      await assertScheduleTemplatesEnabled(tx, session.tenantId);

      const { occurrences } = parsed.data;
      if (occurrences > 1) {
        if (parsed.data.dryRun) {
          const plan = await planTemplateApplyRepeating(tx, session.tenantId, id, periodStart, occurrences);
          return { plan };
        }
        const result = await applyTemplateRepeating(tx, session.tenantId, id, periodStart, occurrences, session.userId);
        return { result };
      }

      if (parsed.data.dryRun) {
        const plan = await planTemplateApply(tx, session.tenantId, id, periodStart);
        return { plan };
      }
      const result = await applyTemplate(tx, session.tenantId, id, periodStart, session.userId);
      return { result };
    });

    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }
    if (err instanceof PlanLimitError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("Failed to apply schedule template", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
