import { randomBytes, createHash } from "node:crypto";
import type { Tx } from "@/lib/tenant-context";
import { hashPassword } from "@/lib/auth/password";
import { findUserByEmail } from "./service";

const TOKEN_BYTES = 32;
const TOKEN_TTL_MINUTES = 30;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Only for use inside runInSystemContext (same reasoning as findUserByEmail -
 * this must work before the caller's tenant is known). Issues a fresh
 * single-use reset token for whoever owns `email`, invalidating any earlier
 * unused tokens of theirs first so only the most recently requested link
 * ever works. Returns null when no such user exists - the route handler
 * must still respond with the same generic "check your email" message
 * either way, so this can't be used to enumerate which emails have accounts.
 */
export async function requestPasswordReset(
  tx: Tx,
  email: string
): Promise<{ userId: string; rawToken: string } | null> {
  const user = await findUserByEmail(tx, email);
  if (!user) return null;

  await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

  const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
  await tx.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
    },
  });
  return { userId: user.id, rawToken };
}

export type ConfirmPasswordResetResult = "OK" | "INVALID_OR_EXPIRED";

/**
 * Only for use inside runInSystemContext. Consumes a reset token: rejects an
 * unknown/expired/already-used one, otherwise sets the new password, bumps
 * sessionVersion (signs the user out of every other session - see
 * User.sessionVersion's doc comment), and marks the token used so it can't
 * be replayed within its own expiry window.
 */
export async function confirmPasswordReset(
  tx: Tx,
  rawToken: string,
  newPassword: string
): Promise<ConfirmPasswordResetResult> {
  const record = await tx.passwordResetToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return "INVALID_OR_EXPIRED";
  }

  const passwordHash = await hashPassword(newPassword);
  await tx.user.update({
    where: { id: record.userId },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
  await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  return "OK";
}
