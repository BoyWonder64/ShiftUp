import type { Tx } from "@/lib/tenant-context";
import {
  DEFAULT_STARTER_ROLE_NAMES,
  DEFAULT_STARTER_ROLE_PERMISSIONS,
  DEFAULT_STARTER_ROLE_VISIBILITY,
  PERMISSION_KEYS,
  type PermissionKey,
} from "./catalog";

/**
 * Whether `roleId` has `permissionKey`. A missing RolePermission row denies -
 * there's no hardcoded default to fall back to anymore (that only made sense
 * when roles were a fixed enum; a tenant-defined role has no inherent
 * defaults). ADMIN/SUPERADMIN pass `roleId: null` and are never looked up
 * here - see hasPermission below for the role-aware wrapper actual routes
 * should call.
 */
export async function hasPermissionByRoleId(
  tx: Tx,
  tenantId: string,
  roleId: string | null,
  permissionKey: PermissionKey
): Promise<boolean> {
  if (!roleId) return false;
  const override = await tx.rolePermission.findUnique({
    where: { tenantId_roleId_permissionKey: { tenantId, roleId, permissionKey } },
  });
  return override?.granted ?? false;
}

/** Role-aware entry point most routes should call: `role` is the session's UserRole ("ADMIN"/"STAFF"/"SUPERADMIN"), `roleId` only meaningful (and required) when role is "STAFF". */
export async function hasPermission(
  tx: Tx,
  tenantId: string,
  role: string,
  roleId: string | null,
  permissionKey: PermissionKey
): Promise<boolean> {
  if (role === "ADMIN" || role === "SUPERADMIN") return true;
  return hasPermissionByRoleId(tx, tenantId, roleId, permissionKey);
}

/** Whether `viewerRoleId` can see data belonging to `targetRoleId`, both real Role ids. A missing row denies. */
export async function canViewRoleById(
  tx: Tx,
  tenantId: string,
  viewerRoleId: string | null,
  targetRoleId: string | null
): Promise<boolean> {
  if (!viewerRoleId || !targetRoleId) return false;
  if (viewerRoleId === targetRoleId) return true; // always see your own role's data
  const override = await tx.roleVisibility.findUnique({
    where: {
      tenantId_viewerRoleId_targetRoleId: { tenantId, viewerRoleId, targetRoleId },
    },
  });
  return override?.canView ?? false;
}

/** Role-aware entry point: ADMIN/SUPERADMIN see everyone unconditionally. */
export async function canViewRole(
  tx: Tx,
  tenantId: string,
  viewerRole: string,
  viewerRoleId: string | null,
  targetRole: string,
  targetRoleId: string | null
): Promise<boolean> {
  if (viewerRole === "ADMIN" || viewerRole === "SUPERADMIN") return true;
  if (targetRole === "ADMIN" || targetRole === "SUPERADMIN") return false;
  return canViewRoleById(tx, tenantId, viewerRoleId, targetRoleId);
}

export interface TenantRoleOption {
  id: string;
  name: string;
}

