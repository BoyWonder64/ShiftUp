import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-user";
import { runInTenantContext, runInSystemContext } from "@/lib/tenant-context";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE,
  SUPPORTED_LOCALES,
} from "@/lib/auth/session";

// Every logged-in person - tenant ADMIN/STAFF or the platform SUPERADMIN -
// can set their own UI language, so this accepts all three roles rather
// than requireTenantSession (which deliberately excludes SUPERADMIN).
const patchSchema = z.object({ locale: z.enum(SUPPORTED_LOCALES) });

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN", "STAFF", "SUPERADMIN"]);
    const json = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { locale } = parsed.data;

    // A user's own row is tenant-scoped for ADMIN/STAFF (RLS requires the
    // matching tenant context) but SUPERADMIN's row has tenantId null, which
    // only runInSystemContext can see - branch on which applies, same
    // distinction requireTenantSession already draws elsewhere.
    if (session.tenantId) {
      await runInTenantContext(session.tenantId, session.userId, session.role as "ADMIN" | "STAFF", (tx) =>
        tx.user.update({ where: { id: session.userId }, data: { locale } })
      );
    } else {
      await runInSystemContext((tx) => tx.user.update({ where: { id: session.userId }, data: { locale } }));
    }

    // Re-issue the session cookie with the new locale baked in so it takes
    // effect on the very next request - next-intl's request config
    // (src/i18n/request.ts) reads locale off this cookie, not the DB, to
    // avoid a query on every single request.
    const token = createSessionToken({ ...session, locale });
    const response = NextResponse.json({ locale });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_COOKIE_MAX_AGE,
      path: "/",
    });
    return response;
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to update locale", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
