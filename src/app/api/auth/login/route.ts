import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runInSystemContext } from "@/lib/tenant-context";
import { findUserByEmailOrUsername } from "@/modules/identity/service";
import { verifyPassword } from "@/lib/auth/password";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE,
} from "@/lib/auth/session";

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { identifier, password } = parsed.data;

  const user = await runInSystemContext((tx) => findUserByEmailOrUsername(tx, identifier));

  // Same error for "no such user" and "wrong password" - don't leak which one.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email/username or password." }, { status: 401 });
  }

  const token = createSessionToken({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
  });

  const response = NextResponse.json(
    { tenantId: user.tenantId, role: user.role },
    { status: 200 }
  );
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: "/",
  });
  return response;
}
