-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "calendar_end_minute" INTEGER NOT NULL DEFAULT 1440,
ADD COLUMN     "calendar_start_minute" INTEGER NOT NULL DEFAULT 0;
