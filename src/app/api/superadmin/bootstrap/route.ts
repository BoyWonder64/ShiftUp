import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runInSystemContext } from "@/lib/tenant-context";
import { createUser, findUserByEmail, findUserByUsername, isValidUsername } from "@/modules/identity/service";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE } from "@/lib/auth/session";

/**
 * One-time setup for the platform's own SUPERADMIN account - there's no
 * signup flow for this (only a tenant ADMIN can self-signup), so this is the
 * "an account that I setup" path from TODO.md's dev-role request. Gated by a
 * server-only secret (SUPERADMIN_SETUP_SECRET, see .env.example), and
 * self-disables permanently once a SUPERADMIN exists - not reusable to create
 * a second one, and not usable at all if the secret was never configured.
 */

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const bootstrapSchema = z.object({
  secret: z.string().min(1),
  email: z.string().email(),
  username: z.string().min(3).max(30),
  password: z.string().min(8).max(200),
});

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.SUPERADMIN_SETUP_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bootstrapSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { secret, email, username, password } = parsed.data;

  if (!secretMatches(secret, expectedSecret)) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }
  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: "Username must be 3-30 characters: lowercase letters, numbers, - and _ only." },
      { status: 400 }
    );
  }

  try {
    const result = await runInSystemContext(async (tx) => {
      const existingSuperadmin = await tx.user.findFirst({ where: { role: "SUPERADMIN" } });
      if (existingSuperadmin) throw new Error("ALREADY_BOOTSTRAPPED");

      const existingEmail = await findUserByEmail(tx, email);
      if (existingEmail) throw new Error("EMAIL_TAKEN");

      const existingUsername = await findUserByUsername(tx, username);
      if (existingUsername) throw new Error("USERNAME_TAKEN");

      return createUser(tx, { tenantId: null, email, username, password, role: "SUPERADMIN" });
    });

    const token = createSessionToken({
      userId: result.id,
      tenantId: null,
      role: "SUPERADMIN",
      roleId: null,
      locale: result.locale,
      sessionVersion: result.sessionVersion,
    });

    const response = NextResponse.json({ ok: true }, { status: 201 });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_COOKIE_MAX_AGE,
      path: "/",
    });
    return response;
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_BOOTSTRAPPED") {
      return NextResponse.json({ error: "A superadmin account already exists." }, { status: 409 });
    }
    if (err instanceof Error && err.message === "EMAIL_TAKEN") {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    if (err instanceof Error && err.message === "USERNAME_TAKEN") {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    console.error("Superadmin bootstrap failed", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
