import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runInSystemContext } from "@/lib/tenant-context";
import { createTestTenant } from "@/lib/test-support/fixtures";
import { assertCustomCalendarEnabled, PlanLimitError } from "./limits";

/** Integration tests against a real Postgres database, run inside
 * runInSystemContext to bypass RLS - this suite exercises the plan-gate
 * logic itself, not tenant isolation (see tenant-context.rls.test.ts for
 * that). */
describe("licensing/limits", () => {
  let tenantId: string;

  beforeAll(async () => {
    await runInSystemContext(async (tx) => {
      // createTestTenant always seeds a FREE license (see fixtures.ts) - the
      // right starting point for these tests, which flip billingPlan per case.
      tenantId = (await createTestTenant(tx, "limits")).id;
    });
  });

  afterAll(async () => {
    await runInSystemContext(async (tx) => {
      await tx.customCalendar.deleteMany({ where: { tenantId } });
      await tx.license.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  describe("assertCustomCalendarEnabled", () => {
    it("throws PlanLimitError on the FREE plan", async () => {
      await runInSystemContext(async (tx) => {
        await tx.license.update({ where: { tenantId }, data: { billingPlan: "FREE" } });
        await expect(assertCustomCalendarEnabled(tx, tenantId)).rejects.toThrow(PlanLimitError);
      });
    });

    it("passes on a ONE_TIME plan", async () => {
      await runInSystemContext(async (tx) => {
        await tx.license.update({ where: { tenantId }, data: { billingPlan: "ONE_TIME" } });
        await expect(assertCustomCalendarEnabled(tx, tenantId)).resolves.toBeUndefined();
      });
    });

    it("passes on a SUBSCRIPTION plan", async () => {
      await runInSystemContext(async (tx) => {
        await tx.license.update({ where: { tenantId }, data: { billingPlan: "SUBSCRIPTION" } });
        await expect(assertCustomCalendarEnabled(tx, tenantId)).resolves.toBeUndefined();
      });
    });
  });
});
