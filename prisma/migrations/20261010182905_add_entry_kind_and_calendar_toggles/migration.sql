-- CreateEnum
CREATE TYPE "entry_kind" AS ENUM ('SHIFT', 'APPOINTMENT', 'CUSTOM');

-- AlterTable: add entry_kind nullable first, backfill from the old
-- clientId-presence inference, then lock it down to NOT NULL - this table
-- has existing rows, so a straight NOT NULL add isn't possible.
ALTER TABLE "appointments" ADD COLUMN "entry_kind" "entry_kind";

UPDATE "appointments"
SET "entry_kind" = CASE WHEN "client_id" IS NULL THEN 'SHIFT' ELSE 'APPOINTMENT' END::"entry_kind";

ALTER TABLE "appointments" ALTER COLUMN "entry_kind" SET NOT NULL;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "appointments_calendar_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "custom_calendar_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "require_client_on_custom_form" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shifts_calendar_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_client_on_custom_form" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "show_color_key_on_custom_form" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_job_estimate_on_custom_form" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_job_type_on_custom_form" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_payment_status_on_custom_form" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "appointments_tenant_id_entry_kind_idx" ON "appointments"("tenant_id", "entry_kind");
