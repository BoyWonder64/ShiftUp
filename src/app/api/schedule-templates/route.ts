import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { assertScheduleTemplatesEnabled, PlanLimitError } from "@/lib/licensing/limits";
import { listTemplates, createTemplate } from "@/modules/scheduling/templates";

export async function GET() {
  try {
    const session = await requireTenantSession();
    const templates = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "VIEW_SCHEDULE_TEMPLATES");
      if (!allowed) throw new Error("FORBIDDEN");
      await assertScheduleTemplatesEnabled(tx, session.tenantId);
      return listTemplates(tx, session.tenantId);
    });
    return NextResponse.json({ templates });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof PlanLimitError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("Failed to list schedule templates", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  periodLengthDays: z.number().int().min(1).max(90),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireTenantSession();
    const json = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const template = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "CREATE_SCHEDULE_TEMPLATES");
      if (!allowed) throw new Error("FORBIDDEN");
      await assertScheduleTemplatesEnabled(tx, session.tenantId);
      return createTemplate(tx, session.tenantId, parsed.data);
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof PlanLimitError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("Failed to create schedule template", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
