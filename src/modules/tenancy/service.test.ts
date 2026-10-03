import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runInSystemContext } from "@/lib/tenant-context";
import { createTenant, getTenantBySlug, isValidSlug } from "./service";

describe("isValidSlug", () => {
  it("accepts lowercase alphanumeric segments joined by single hyphens", () => {
    expect(isValidSlug("acme")).toBe(true);
    expect(isValidSlug("acme-corp")).toBe(true);
    expect(isValidSlug("acme-corp-2")).toBe(true);
  });

  it("rejects uppercase, double hyphens, leading/trailing hyphens, and bad length", () => {
    expect(isValidSlug("Acme")).toBe(false);
    expect(isValidSlug("acme--corp")).toBe(false);
    expect(isValidSlug("-acme")).toBe(false);
    expect(isValidSlug("acme-")).toBe(false);
    expect(isValidSlug("ab")).toBe(false); // below 3 chars
    expect(isValidSlug("a".repeat(64))).toBe(false); // above 63 chars
  });

  it("accepts the boundary lengths (3 and 63)", () => {
    expect(isValidSlug("abc")).toBe(true);
    expect(isValidSlug("a".repeat(63))).toBe(true);
  });
});

describe("createTenant / getTenantBySlug", () => {
  let tenantId: string | undefined;

  afterAll(async () => {
    if (tenantId) {
      await runInSystemContext(async (tx) => {
        await tx.tenant.delete({ where: { id: tenantId! } });
      });
    }
    await prisma.$disconnect();
  });

  it("creates a tenant and finds it again by slug; a nonexistent slug returns null", async () => {
    await runInSystemContext(async (tx) => {
      const slug = `test-tenancy-${Date.now()}`;
      const tenant = await createTenant(tx, { name: "Test Tenancy Co", slug, timezone: "UTC" });
      tenantId = tenant.id;

      const found = await getTenantBySlug(tx, slug);
      expect(found?.id).toBe(tenant.id);
      expect(await getTenantBySlug(tx, `${slug}-does-not-exist`)).toBeNull();
    });
  });
});
