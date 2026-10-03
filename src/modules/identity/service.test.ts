import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runInSystemContext } from "@/lib/tenant-context";
import { createTenant } from "@/modules/tenancy/service";
import {
  isValidUsername,
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserByEmailOrUsername,
  getUserById,
} from "./service";

describe("isValidUsername", () => {
  it("accepts lowercase alphanumeric segments joined by single hyphens or underscores", () => {
    expect(isValidUsername("alice")).toBe(true);
    expect(isValidUsername("alice-smith")).toBe(true);
    expect(isValidUsername("alice_smith")).toBe(true);
    expect(isValidUsername("alice123")).toBe(true);
  });

  it("rejects uppercase, doubled separators, leading/trailing separators, and bad length", () => {
    expect(isValidUsername("Alice")).toBe(false);
    expect(isValidUsername("alice--smith")).toBe(false);
    expect(isValidUsername("-alice")).toBe(false);
    expect(isValidUsername("alice-")).toBe(false);
    expect(isValidUsername("al")).toBe(false); // below 3 chars
    expect(isValidUsername("a".repeat(31))).toBe(false); // above 30 chars
  });

  it("accepts the boundary lengths (3 and 30)", () => {
    expect(isValidUsername("abc")).toBe(true);
    expect(isValidUsername("a".repeat(30))).toBe(true);
  });

  it("rejects an email-shaped identifier (must never collide with findUserByEmailOrUsername's email branch)", () => {
    expect(isValidUsername("alice@example.com")).toBe(false);
  });
});

describe("createUser / findUserBy*", () => {
  let tenantId: string;
  let userId: string;
  const suffix = Date.now();
  const email = `identity-${suffix}@test.local`;
  const username = `identity-${suffix}`;

  afterAll(async () => {
    await runInSystemContext(async (tx) => {
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  it("creates a user with a hashed password (never the plaintext) and the given role", async () => {
    await runInSystemContext(async (tx) => {
      const tenant = await createTenant(tx, { name: "Test Identity Co", slug: `test-identity-${suffix}`, timezone: "UTC" });
      tenantId = tenant.id;

      const user = await createUser(tx, {
        tenantId,
        email,
        username,
        password: "super-secret-password",
        role: "STAFF",
        roleId: null,
      });
      userId = user.id;

      expect(user.email).toBe(email);
      expect(user.passwordHash).not.toBe("super-secret-password");
      expect(user.role).toBe("STAFF");
      expect(user.isOwner).toBe(false);
    });
  });

  it("findUserByEmail / findUserByUsername / getUserById all find the same user", async () => {
    await runInSystemContext(async (tx) => {
      expect((await findUserByEmail(tx, email))?.id).toBe(userId);
      expect((await findUserByUsername(tx, username))?.id).toBe(userId);
      expect((await getUserById(tx, userId))?.id).toBe(userId);
      expect(await findUserByEmail(tx, "nobody@test.local")).toBeNull();
    });
  });

  it("findUserByEmailOrUsername tries username first, then falls back to email", async () => {
    await runInSystemContext(async (tx) => {
      expect((await findUserByEmailOrUsername(tx, username))?.id).toBe(userId);
      expect((await findUserByEmailOrUsername(tx, email))?.id).toBe(userId);
      expect(await findUserByEmailOrUsername(tx, "not-a-match")).toBeNull();
    });
  });
});
