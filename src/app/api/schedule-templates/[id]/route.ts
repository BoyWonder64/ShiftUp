import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { assertScheduleTemplatesEnabled, PlanLimitError } from "@/lib/licensing/limits";
import { getTemplate, updateTemplate, deleteTemplate } from "@/modules/scheduling/templates";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    const template = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "VIEW_SCHEDULE_TEMPLATES");
      if (!allowed) throw new Error("FORBIDDEN");
      await assertScheduleTemplatesEnabled(tx, session.tenantId);
      const template = await getTemplate(tx, session.tenantId, id);
      if (!template) throw new Error("NOT_FOUND");
      return template;
    });
    return NextResponse.json({ template });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (err instanceof PlanLimitError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("Failed to load schedule template", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  periodLengthDays: z.number().int().min(1).max(90).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    const json = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const template = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_SCHEDULE_TEMPLATES");
      if (!allowed) throw new Error("FORBIDDEN");
      await assertScheduleTemplatesEnabled(tx, session.tenantId);
      return updateTemplate(tx, session.tenantId, id, parsed.data);
    });

    return NextResponse.json({ template });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (err instanceof Error && err.message === "PERIOD_TOO_SHORT") {
      return NextResponse.json(
        { error: "Remove or move shifts beyond the new period length before shortening it." },
        { status: 400 }
      );
    }
    if (err instanceof PlanLimitError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("Failed to update schedule template", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();

    await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "DELETE_SCHEDULE_TEMPLATES");
      if (!allowed) throw new Error("FORBIDDEN");
      await assertScheduleTemplatesEnabled(tx, session.tenantId);
      await deleteTemplate(tx, session.tenantId, id);
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (err instanceof PlanLimitError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("Failed to delete schedule template", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
