/**
 * The fixed catalog of permission keys and the hardcoded default matrix each
 * tenant starts from. A tenant ADMIN can override any of these defaults per
 * role from the User Manager page (RolePermission/RoleVisibility tables) -
 * see src/lib/permissions/service.ts for how an override layers on top of
 * these defaults. ADMIN itself is never represented here: it always has
 * every permission and can see every role, unconditionally, in code - not
 * because of a row in this matrix.
 *
 * Permissions are broken down to one action per key (view/create/edit/delete)
 * rather than one combined "manage" key per resource, so a tenant can grant
 * e.g. "view clients" without also granting "delete clients".
 */

export type ConfigurableRole = "MANAGER" | "SUPERVISOR" | "EMPLOYEE" | "CUSTOMER";

export const CONFIGURABLE_ROLES: ConfigurableRole[] = [
  "MANAGER",
  "SUPERVISOR",
  "EMPLOYEE",
  "CUSTOMER",
];

export const PERMISSION_KEYS = [
  "VIEW_STAFF",
  "CREATE_STAFF",
  "EDIT_STAFF",
  "DELETE_STAFF",
  "VIEW_SERVICES",
  "CREATE_SERVICES",
  "EDIT_SERVICES",
  "DELETE_SERVICES",
  "VIEW_CLIENTS",
  "CREATE_CLIENTS",
  "EDIT_CLIENTS",
  "DELETE_CLIENTS",
  "VIEW_APPOINTMENTS",
  "CREATE_APPOINTMENTS",
  "EDIT_APPOINTMENTS",
  "CANCEL_APPOINTMENTS",
  "VIEW_JOB_ESTIMATES",
  "EDIT_JOB_ESTIMATES",
  "VIEW_TIME_OFF",
  "APPROVE_TIME_OFF",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  VIEW_STAFF: "View staff",
  CREATE_STAFF: "Add staff",
  EDIT_STAFF: "Edit staff",
  DELETE_STAFF: "Remove staff",
  VIEW_SERVICES: "View service types",
  CREATE_SERVICES: "Add service types",
  EDIT_SERVICES: "Edit service types",
  DELETE_SERVICES: "Remove service types",
  VIEW_CLIENTS: "View clients",
  CREATE_CLIENTS: "Add clients",
  EDIT_CLIENTS: "Edit clients",
  DELETE_CLIENTS: "Remove clients",
  VIEW_APPOINTMENTS: "View appointments/shifts",
  CREATE_APPOINTMENTS: "Create appointments/shifts",
  EDIT_APPOINTMENTS: "Reschedule/edit appointments",
  CANCEL_APPOINTMENTS: "Cancel appointments",
  VIEW_JOB_ESTIMATES: "View job time/value estimates",
  EDIT_JOB_ESTIMATES: "Set job time/value estimates",
  VIEW_TIME_OFF: "View others' time-off requests",
  APPROVE_TIME_OFF: "Approve/deny time-off requests",
};

/** Sane starting defaults - every one of these is overridable per tenant. */
export const DEFAULT_ROLE_PERMISSIONS: Record<ConfigurableRole, Record<PermissionKey, boolean>> = {
  MANAGER: {
    VIEW_STAFF: true,
    CREATE_STAFF: true,
    EDIT_STAFF: true,
    DELETE_STAFF: true,
    VIEW_SERVICES: true,
    CREATE_SERVICES: true,
    EDIT_SERVICES: true,
    DELETE_SERVICES: true,
    VIEW_CLIENTS: true,
    CREATE_CLIENTS: true,
    EDIT_CLIENTS: true,
    DELETE_CLIENTS: true,
    VIEW_APPOINTMENTS: true,
    CREATE_APPOINTMENTS: true,
    EDIT_APPOINTMENTS: true,
    CANCEL_APPOINTMENTS: true,
    VIEW_JOB_ESTIMATES: true,
    EDIT_JOB_ESTIMATES: true,
    VIEW_TIME_OFF: true,
    APPROVE_TIME_OFF: true,
  },
  SUPERVISOR: {
    VIEW_STAFF: true,
    CREATE_STAFF: false,
    EDIT_STAFF: false,
    DELETE_STAFF: false,
    VIEW_SERVICES: true,
    CREATE_SERVICES: false,
    EDIT_SERVICES: false,
    DELETE_SERVICES: false,
    VIEW_CLIENTS: true,
    CREATE_CLIENTS: true,
    EDIT_CLIENTS: true,
    DELETE_CLIENTS: false,
    VIEW_APPOINTMENTS: true,
    CREATE_APPOINTMENTS: true,
    EDIT_APPOINTMENTS: true,
    CANCEL_APPOINTMENTS: true,
    VIEW_JOB_ESTIMATES: false,
    EDIT_JOB_ESTIMATES: false,
    VIEW_TIME_OFF: true,
    APPROVE_TIME_OFF: true,
  },
  EMPLOYEE: {
    VIEW_STAFF: true,
    CREATE_STAFF: false,
    EDIT_STAFF: false,
    DELETE_STAFF: false,
    VIEW_SERVICES: true,
    CREATE_SERVICES: false,
    EDIT_SERVICES: false,
    DELETE_SERVICES: false,
    VIEW_CLIENTS: true,
    CREATE_CLIENTS: false,
    EDIT_CLIENTS: false,
    DELETE_CLIENTS: false,
    VIEW_APPOINTMENTS: true,
    CREATE_APPOINTMENTS: false,
    EDIT_APPOINTMENTS: false,
    CANCEL_APPOINTMENTS: false,
    VIEW_JOB_ESTIMATES: false,
    EDIT_JOB_ESTIMATES: false,
    VIEW_TIME_OFF: false,
    APPROVE_TIME_OFF: false,
  },
  CUSTOMER: {
    VIEW_STAFF: false,
    CREATE_STAFF: false,
    EDIT_STAFF: false,
    DELETE_STAFF: false,
    VIEW_SERVICES: false,
    CREATE_SERVICES: false,
    EDIT_SERVICES: false,
    DELETE_SERVICES: false,
    VIEW_CLIENTS: false,
    CREATE_CLIENTS: false,
    EDIT_CLIENTS: false,
    DELETE_CLIENTS: false,
    VIEW_APPOINTMENTS: false,
    CREATE_APPOINTMENTS: false,
    EDIT_APPOINTMENTS: false,
    CANCEL_APPOINTMENTS: false,
    VIEW_JOB_ESTIMATES: false,
    EDIT_JOB_ESTIMATES: false,
    VIEW_TIME_OFF: false,
    APPROVE_TIME_OFF: false,
  },
};

/**
 * Default "who can see who" matrix - e.g. can a SUPERVISOR view an EMPLOYEE's
 * appointments/schedule. ADMIN sees everyone unconditionally (not listed
 * here); everyone implicitly sees their own data regardless of this matrix.
 */
export const DEFAULT_ROLE_VISIBILITY: Record<ConfigurableRole, ConfigurableRole[]> = {
  MANAGER: ["MANAGER", "SUPERVISOR", "EMPLOYEE", "CUSTOMER"],
  SUPERVISOR: ["EMPLOYEE", "CUSTOMER"],
  EMPLOYEE: ["CUSTOMER"],
  CUSTOMER: [],
};
