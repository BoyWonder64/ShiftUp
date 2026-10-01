import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { isValidHexColor } from "@/lib/colors/eventColors";

// Readable by anyone who can see the calendar - tags are how individual
// events get recolored, so everyone viewing needs the name/color to render
// and label them correctly.
export async function GET() {
  try {
    const session = await requireTenantSession();
    const tags = await runInTenantContext(session.tenantId, session.userId, session.role, (tx) =>
      tx.eventTag.findMany({ orderBy: { name: "asc" } })
    );
    return NextResponse.json({ tags });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    console.error("Failed to list event tags", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().refine(isValidHexColor, "Must be a #rrggbb hex color."),
});

// Gated on CREATE_APPOINTMENTS, not an ADMIN-only check - a new tag is a
// lightweight label invented on the fly while scheduling (same pattern as
// the inline "+ Add new client"), not tenant-wide branding like the 5
// built-in event colors or the logo, which stay ADMIN-only.
export async function POST(request: NextRequest) {
  try {
    const session = await requireTenantSession();
    const json = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const tag = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, "CREATE_APPOINTMENTS");
      if (!allowed) throw new Error("FORBIDDEN");
      return tx.eventTag.create({
        data: { tenantId: session.tenantId, name: parsed.data.name, color: parsed.data.color },
      });
    });

    return NextResponse.json({ tag }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to create event tag", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
