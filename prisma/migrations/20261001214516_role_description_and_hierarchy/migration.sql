-- AlterTable
ALTER TABLE "roles" ADD COLUMN "description" TEXT;
ALTER TABLE "roles" ADD COLUMN "reports_to_id" TEXT;

CREATE INDEX "roles_reports_to_id_idx" ON "roles"("reports_to_id");

ALTER TABLE "roles" ADD CONSTRAINT "roles_reports_to_id_fkey" FOREIGN KEY ("reports_to_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
