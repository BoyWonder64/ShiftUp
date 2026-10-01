-- Splits "how a tenant pays" out from "which features they get":
-- * new BillingPlan enum (FREE / ONE_TIME / SUBSCRIPTION) on licenses.billing_plan
-- * license_status drops TRIAL (the FREE plan now fills that role - permanent,
--   not a ticking clock) and keeps just ACTIVE/EXPIRED
-- * stripe_customer_id / stripe_subscription_id added now so Phase 3 payments
--   doesn't need another enum-touching migration later
--
-- Existing rows are preserved (unlike earlier migrations in this project) -
-- there's real test-tenant data worth keeping at this point, not just
-- throwaway curl test rows.

CREATE TYPE "billing_plan" AS ENUM ('FREE', 'ONE_TIME', 'SUBSCRIPTION');

ALTER TABLE "licenses" ADD COLUMN "billing_plan" "billing_plan" NOT NULL DEFAULT 'FREE';
ALTER TABLE "licenses" ADD COLUMN "stripe_customer_id" TEXT;
ALTER TABLE "licenses" ADD COLUMN "stripe_subscription_id" TEXT;

-- Fold old TRIAL rows into ACTIVE before dropping TRIAL from the enum.
UPDATE "licenses" SET "status" = 'ACTIVE' WHERE "status" = 'TRIAL';

ALTER TYPE "license_status" RENAME TO "license_status_old";
CREATE TYPE "license_status" AS ENUM ('ACTIVE', 'EXPIRED');
ALTER TABLE "licenses" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "licenses" ALTER COLUMN "status" TYPE "license_status" USING ("status"::text::"license_status");
ALTER TABLE "licenses" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "license_status_old";
