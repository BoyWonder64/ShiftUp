import type { Tx } from "@/lib/tenant-context";
import { createTenant } from "@/modules/tenancy/service";
import { createFreeLicense } from "@/modules/licensing/service";
import { createUser } from "@/modules/identity/service";

/**
 * Shared DB fixture builders for integration tests that exercise service-layer
 * logic against a real Postgres instance (see tenant-context.rls.test.ts for
 * the original pattern this follows). Every builder must be called from
 * inside runInSystemContext/runInTenantContext, same as the service functions
 * they wrap - they do no context handling of their own.
 */

/** Short, collision-resistant suffix for names/slugs/usernames/emails - safe to call many times per test file, even across parallel test files. */
export function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export async function createTestTenant(tx: Tx, label: string) {
  const suffix = shortId();
  const tenant = await createTenant(tx, {
    name: `Test Tenant ${label} ${suffix}`,
    slug: `test-${label}-${suffix}`,
    timezone: "UTC",
  });
  await createFreeLicense(tx, tenant.id, "BOTH");
  return tenant;
}

export async function createTestRole(tx: Tx, tenantId: string, name: string, level = 0) {
  return tx.role.create({ data: { tenantId, name: `${name}-${shortId()}`, level } });
}

/** A STAFF user with an attached StaffProfile, holding `roleId`. */
export async function createTestStaff(tx: Tx, tenantId: string, roleId: string | null, label: string) {
  const suffix = shortId();
  const user = await createUser(tx, {
    tenantId,
    email: `${label}-${suffix}@test.local`,
    username: `${label}-${suffix}`,
    password: "irrelevant-not-checked-123",
    role: "STAFF",
    roleId,
  });
  const staffProfile = await tx.staffProfile.create({
    data: { tenantId, userId: user.id, displayName: `${label} ${suffix}` },
  });
  return { user, staffProfile };
}

export async function createTestClient(tx: Tx, tenantId: string, label: string) {
  return tx.client.create({
    data: { tenantId, name: `${label} ${shortId()}`, isGuest: true },
  });
}