/** The tenant's actual roles, for rendering the permission matrix / role dropdowns - alphabetical, since there's no inherent ordering between custom roles. */
export async function listTenantRoles(tx: Tx, tenantId: string): Promise<TenantRoleOption[]> {
  return tx.role.findMany({
    where: { tenantId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export interface EffectivePermissionsMatrix {
  roles: TenantRoleOption[];
  permissionKeys: readonly PermissionKey[];
  grants: Record<string, Record<PermissionKey, boolean>>;
}

/** Full effective permission matrix for every real role this tenant has, for rendering the Settings page. */
export async function getEffectivePermissionMatrix(
  tx: Tx,
  tenantId: string
): Promise<EffectivePermissionsMatrix> {
  const roles = await listTenantRoles(tx, tenantId);
  const rows = await tx.rolePermission.findMany({ where: { tenantId } });
  const rowMap = new Map(rows.map((r) => [`${r.roleId}:${r.permissionKey}`, r.granted]));

  const grants: Record<string, Record<PermissionKey, boolean>> = {};
  for (const role of roles) {
    grants[role.id] = {} as Record<PermissionKey, boolean>;
    for (const key of PERMISSION_KEYS) {
      grants[role.id][key] = rowMap.get(`${role.id}:${key}`) ?? false;
    }
  }

  return { roles, permissionKeys: PERMISSION_KEYS, grants };
}

export interface EffectiveVisibilityMatrix {
  roles: TenantRoleOption[];
  canView: Record<string, Record<string, boolean>>;
}

export async function getEffectiveVisibilityMatrix(
  tx: Tx,
  tenantId: string
): Promise<EffectiveVisibilityMatrix> {
  const roles = await listTenantRoles(tx, tenantId);
  const rows = await tx.roleVisibility.findMany({ where: { tenantId } });
  const rowMap = new Map(rows.map((r) => [`${r.viewerRoleId}:${r.targetRoleId}`, r.canView]));

  const canView: Record<string, Record<string, boolean>> = {};
  for (const viewer of roles) {
    canView[viewer.id] = {} as Record<string, boolean>;
    for (const target of roles) {
      canView[viewer.id][target.id] =
        viewer.id === target.id ? true : (rowMap.get(`${viewer.id}:${target.id}`) ?? false);
    }
  }

  return { roles, canView };
}

export async function setRolePermission(
  tx: Tx,
  tenantId: string,
  roleId: string,
  permissionKey: PermissionKey,
  granted: boolean
) {
  await tx.rolePermission.upsert({
    where: { tenantId_roleId_permissionKey: { tenantId, roleId, permissionKey } },
    create: { tenantId, roleId, permissionKey, granted },
    update: { granted },
  });
}

export async function setRoleVisibility(
  tx: Tx,
  tenantId: string,
  viewerRoleId: string,
  targetRoleId: string,
  canView: boolean
) {
  await tx.roleVisibility.upsert({
    where: { tenantId_viewerRoleId_targetRoleId: { tenantId, viewerRoleId, targetRoleId } },
    create: { tenantId, viewerRoleId, targetRoleId, canView },
    update: { canView },
  });
}

/**
 * Seeds a brand-new tenant's starting roles (Manager/Supervisor/Employee/
 * Customer) with the product's traditional defaults - a starting point, not
 * a fixed list; the admin can rename, delete, or add to them freely from
 * day one. Also wires up the starter reporting chain (Employee -> Supervisor
 * -> Manager, Customer reports to no one) as a sensible default org chart.
 * Call once, at tenant creation.
 */
export async function seedDefaultRolesForTenant(tx: Tx, tenantId: string): Promise<Record<string, string>> {
  const idByName: Record<string, string> = {};
  for (const name of DEFAULT_STARTER_ROLE_NAMES) {
    const role = await tx.role.create({ data: { tenantId, name } });
    idByName[name] = role.id;
  }

  const starterReportsTo: Partial<Record<(typeof DEFAULT_STARTER_ROLE_NAMES)[number], (typeof DEFAULT_STARTER_ROLE_NAMES)[number]>> = {
    Employee: "Supervisor",
    Supervisor: "Manager",
  };
  for (const [name, reportsToName] of Object.entries(starterReportsTo)) {
    await tx.role.update({ where: { id: idByName[name] }, data: { reportsToId: idByName[reportsToName] } });
  }

  for (const name of DEFAULT_STARTER_ROLE_NAMES) {
    for (const key of PERMISSION_KEYS) {
      await setRolePermission(tx, tenantId, idByName[name], key, DEFAULT_STARTER_ROLE_PERMISSIONS[name][key]);
    }
  }

  for (const viewer of DEFAULT_STARTER_ROLE_NAMES) {
    for (const target of DEFAULT_STARTER_ROLE_VISIBILITY[viewer]) {
      await setRoleVisibility(tx, tenantId, idByName[viewer], idByName[target], true);
    }
  }

  return idByName;
}
