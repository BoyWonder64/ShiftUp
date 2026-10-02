-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roles_tenant_id_name_key" ON "roles"("tenant_id", "name");
CREATE INDEX "roles_tenant_id_idx" ON "roles"("tenant_id");

ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the 4 default roles for every existing tenant, so every tenant keeps
-- exactly the roles it has today - as real rows it can now rename, delete,
-- or add siblings to, instead of a fixed enum.
INSERT INTO "roles" ("id", "tenant_id", "name", "created_at")
SELECT gen_random_uuid()::text, t."id", v."role_name", CURRENT_TIMESTAMP
FROM "tenants" t, (VALUES ('Manager'), ('Supervisor'), ('Employee'), ('Customer')) AS v("role_name");

-- users.role_id: add, backfill from the old enum value, index
ALTER TABLE "users" ADD COLUMN "role_id" TEXT;

UPDATE "users" u
SET "role_id" = r."id"
FROM "roles" r
WHERE r."tenant_id" = u."tenant_id"
  AND UPPER(r."name") = u."role"::text
  AND u."role" IN ('MANAGER', 'SUPERVISOR', 'EMPLOYEE', 'CUSTOMER');

CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- role_permissions: replace the enum "role" column with a real "role_id" FK
ALTER TABLE "role_permissions" ADD COLUMN "role_id" TEXT;

UPDATE "role_permissions" rp
SET "role_id" = r."id"
FROM "roles" r
WHERE r."tenant_id" = rp."tenant_id"
  AND UPPER(r."name") = rp."role"::text;

ALTER TABLE "role_permissions" ALTER COLUMN "role_id" SET NOT NULL;
DROP INDEX "role_permissions_tenant_id_role_permission_key_key";
ALTER TABLE "role_permissions" DROP COLUMN "role";
CREATE UNIQUE INDEX "role_permissions_tenant_id_role_id_permission_key_key" ON "role_permissions"("tenant_id", "role_id", "permission_key");
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- role_visibilities: replace the two enum columns with real role_id FKs
ALTER TABLE "role_visibilities" ADD COLUMN "viewer_role_id" TEXT;
ALTER TABLE "role_visibilities" ADD COLUMN "target_role_id" TEXT;

UPDATE "role_visibilities" rv
SET "viewer_role_id" = r."id"
FROM "roles" r
WHERE r."tenant_id" = rv."tenant_id"
  AND UPPER(r."name") = rv."viewer_role"::text;

UPDATE "role_visibilities" rv
SET "target_role_id" = r."id"
FROM "roles" r
WHERE r."tenant_id" = rv."tenant_id"
  AND UPPER(r."name") = rv."target_role"::text;

ALTER TABLE "role_visibilities" ALTER COLUMN "viewer_role_id" SET NOT NULL;
ALTER TABLE "role_visibilities" ALTER COLUMN "target_role_id" SET NOT NULL;
DROP INDEX "role_visibilities_tenant_id_viewer_role_target_role_key";
ALTER TABLE "role_visibilities" DROP COLUMN "viewer_role";
ALTER TABLE "role_visibilities" DROP COLUMN "target_role";
CREATE UNIQUE INDEX "role_visibilities_tenant_id_viewer_role_id_target_role_id_key" ON "role_visibilities"("tenant_id", "viewer_role_id", "target_role_id");
ALTER TABLE "role_visibilities" ADD CONSTRAINT "role_visibilities_viewer_role_id_fkey" FOREIGN KEY ("viewer_role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_visibilities" ADD CONSTRAINT "role_visibilities_target_role_id_fkey" FOREIGN KEY ("target_role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- users.role_id FK - RESTRICT (not CASCADE/SetNull) so deleting a Role is
-- blocked at the DB level while any user still holds it; the admin must
-- reassign those users first.
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Shrink the user_role enum to SUPERADMIN/ADMIN/STAFF - Postgres can't drop
-- enum values directly, so recreate the type and remap existing data through it.
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

ALTER TYPE "user_role" RENAME TO "user_role_old";
CREATE TYPE "user_role" AS ENUM ('SUPERADMIN', 'ADMIN', 'STAFF');

ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "user_role"
  USING (
    CASE WHEN "role"::text IN ('MANAGER', 'SUPERVISOR', 'EMPLOYEE', 'CUSTOMER') THEN 'STAFF' ELSE "role"::text END
  )::"user_role";

ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'STAFF';

DROP TYPE "user_role_old";

-- Carry forward any existing Tenant.roleLabels renames onto the real Role
-- rows before dropping that column - must run after every FK backfill above
-- (which matches on the canonical "Manager"/"Supervisor"/... names), not
-- before, or the matching would break.
UPDATE "roles" r
SET "name" = CASE UPPER(r."name")
    WHEN 'MANAGER' THEN COALESCE(t."role_labels"->>'MANAGER', r."name")
    WHEN 'SUPERVISOR' THEN COALESCE(t."role_labels"->>'SUPERVISOR', r."name")
    WHEN 'EMPLOYEE' THEN COALESCE(t."role_labels"->>'EMPLOYEE', r."name")
    WHEN 'CUSTOMER' THEN COALESCE(t."role_labels"->>'CUSTOMER', r."name")
    ELSE r."name"
  END
FROM "tenants" t
WHERE t."id" = r."tenant_id" AND t."role_labels" IS NOT NULL;

ALTER TABLE "tenants" DROP COLUMN "role_labels";

-- Row-Level Security: same fail-closed tenant-isolation pattern as every
-- other tenant-scoped table. GRANTs for shiftup_app already apply
-- automatically via the ALTER DEFAULT PRIVILEGES set up in add_restricted_app_role.
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_roles ON "roles"
  FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
