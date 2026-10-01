-- CreateEnum
CREATE TYPE "meeting_location_type" AS ENUM ('IN_PERSON', 'ONLINE');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "location" TEXT,
ADD COLUMN     "location_type" "meeting_location_type" NOT NULL DEFAULT 'IN_PERSON';
