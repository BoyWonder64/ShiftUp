-- Splits the combined VIEW/CREATE/EDIT/CANCEL_APPOINTMENTS permission keys
-- into separate _SHIFTS/_APPOINTMENTS pairs (ISSUES.md #6) so a role's
-- shift and appointment access can be granted/revoked independently.
-- permissionKey is a plain String column (no enum/schema change needed) -
-- this is a data-only backfill, same approach as the enabled_holiday_names
-- migration: copy every existing role's grant for each old combined key
-- onto the new _SHIFTS key, so no existing role's effective access
-- silently changes the moment this ships. The old key itself is untouched
-- and simply narrows in meaning from "both" to "appointments only".

INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_key", "granted", "updated_at")
SELECT gen_random_uuid(), "tenant_id", "role_id", 'VIEW_SHIFTS', "granted", now()
FROM "role_permissions"
WHERE "permission_key" = 'VIEW_APPOINTMENTS'
ON CONFLICT ("tenant_id", "role_id", "permission_key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_key", "granted", "updated_at")
SELECT gen_random_uuid(), "tenant_id", "role_id", 'CREATE_SHIFTS', "granted", now()
FROM "role_permissions"
WHERE "permission_key" = 'CREATE_APPOINTMENTS'
ON CONFLICT ("tenant_id", "role_id", "permission_key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_key", "granted", "updated_at")
SELECT gen_random_uuid(), "tenant_id", "role_id", 'EDIT_SHIFTS', "granted", now()
FROM "role_permissions"
WHERE "permission_key" = 'EDIT_APPOINTMENTS'
ON CONFLICT ("tenant_id", "role_id", "permission_key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_key", "granted", "updated_at")
SELECT gen_random_uuid(), "tenant_id", "role_id", 'CANCEL_SHIFTS', "granted", now()
FROM "role_permissions"
WHERE "permission_key" = 'CANCEL_APPOINTMENTS'
ON CONFLICT ("tenant_id", "role_id", "permission_key") DO NOTHING;
