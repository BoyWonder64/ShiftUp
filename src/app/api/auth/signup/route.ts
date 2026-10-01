import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runInSystemContext } from "@/lib/tenant-context";
import { getTenantBySlug, createTenant, isValidSlug } from "@/modules/tenancy/service";
import { createFreeLicense } from "@/modules/licensing/service";
import { createUser, findUserByEmail, findUserByUsername, isValidUsername } from "@/modules/identity/service";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE,
} from "@/lib/auth/session";

const signupSchema = z.object({
  businessName: z.string().min(2).max(200),
  slug: z.string().min(3).max(63),
  timezone: z.string().min(1).max(100).default("UTC"),
  email: z.string().email(),
  username: z.string().min(3).max(30),
  password: z.string().min(8).max(200),
  // Which module(s) to explore - separate from billing plan, which is
  // always FREE at signup (see createFreeLicense) until Phase 3 checkout exists.
  featureTier: z.enum(["SHIFT_MANAGEMENT", "APPOINTMENT_MANAGER", "BOTH"]),
});

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { businessName, slug, timezone, email, username, password, featureTier } = parsed.data;

  if (!isValidSlug(slug)) {
    return NextResponse.json(
      { error: "Slug must be lowercase letters, numbers, and hyphens only." },
      { status: 400 }
    );
  }
  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: "Username must be 3-30 characters: lowercase letters, numbers, - and _ only." },
      { status: 400 }
    );
  }

  try {
    const result = await runInSystemContext(async (tx) => {
      const existingTenant = await getTenantBySlug(tx, slug);
      if (existingTenant) throw new Error("SLUG_TAKEN");

      const existingUser = await findUserByEmail(tx, email);
      if (existingUser) throw new Error("EMAIL_TAKEN");

      const existingUsername = await findUserByUsername(tx, username);
      if (existingUsername) throw new Error("USERNAME_TAKEN");

      const tenant = await createTenant(tx, { name: businessName, slug, timezone });
      await createFreeLicense(tx, tenant.id, featureTier);
      const user = await createUser(tx, {
        tenantId: tenant.id,
        email,
        username,
        password,
        role: "ADMIN",
      });

      return { tenant, user };
    });

    const token = createSessionToken({
      userId: result.user.id,
      tenantId: result.tenant.id,
      role: "ADMIN",
    });

    const response = NextResponse.json({ tenantSlug: result.tenant.slug }, { status: 201 });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_COOKIE_MAX_AGE,
      path: "/",
    });
    return response;
  } catch (err) {
    if (err instanceof Error && err.message === "SLUG_TAKEN") {
      return NextResponse.json(
        { error: "That business URL is already taken." },
        { status: 409 }
      );
    }
    if (err instanceof Error && err.message === "EMAIL_TAKEN") {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }
    if (err instanceof Error && err.message === "USERNAME_TAKEN") {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    console.error("Signup failed", err);
    return NextResponse.json({ error: "Signup failed. Please try again." }, { status: 500 });
  }
}
