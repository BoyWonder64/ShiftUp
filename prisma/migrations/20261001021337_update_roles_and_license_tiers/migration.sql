-- Updates the role hierarchy and license tiers for the new pricing model:
-- * user_role: SUPERADMIN/ADMIN/STAFF -> SUPERADMIN/ADMIN/MANAGER/SUPERVISOR/EMPLOYEE/ATTENDEE
-- * license_tier: STANDARD -> SHIFT_MANAGEMENT/APPOINTMENT_MANAGER/BOTH (so shift
--   management and appointment management can be sold, and deployed, standalone
--   or together - see src/lib/licensing/features.ts)
--
-- Dev-only data reset: clears existing rows before changing the enum
-- definitions, since old test rows use values (STAFF, STANDARD) that no
-- longer exist in the new enums. Safe pre-launch - there is no real tenant
-- data yet. A real migration against live data would need a value-mapping
-- UPDATE instead of a truncate.
TRUNCATE TABLE "users", "licenses", "tenants" CASCADE;

ALTER TYPE "user_role" RENAME TO "user_role_old";
CREATE TYPE "user_role" AS ENUM ('SUPERADMIN', 'ADMIN', 'MANAGER', 'SUPERVISOR', 'EMPLOYEE', 'ATTENDEE');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "user_role" USING ("role"::text::"user_role");
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';
DROP TYPE "user_role_old";

ALTER TYPE "license_tier" RENAME TO "license_tier_old";
CREATE TYPE "license_tier" AS ENUM ('SHIFT_MANAGEMENT', 'APPOINTMENT_MANAGER', 'BOTH');
ALTER TABLE "licenses" ALTER COLUMN "tier" DROP DEFAULT;
ALTER TABLE "licenses" ALTER COLUMN "tier" TYPE "license_tier" USING ("tier"::text::"license_tier");
ALTER TABLE "licenses" ALTER COLUMN "tier" SET DEFAULT 'BOTH';
DROP TYPE "license_tier_old";
