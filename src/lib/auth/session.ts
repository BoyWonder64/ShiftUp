import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "shiftup_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_SECONDS;

export type UserRole = "SUPERADMIN" | "ADMIN" | "STAFF";

export const SUPPORTED_LOCALES = ["EN", "ES", "DE", "FR"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export interface SessionPayload {
  userId: string;
  tenantId: string | null;
  role: UserRole;
  /** The tenant's custom Role id this user holds - set only when role is STAFF (see the Role model). */
  roleId: string | null;
  /** This user's own UI language preference (see User.locale) - cached in the
   * session so next-intl's request config (src/i18n/request.ts) can resolve
   * it from the signed cookie alone, no DB round trip per request. Re-issued
   * on change by PATCH /api/me/locale. */
  locale: AppLocale;
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET environment variable is not set. Generate one with `openssl rand -base64 32`."
    );
  }
  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

/** Signed, stateless session token (HMAC, not encryption - payload isn't secret, just tamper-proof). */
export function createSessionToken(payload: SessionPayload): string {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof body.exp !== "number" || body.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return {
      userId: body.userId,
      tenantId: body.tenantId ?? null,
      role: body.role,
      roleId: body.roleId ?? null,
      // Tokens issued before this field existed have no `locale` - default
      // to EN rather than invalidating every pre-existing session.
      locale: SUPPORTED_LOCALES.includes(body.locale) ? body.locale : "EN",
    };
  } catch {
    return null;
  }
}
