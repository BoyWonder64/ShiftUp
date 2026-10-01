import type { Tx } from "@/lib/tenant-context";
import {
  CONFIGURABLE_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_ROLE_VISIBILITY,
  PERMISSION_KEYS,
  type ConfigurableRole,
  type PermissionKey,
} from "./catalog";

function isConfigurableRole(role: string): role is ConfigurableRole {
  return (CONFIGURABLE_ROLES as string[]).includes(role);
}

/**
 * Whether `role` has `permissionKey`, layering any tenant override on top of
 * the hardcoded default. ADMIN/SUPERADMIN always return true here - they are
 * never looked up in the override table, by design (see catalog.ts).
 */
export async function hasPermission(
  tx: Tx,
  tenantId: string,
  role: string,
  permissionKey: PermissionKey
): Promise<boolean> {
  if (role === "ADMIN" || role === "SUPERADMIN") return true;
  if (!isConfigurableRole(role)) return false;

  const override = await tx.rolePermission.findUnique({
    where: { tenantId_role_permissionKey: { tenantId, role, permissionKey } },
  });
  return override ? override.granted : DEFAULT_ROLE_PERMISSIONS[role][permissionKey];
}

/** Whether `viewerRole` can see data belonging to `targetRole`, tenant overrides included. */
export async function canViewRole(
  tx: Tx,
  tenantId: string,
  viewerRole: string,
  targetRole: string
): Promise<boolean> {
  if (viewerRole === "ADMIN" || viewerRole === "SUPERADMIN") return true;
  if (viewerRole === targetRole) return true; // always see your own
  if (!isConfigurableRole(viewerRole) || !isConfigurableRole(targetRole)) return false;

  const override = await tx.roleVisibility.findUnique({
    where: { tenantId_viewerRole_targetRole: { tenantId, viewerRole, targetRole } },
  });
  if (override) return override.canView;
  return DEFAULT_ROLE_VISIBILITY[viewerRole].includes(targetRole);
}

export interface EffectivePermissionsMatrix {
  roles: readonly ConfigurableRole[];
  permissionKeys: readonly PermissionKey[];
  grants: Record<ConfigurableRole, Record<PermissionKey, boolean>>;
}

/** Full effective permission matrix (defaults + overrides merged), for rendering the User Manager page. */
export async function getEffectivePermissionMatrix(
  tx: Tx,
  tenantId: string
): Promise<EffectivePermissionsMatrix> {
  const overrides = await tx.rolePermission.findMany({ where: { tenantId } });
  const overrideMap = new Map(overrides.map((o) => [`${o.role}:${o.permissionKey}`, o.granted]));

  const grants = {} as Record<ConfigurableRole, Record<PermissionKey, boolean>>;
  for (const role of CONFIGURABLE_ROLES) {
    grants[role] = {} as Record<PermissionKey, boolean>;
    for (const key of PERMISSION_KEYS) {
      const override = overrideMap.get(`${role}:${key}`);
      grants[role][key] = override ?? DEFAULT_ROLE_PERMISSIONS[role][key];
    }
  }

  return { roles: CONFIGURABLE_ROLES, permissionKeys: PERMISSION_KEYS, grants };
}

export interface EffectiveVisibilityMatrix {
  roles: readonly ConfigurableRole[];
  canView: Record<ConfigurableRole, Record<ConfigurableRole, boolean>>;
}

export async function getEffectiveVisibilityMatrix(
  tx: Tx,
  tenantId: string
): Promise<EffectiveVisibilityMatrix> {
  const overrides = await tx.roleVisibility.findMany({ where: { tenantId } });
  const overrideMap = new Map(overrides.map((o) => [`${o.viewerRole}:${o.targetRole}`, o.canView]));

  const canView = {} as Record<ConfigurableRole, Record<ConfigurableRole, boolean>>;
  for (const viewer of CONFIGURABLE_ROLES) {
    canView[viewer] = {} as Record<ConfigurableRole, boolean>;
    for (const target of CONFIGURABLE_ROLES) {
      const override = overrideMap.get(`${viewer}:${target}`);
      canView[viewer][target] =
        override ?? DEFAULT_ROLE_VISIBILITY[viewer].includes(target);
    }
  }

  return { roles: CONFIGURABLE_ROLES, canView };
}

export async function setRolePermission(
  tx: Tx,
  tenantId: string,
  role: ConfigurableRole,
  permissionKey: PermissionKey,
  granted: boolean
) {
  await tx.rolePermission.upsert({
    where: { tenantId_role_permissionKey: { tenantId, role, permissionKey } },
    create: { tenantId, role, permissionKey, granted },
    update: { granted },
  });
}

export async function setRoleVisibility(
  tx: Tx,
  tenantId: string,
  viewerRole: ConfigurableRole,
  targetRole: ConfigurableRole,
  canView: boolean
) {
  await tx.roleVisibility.upsert({
    where: { tenantId_viewerRole_targetRole: { tenantId, viewerRole, targetRole } },
    create: { tenantId, viewerRole, targetRole, canView },
    update: { canView },
  });
}
