import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";

// 500KB of raw image data, base64-inflated (~1.37x) plus the "data:...;base64,"
// prefix - generous for a logo, small enough to keep in a TEXT column and not
// bloat every page that renders AppHeader.
const MAX_DATA_URL_LENGTH = 700_000;
const DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;

const uploadSchema = z.object({
  dataUrl: z.string().max(MAX_DATA_URL_LENGTH).regex(DATA_URL_PATTERN, "Must be a PNG, JPEG, WebP, or SVG image."),
});

// Admin-only to change, same reasoning as the other tenant-wide settings -
// this is branding everyone in the tenant sees, not a personal preference.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN"]);
    if (!session.tenantId) throw new Error("FORBIDDEN");

    const json = await request.json().catch(() => null);
    const parsed = uploadSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid image." },
        { status: 400 }
      );
    }

    const tenant = await runInTenantContext(session.tenantId, session.userId, "ADMIN", (tx) =>
      tx.tenant.update({
        where: { id: session.tenantId! },
        data: { logoDataUrl: parsed.data.dataUrl },
        select: { logoDataUrl: true },
      })
    );

    return NextResponse.json({ tenant });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to update tenant logo", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await requireRole(["ADMIN"]);
    if (!session.tenantId) throw new Error("FORBIDDEN");

    const tenant = await runInTenantContext(session.tenantId, session.userId, "ADMIN", (tx) =>
      tx.tenant.update({
        where: { id: session.tenantId! },
        data: { logoDataUrl: null },
        select: { logoDataUrl: true },
      })
    );

    return NextResponse.json({ tenant });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to remove tenant logo", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
