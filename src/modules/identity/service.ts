import type { Tx } from "@/lib/tenant-context";
import { hashPassword } from "@/lib/auth/password";

/** Only for use inside runInSystemContext - looks a user up by email across all
 * tenants, which is inherently necessary during login (the tenant isn't known
 * yet) but must never be exposed directly to a request handler outside auth. */
export async function findUserByEmail(tx: Tx, email: string) {
  return tx.user.findUnique({ where: { email } });
}

export async function getUserById(tx: Tx, id: string) {
  return tx.user.findUnique({ where: { id } });
}

export async function createUser(
  tx: Tx,
  data: {
    tenantId: string | null;
    email: string;
    password: string;
    role: "SUPERADMIN" | "ADMIN" | "MANAGER" | "SUPERVISOR" | "EMPLOYEE" | "CUSTOMER";
  }
) {
  const passwordHash = await hashPassword(data.password);
  return tx.user.create({
    data: {
      tenantId: data.tenantId,
      email: data.email,
      passwordHash,
      role: data.role,
    },
  });
}
