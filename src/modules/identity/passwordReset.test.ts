import { createHash } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runInSystemContext } from "@/lib/tenant-context";
import { createTenant } from "@/modules/tenancy/service";
import { createUser, getUserById } from "./service";
import { verifyPassword } from "@/lib/auth/password";
import { requestPasswordReset, confirmPasswordReset } from "./passwordReset";

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

describe("requestPasswordReset / confirmPasswordReset", () => {
  let tenantId: string;
  let userId: string;
  const suffix = Date.now();
  const email = `pwreset-${suffix}@test.local`;
  const username = `pwreset-${suffix}`;

  afterAll(async () => {
    await runInSystemContext(async (tx) => {
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  it("sets up a tenant and user", async () => {
    await runInSystemContext(async (tx) => {
      const tenant = await createTenant(tx, { name: "Test PW Reset Co", slug: `test-pwreset-${suffix}`, timezone: "UTC" });
      tenantId = tenant.id;
      const user = await createUser(tx, {
        tenantId,
        email,
        username,
        password: "original-password",
        role: "STAFF",
        roleId: null,
      });
      userId = user.id;
      expect(user.sessionVersion).toBe(0);
    });
  });

  it("returns null for an unknown email, without creating a token", async () => {
    await runInSystemContext(async (tx) => {
      const result = await requestPasswordReset(tx, "nobody@test.local");
      expect(result).toBeNull();
    });
  });

  it("issues a token for a known email, storing only its hash (not the raw value)", async () => {
    await runInSystemContext(async (tx) => {
      const result = await requestPasswordReset(tx, email);
      expect(result?.userId).toBe(userId);
      expect(result?.rawToken.length).toBeGreaterThan(20);

      const row = await tx.passwordResetToken.findUnique({ where: { tokenHash: hashToken(result!.rawToken) } });
      expect(row).not.toBeNull();
      expect(row!.tokenHash).not.toBe(result!.rawToken);
      expect(row!.usedAt).toBeNull();
    });
  });

  it("a second request invalidates the first token - only the newest one works", async () => {
    await runInSystemContext(async (tx) => {
      const first = await requestPasswordReset(tx, email);
      const second = await requestPasswordReset(tx, email);

      const unusedCount = await tx.passwordResetToken.count({ where: { userId, usedAt: null } });
      expect(unusedCount).toBe(1);

      const firstResult = await confirmPasswordReset(tx, first!.rawToken, "irrelevant-password-1");
      expect(firstResult).toBe("INVALID_OR_EXPIRED");

      // Confirm the second one actually still works and leaves the user able
      // to log in with the new password - also exercises sessionVersion
      // bumping (the "sign out everywhere" piece).
      const before = await getUserById(tx, userId);
      const secondResult = await confirmPasswordReset(tx, second!.rawToken, "brand-new-password-1");
      expect(secondResult).toBe("OK");

      const after = await getUserById(tx, userId);
      expect(after!.sessionVersion).toBe(before!.sessionVersion + 1);
      expect(await verifyPassword("brand-new-password-1", after!.passwordHash)).toBe(true);
      expect(await verifyPassword("original-password", after!.passwordHash)).toBe(false);
    });
  });

  it("a used token can't be replayed", async () => {
    await runInSystemContext(async (tx) => {
      const { rawToken } = (await requestPasswordReset(tx, email))!;
      expect(await confirmPasswordReset(tx, rawToken, "second-new-password")).toBe("OK");
      expect(await confirmPasswordReset(tx, rawToken, "yet-another-password")).toBe("INVALID_OR_EXPIRED");
    });
  });

  it("an expired token is rejected even though it's otherwise valid and unused", async () => {
    await runInSystemContext(async (tx) => {
      const rawToken = "expired-test-token";
      await tx.passwordResetToken.create({
        data: {
          userId,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      expect(await confirmPasswordReset(tx, rawToken, "should-not-apply")).toBe("INVALID_OR_EXPIRED");
    });
  });

  it("an unknown token is rejected", async () => {
    await runInSystemContext(async (tx) => {
      expect(await confirmPasswordReset(tx, "not-a-real-token", "irrelevant")).toBe("INVALID_OR_EXPIRED");
    });
  });
});
