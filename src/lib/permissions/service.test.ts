import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runInSystemContext } from "@/lib/tenant-context";
import { createTestTenant, createTestRole } from "@/lib/test-support/fixtures";
import {
  hasPermission,
  hasPermissionByRoleId,
  canManageRoleAssignment,
  canActOnStaffMember,
  canViewRole,
  canViewRoleById,
  listTenantRoles,
  setRolePermission,
  setRoleVisibility,
  seedDefaultRolesForTenant,
  getEffectivePermissionMatrix,
  getEffectiveVisibilityMatrix,
} from "./service";
import { DEFAULT_STARTER_ROLE_PERMISSIONS, DEFAULT_STARTER_ROLE_VISIBILITY } from "./catalog";

/** Integration tests against a real Postgres database - every call runs
 * inside runInSystemContext to bypass RLS, since this suite is exercising the
 * permission-logic layer itself, not tenant isolation (see
 * tenant-context.rls.test.ts for that). */
describe("permissions/service", () => {
  let tenantId: string;
  let otherTenantId: string;

  beforeAll(async () => {
    await runInSystemContext(async (tx) => {
      tenantId = (await createTestTenant(tx, "perm")).id;
      otherTenantId = (await createTestTenant(tx, "perm-other")).id;
    });
  });

  afterAll(async () => {
    await runInSystemContext(async (tx) => {
      await tx.role.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
      await tx.license.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    });
    await prisma.$disconnect();
  });

  describe("hasPermission / hasPermissionByRoleId", () => {
    it("ADMIN and SUPERADMIN always have every permission, even with no roleId", async () => {
      await runInSystemContext(async (tx) => {
        expect(await hasPermission(tx, tenantId, "ADMIN", null, "VIEW_STAFF")).toBe(true);
        expect(await hasPermission(tx, tenantId, "SUPERADMIN", null, "DELETE_STAFF")).toBe(true);
      });
    });

    it("STAFF with no roleId is denied", async () => {
      await runInSystemContext(async (tx) => {
        expect(await hasPermission(tx, tenantId, "STAFF", null, "VIEW_STAFF")).toBe(false);
        expect(await hasPermissionByRoleId(tx, tenantId, null, "VIEW_STAFF")).toBe(false);
      });
    });

    it("a role with no RolePermission row denies (no hardcoded default)", async () => {
      await runInSystemContext(async (tx) => {
        const role = await createTestRole(tx, tenantId, "Fresh");
        expect(await hasPermissionByRoleId(tx, tenantId, role.id, "VIEW_STAFF")).toBe(false);
        expect(await hasPermission(tx, tenantId, "STAFF", role.id, "VIEW_STAFF")).toBe(false);
      });
    });

    it("reflects whatever setRolePermission last wrote, for that exact key", async () => {
      await runInSystemContext(async (tx) => {
        const role = await createTestRole(tx, tenantId, "Togglable");
        await setRolePermission(tx, tenantId, role.id, "VIEW_STAFF", true);
        expect(await hasPermissionByRoleId(tx, tenantId, role.id, "VIEW_STAFF")).toBe(true);
        expect(await hasPermissionByRoleId(tx, tenantId, role.id, "EDIT_STAFF")).toBe(false);

        await setRolePermission(tx, tenantId, role.id, "VIEW_STAFF", false);
        expect(await hasPermissionByRoleId(tx, tenantId, role.id, "VIEW_STAFF")).toBe(false);
      });
    });
  });

  describe("canManageRoleAssignment", () => {
    it("ADMIN/SUPERADMIN can always manage role assignment", async () => {
      await runInSystemContext(async (tx) => {
        const role = await createTestRole(tx, tenantId, "Target");
        expect(await canManageRoleAssignment(tx, tenantId, "ADMIN", null, null, role.id)).toBe(true);
        expect(await canManageRoleAssignment(tx, tenantId, "SUPERADMIN", null, null, role.id)).toBe(true);
      });
    });

    it("a STAFF actor with no roleId can never manage assignment", async () => {
      await runInSystemContext(async (tx) => {
        const role = await createTestRole(tx, tenantId, "Target");
        expect(await canManageRoleAssignment(tx, tenantId, "STAFF", null, null, role.id)).toBe(false);
      });
    });

    it("an actor can assign a role strictly below their own level", async () => {
      await runInSystemContext(async (tx) => {
        const actorRole = await createTestRole(tx, tenantId, "High", 30);
        const newRole = await createTestRole(tx, tenantId, "Low", 10);
        expect(await canManageRoleAssignment(tx, tenantId, "STAFF", actorRole.id, null, newRole.id)).toBe(true);
      });
    });

    it("an actor cannot assign a role at or above their own level", async () => {
      await runInSystemContext(async (tx) => {
        const actorRole = await createTestRole(tx, tenantId, "Mid", 20);
        const sameLevel = await createTestRole(tx, tenantId, "SameLevel", 20);
        const higherLevel = await createTestRole(tx, tenantId, "Higher", 30);
        expect(await canManageRoleAssignment(tx, tenantId, "STAFF", actorRole.id, null, sameLevel.id)).toBe(false);
        expect(await canManageRoleAssignment(tx, tenantId, "STAFF", actorRole.id, null, higherLevel.id)).toBe(false);
      });
    });

    it("an actor cannot reassign someone currently holding a role at or above their own level (blocks self-reassignment for free)", async () => {
      await runInSystemContext(async (tx) => {
        const actorRole = await createTestRole(tx, tenantId, "Mid", 20);
        const lowRole = await createTestRole(tx, tenantId, "Low", 10);
        // Target currently holds the actor's own role - actor can't outrank that.
        expect(
          await canManageRoleAssignment(tx, tenantId, "STAFF", actorRole.id, actorRole.id, lowRole.id)
        ).toBe(false);
      });
    });

    it("a role id from a different tenant is treated as non-existent (-Infinity level)", async () => {
      await runInSystemContext(async (tx) => {
        const actorRole = await createTestRole(tx, tenantId, "Actor", 10);
        const foreignRole = await createTestRole(tx, otherTenantId, "Foreign", 999);
        // The foreign role's level is -Infinity *within tenantId*, so the actor (level 10) outranks it.
        expect(
          await canManageRoleAssignment(tx, tenantId, "STAFF", actorRole.id, null, foreignRole.id)
        ).toBe(true);
        // A foreign role can never be the *actor's* role either - -Infinity can't outrank anything.
        const realRole = await createTestRole(tx, tenantId, "Real", 5);
        expect(
          await canManageRoleAssignment(tx, tenantId, "STAFF", foreignRole.id, null, realRole.id)
        ).toBe(false);
      });
    });
  });

  describe("canActOnStaffMember", () => {
    it("ADMIN/SUPERADMIN can always act on staff", async () => {
      await runInSystemContext(async (tx) => {
        expect(await canActOnStaffMember(tx, tenantId, "ADMIN", null, "STAFF", null)).toBe(true);
      });
    });

    it("no STAFF actor, no matter their permissions, can act on an ADMIN/SUPERADMIN target", async () => {
      await runInSystemContext(async (tx) => {
        const actorRole = await createTestRole(tx, tenantId, "TopDog", 999);
        expect(await canActOnStaffMember(tx, tenantId, "STAFF", actorRole.id, "ADMIN", null)).toBe(false);
        expect(await canActOnStaffMember(tx, tenantId, "STAFF", actorRole.id, "SUPERADMIN", null)).toBe(false);
      });
    });

    it("a STAFF actor must outrank the target's current role", async () => {
      await runInSystemContext(async (tx) => {
        const actorRole = await createTestRole(tx, tenantId, "Actor", 20);
        const lowerRole = await createTestRole(tx, tenantId, "Lower", 10);
        const sameRole = await createTestRole(tx, tenantId, "Same", 20);
        expect(await canActOnStaffMember(tx, tenantId, "STAFF", actorRole.id, "STAFF", lowerRole.id)).toBe(true);
        expect(await canActOnStaffMember(tx, tenantId, "STAFF", actorRole.id, "STAFF", sameRole.id)).toBe(false);
      });
    });

    it("denies when either side is missing a roleId", async () => {
      await runInSystemContext(async (tx) => {
        const actorRole = await createTestRole(tx, tenantId, "Actor", 20);
        expect(await canActOnStaffMember(tx, tenantId, "STAFF", null, "STAFF", actorRole.id)).toBe(false);
        expect(await canActOnStaffMember(tx, tenantId, "STAFF", actorRole.id, "STAFF", null)).toBe(false);
      });
    });
  });

  describe("canViewRole / canViewRoleById", () => {
    it("a role always sees its own data, even with no RoleVisibility row", async () => {
      await runInSystemContext(async (tx) => {
        const role = await createTestRole(tx, tenantId, "Solo");
        expect(await canViewRoleById(tx, tenantId, role.id, role.id)).toBe(true);
      });
    });

    it("a missing RoleVisibility row denies", async () => {
      await runInSystemContext(async (tx) => {
        const viewer = await createTestRole(tx, tenantId, "Viewer");
        const target = await createTestRole(tx, tenantId, "Target");
        expect(await canViewRoleById(tx, tenantId, viewer.id, target.id)).toBe(false);
      });
    });

    it("reflects whatever setRoleVisibility last wrote", async () => {
      await runInSystemContext(async (tx) => {
        const viewer = await createTestRole(tx, tenantId, "Viewer");
        const target = await createTestRole(tx, tenantId, "Target");
        await setRoleVisibility(tx, tenantId, viewer.id, target.id, true);
        expect(await canViewRoleById(tx, tenantId, viewer.id, target.id)).toBe(true);
        await setRoleVisibility(tx, tenantId, viewer.id, target.id, false);
        expect(await canViewRoleById(tx, tenantId, viewer.id, target.id)).toBe(false);
      });
    });

    it("ADMIN/SUPERADMIN viewers see every role; nobody sees an ADMIN/SUPERADMIN target", async () => {
      await runInSystemContext(async (tx) => {
        const role = await createTestRole(tx, tenantId, "Whatever");
        expect(await canViewRole(tx, tenantId, "ADMIN", null, "STAFF", role.id)).toBe(true);
        expect(await canViewRole(tx, tenantId, "STAFF", role.id, "ADMIN", null)).toBe(false);
      });
    });
  });

  describe("seedDefaultRolesForTenant", () => {
    it("creates the 4 starter roles with the expected levels, reporting chain, permissions, and visibility", async () => {
      await runInSystemContext(async (tx) => {
        const tenant = await createTestTenant(tx, "seed");
        const idByName = await seedDefaultRolesForTenant(tx, tenant.id);

        expect(Object.keys(idByName).sort()).toEqual(["Customer", "Employee", "Manager", "Supervisor"].sort());

        const roles = await tx.role.findMany({ where: { tenantId: tenant.id } });
        const byId = new Map(roles.map((r) => [r.id, r]));

        expect(byId.get(idByName.Manager)?.level).toBe(30);
        expect(byId.get(idByName.Supervisor)?.level).toBe(20);
        expect(byId.get(idByName.Employee)?.level).toBe(10);
        expect(byId.get(idByName.Customer)?.level).toBe(10);

        expect(byId.get(idByName.Employee)?.reportsToId).toBe(idByName.Supervisor);
        expect(byId.get(idByName.Supervisor)?.reportsToId).toBe(idByName.Manager);
        expect(byId.get(idByName.Manager)?.reportsToId).toBeNull();
        expect(byId.get(idByName.Customer)?.reportsToId).toBeNull();

        // Spot-check permissions against the catalog defaults for each starter role.
        expect(await hasPermissionByRoleId(tx, tenant.id, idByName.Manager, "DELETE_STAFF")).toBe(
          DEFAULT_STARTER_ROLE_PERMISSIONS.Manager.DELETE_STAFF
        );
        expect(await hasPermissionByRoleId(tx, tenant.id, idByName.Employee, "CREATE_SHIFTS")).toBe(
          DEFAULT_STARTER_ROLE_PERMISSIONS.Employee.CREATE_SHIFTS
        );
        expect(await hasPermissionByRoleId(tx, tenant.id, idByName.Customer, "VIEW_STAFF")).toBe(
          DEFAULT_STARTER_ROLE_PERMISSIONS.Customer.VIEW_STAFF
        );

        // Spot-check visibility against the catalog defaults.
        expect(await canViewRoleById(tx, tenant.id, idByName.Manager, idByName.Customer)).toBe(true);
        expect(await canViewRoleById(tx, tenant.id, idByName.Employee, idByName.Supervisor)).toBe(false);
        expect(DEFAULT_STARTER_ROLE_VISIBILITY.Employee).toContain("Customer");

        await tx.role.deleteMany({ where: { tenantId: tenant.id } });
        await tx.license.deleteMany({ where: { tenantId: tenant.id } });
        await tx.tenant.delete({ where: { id: tenant.id } });
      });
    });
  });

  describe("listTenantRoles", () => {
    it("returns this tenant's roles alphabetically, excluding other tenants'", async () => {
      await runInSystemContext(async (tx) => {
        const tenant = await createTestTenant(tx, "list-roles");
        await tx.role.create({ data: { tenantId: tenant.id, name: "Zebra", level: 0 } });
        await tx.role.create({ data: { tenantId: tenant.id, name: "Alpha", level: 0 } });
        await createTestRole(tx, otherTenantId, "ShouldNotAppear");

        const roles = await listTenantRoles(tx, tenant.id);
        expect(roles.map((r) => r.name)).toEqual(["Alpha", "Zebra"]);

        await tx.role.deleteMany({ where: { tenantId: tenant.id } });
        await tx.license.deleteMany({ where: { tenantId: tenant.id } });
        await tx.tenant.delete({ where: { id: tenant.id } });
      });
    });
  });

  describe("getEffectivePermissionMatrix / getEffectiveVisibilityMatrix", () => {
    it("fills in false for every ungranted key, and reports what was explicitly granted", async () => {
      await runInSystemContext(async (tx) => {
        const tenant = await createTestTenant(tx, "matrix");
        const roleA = await createTestRole(tx, tenant.id, "A");
        const roleB = await createTestRole(tx, tenant.id, "B");
        await setRolePermission(tx, tenant.id, roleA.id, "VIEW_STAFF", true);
        await setRoleVisibility(tx, tenant.id, roleA.id, roleB.id, true);

        const permMatrix = await getEffectivePermissionMatrix(tx, tenant.id);
        expect(permMatrix.grants[roleA.id].VIEW_STAFF).toBe(true);
        expect(permMatrix.grants[roleA.id].EDIT_STAFF).toBe(false);
        expect(permMatrix.grants[roleB.id].VIEW_STAFF).toBe(false);

        const visMatrix = await getEffectiveVisibilityMatrix(tx, tenant.id);
        expect(visMatrix.canView[roleA.id][roleB.id]).toBe(true);
        expect(visMatrix.canView[roleB.id][roleA.id]).toBe(false);
        // A role always implicitly sees its own data, never stored as a row.
        expect(visMatrix.canView[roleA.id][roleA.id]).toBe(true);

        await tx.role.deleteMany({ where: { tenantId: tenant.id } });
        await tx.license.deleteMany({ where: { tenantId: tenant.id } });
        await tx.tenant.delete({ where: { id: tenant.id } });
      });
    });
  });
});
