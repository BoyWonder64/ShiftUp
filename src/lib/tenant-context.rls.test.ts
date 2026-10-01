import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runInSystemContext, runInTenantContext } from "@/lib/tenant-context";
import { createTenant } from "@/modules/tenancy/service";
import { createFreeLicense } from "@/modules/licensing/service";
import { createUser } from "@/modules/identity/service";

/**
 * Integration test against a real Postgres database (see docker-compose.yml).
 * Proves the RLS policies from prisma/migrations/*_enable_rls hold even when
 * application code forgets to filter by tenantId - the DB-level backstop
 * described in the architecture plan, not just the app-level scoping.
 */
describe("Row-Level Security tenant isolation", () => {
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    const suffix = Date.now();
    const setup = await runInSystemContext(async (tx) => {
      const tenantA = await createTenant(tx, {
        name: "RLS Test Tenant A",
        slug: `rls-test-a-${suffix}`,
        timezone: "UTC",
      });
      const tenantB = await createTenant(tx, {
        name: "RLS Test Tenant B",
        slug: `rls-test-b-${suffix}`,
        timezone: "UTC",
      });
      await createFreeLicense(tx, tenantA.id, "BOTH");
      await createFreeLicense(tx, tenantB.id, "BOTH");
      await createUser(tx, {
        tenantId: tenantA.id,
        email: `a-${suffix}@rls-test.local`,
        password: "irrelevant-not-checked-123",
        role: "ADMIN",
      });
      await createUser(tx, {
        tenantId: tenantB.id,
        email: `b-${suffix}@rls-test.local`,
        password: "irrelevant-not-checked-123",
        role: "ADMIN",
      });
      return { tenantA, tenantB };
    });
    tenantAId = setup.tenantA.id;
    tenantBId = setup.tenantB.id;
  });

  afterAll(async () => {
    await runInSystemContext(async (tx) => {
      await tx.user.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
      await tx.license.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    });
    await prisma.$disconnect();
  });

  it("returns zero rows for a plain query with no tenant context set (fail-closed default)", async () => {
    // Deliberately bypasses runInTenantContext/runInSystemContext, simulating
    // code that forgot to establish a context at all.
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM users`;
    expect(rows.length).toBe(0);
  });

  it("never returns another tenant's rows, even from a query with no tenantId filter", async () => {
    // "Buggy" on purpose: asks for tenant B's rows while scoped to tenant A.
    // If RLS weren't enforced, this would leak tenant B's data.
    const leaked = await runInTenantContext(tenantAId, "test-user", "ADMIN", (tx) =>
      tx.user.findMany({ where: { tenantId: tenantBId } })
    );
    expect(leaked).toHaveLength(0);
  });

  it("returns only the current tenant's own rows when properly scoped", async () => {
    const ownUsers = await runInTenantContext(tenantAId, "test-user", "ADMIN", (tx) =>
      tx.user.findMany()
    );
    expect(ownUsers.length).toBeGreaterThan(0);
    expect(ownUsers.every((u) => u.tenantId === tenantAId)).toBe(true);
  });

  it("system context can see rows across tenants (server-controlled operations only)", async () => {
    const allTestUsers = await runInSystemContext((tx) =>
      tx.user.findMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } })
    );
    expect(allTestUsers).toHaveLength(2);
  });
});
