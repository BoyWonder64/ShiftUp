-- CreateEnum
CREATE TYPE "event_tag_scope" AS ENUM ('SHIFT', 'APPOINTMENT', 'BOTH');

-- AlterTable
ALTER TABLE "event_tags" ADD COLUMN     "applies_to" "event_tag_scope" NOT NULL DEFAULT 'BOTH';
