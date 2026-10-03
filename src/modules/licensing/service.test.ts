import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runInSystemContext } from "@/lib/tenant-context";
import { createTenant } from "@/modules/tenancy/service";
import { createFreeLicense, setLicensePlan } from "./service";

describe("licensing/service", () => {
  let tenantId: string;

  beforeAll(async () => {
    await runInSystemContext(async (tx) => {
      const tenant = await createTenant(tx, {
        name: "Test Tenant licensing",
        slug: `test-licensing-${Date.now()}`,
        timezone: "UTC",
      });
      tenantId = tenant.id;
    });
  });

  afterAll(async () => {
    await runInSystemContext(async (tx) => {
      await tx.license.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  it("createFreeLicense starts a tenant on FREE/ACTIVE with the given tier", async () => {
    await runInSystemContext(async (tx) => {
      const license = await createFreeLicense(tx, tenantId, "BOTH");
      expect(license.billingPlan).toBe("FREE");
      expect(license.status).toBe("ACTIVE");
      expect(license.tier).toBe("BOTH");
    });
  });

  it("setLicensePlan updates billingPlan/status directly, bypassing Stripe", async () => {
    await runInSystemContext(async (tx) => {
      const updated = await setLicensePlan(tx, tenantId, {
        billingPlan: "SUBSCRIPTION",
        status: "ACTIVE",
      });
      expect(updated.billingPlan).toBe("SUBSCRIPTION");
      expect(updated.status).toBe("ACTIVE");
    });
  });
});
