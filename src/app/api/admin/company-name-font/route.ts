import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { COMPANY_NAME_FONT_KEYS } from "@/lib/fonts/companyNameFonts";

const updateSchema = z.object({
  // null clears the override and falls back to the default body font.
  font: z.enum(COMPANY_NAME_FONT_KEYS).nullable(),
});

// Admin-only to change, same reasoning as the other tenant-wide branding
// settings (logo) - this affects what everyone in the tenant sees.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN"]);
    if (!session.tenantId) throw new Error("FORBIDDEN");

    const json = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid font." },
        { status: 400 }
      );
    }

    const tenant = await runInTenantContext(session.tenantId, session.userId, "ADMIN", (tx) =>
      tx.tenant.update({
        where: { id: session.tenantId! },
        data: { companyNameFont: parsed.data.font },
        select: { companyNameFont: true },
      })
    );

    return NextResponse.json({ tenant });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to update tenant company name font", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
