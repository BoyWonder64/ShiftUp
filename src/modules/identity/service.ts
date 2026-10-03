import type { Tx } from "@/lib/tenant-context";
import { hashPassword } from "@/lib/auth/password";

const USERNAME_PATTERN = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

/** Lowercase letters/numbers, single hyphens/underscores between segments - same shape as isValidSlug in the tenancy module. */
export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username) && username.length >= 3 && username.length <= 30;
}

/** Only for use inside runInSystemContext - looks a user up by email across all
 * tenants, which is inherently necessary during login (the tenant isn't known
 * yet) but must never be exposed directly to a request handler outside auth. */
export async function findUserByEmail(tx: Tx, email: string) {
  return tx.user.findUnique({ where: { email } });
}

export async function findUserByUsername(tx: Tx, username: string) {
  return tx.user.findUnique({ where: { username } });
}

/** Login accepts either - tries username first since it can never collide with a valid email's shape (no "@"), then falls back to email. */
export async function findUserByEmailOrUsername(tx: Tx, identifier: string) {
  return (await findUserByUsername(tx, identifier)) ?? (await findUserByEmail(tx, identifier));
}

export async function getUserById(tx: Tx, id: string) {
  return tx.user.findUnique({ where: { id } });
}

export async function createUser(
  tx: Tx,
  data: {
    tenantId: string | null;
    email: string;
    username: string;
    password: string;
    role: "SUPERADMIN" | "ADMIN" | "STAFF";
    /** Required when role is "STAFF" - the tenant's custom Role this user holds. Always null for ADMIN/SUPERADMIN. */
    roleId?: string | null;
    /** Only ever true for the signup/tenant-creation call site - see User.isOwner in schema.prisma. */
    isOwner?: boolean;
  }
) {
  const passwordHash = await hashPassword(data.password);
  return tx.user.create({
    data: {
      tenantId: data.tenantId,
      email: data.email,
      username: data.username,
      passwordHash,
      role: data.role,
      roleId: data.roleId ?? null,
      isOwner: data.isOwner ?? false,
    },
  });
}
