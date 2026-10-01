import "server-only";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  type SessionPayload,
  verifySessionToken,
} from "./session";
import type { TenantRole } from "@/lib/tenant-context";

/** Reads and verifies the session cookie for the current request. Returns null if absent/invalid/expired. */
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
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
}> {
  const session = await getCurrentSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (session.role === "SUPERADMIN" || !session.tenantId) throw new Error("FORBIDDEN");
  return { userId: session.userId, tenantId: session.tenantId, role: session.role };
}
