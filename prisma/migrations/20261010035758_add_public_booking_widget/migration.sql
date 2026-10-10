-- AlterTable
ALTER TABLE "appointments" ALTER COLUMN "created_by_user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "service_types" ADD COLUMN     "is_publicly_bookable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "public_booking_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "public_booking_min_notice_minutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "public_booking_window_days" INTEGER NOT NULL DEFAULT 30;
