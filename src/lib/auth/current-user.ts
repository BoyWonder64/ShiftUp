import "server-only";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  type SessionPayload,
  verifySessionToken,
} from "./session";
import { runInSystemContext, runInTenantContext, type TenantRole } from "@/lib/tenant-context";

/**
 * The live User.sessionVersion this token's userId currently has, or null if
 * the user no longer exists. One extra DB round trip per getCurrentSession
 * call - the cost of actually being able to revoke a stateless, signed
 * session before its 7-day expiry (see User.sessionVersion's doc comment).
 * RLS means this can't be a bare prisma call - `users` is tenant-scoped, so
 * reading it at all requires the matching tenant/system context, same as
 * every other query in this app.
 */
async function getLiveSessionVersion(payload: SessionPayload): Promise<number | null> {
  const row = await (payload.tenantId
    ? runInTenantContext(payload.tenantId, payload.userId, payload.role as TenantRole, (tx) =>
        tx.user.findUnique({ where: { id: payload.userId }, select: { sessionVersion: true } })
      )
    : runInSystemContext((tx) =>
        tx.user.findUnique({ where: { id: payload.userId }, select: { sessionVersion: true } })
      ));
  return row?.sessionVersion ?? null;
}

/**
 * Reads and verifies the session cookie for the current request. Returns
 * null if absent/invalid/expired, or if the token's sessionVersion is stale
 * (a password reset happened since it was issued - see User.sessionVersion).
 */
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;

  const liveVersion = await getLiveSessionVersion(payload);
  if (liveVersion === null || liveVersion !== payload.sessionVersion) return null;

  return payload;
}

/** Throws if there's no valid session, or if the session's role isn't in allowedRoles. */
export async function requireRole(
  allowedRoles: Array<SessionPayload["role"]>
): Promise<SessionPayload> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }
  if (!allowedRoles.includes(session.role)) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

/** Like getCurrentSession, but throws unless the session belongs to a real tenant user (not SUPERADMIN, not logged out). */
export async function requireTenantSession(): Promise<{
  userId: string;
  tenantId: string;
  role: TenantRole;
  /** The tenant's custom Role id this user holds - null for ADMIN, required for STAFF. */
  roleId: string | null;
}> {
  const session = await getCurrentSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (session.role === "SUPERADMIN" || !session.tenantId) throw new Error("FORBIDDEN");
  return { userId: session.userId, tenantId: session.tenantId, role: session.role, roleId: session.roleId };
}
