-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "custom_calendar_id" TEXT;

-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "custom_calendar_enabled",
DROP COLUMN "require_client_on_custom_form",
DROP COLUMN "show_client_on_custom_form",
DROP COLUMN "show_color_key_on_custom_form",
DROP COLUMN "show_job_estimate_on_custom_form",
DROP COLUMN "show_job_type_on_custom_form",
DROP COLUMN "show_payment_status_on_custom_form";

-- CreateTable
CREATE TABLE "custom_calendars" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "show_client" BOOLEAN NOT NULL DEFAULT false,
    "require_client" BOOLEAN NOT NULL DEFAULT false,
    "show_job_type" BOOLEAN NOT NULL DEFAULT true,
    "show_job_estimate" BOOLEAN NOT NULL DEFAULT true,
    "show_color_key" BOOLEAN NOT NULL DEFAULT true,
    "show_payment_status" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_calendars_tenant_id_idx" ON "custom_calendars"("tenant_id");

-- CreateIndex
CREATE INDEX "appointments_custom_calendar_id_idx" ON "appointments"("custom_calendar_id");

-- AddForeignKey
ALTER TABLE "custom_calendars" ADD CONSTRAINT "custom_calendars_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_custom_calendar_id_fkey" FOREIGN KEY ("custom_calendar_id") REFERENCES "custom_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

