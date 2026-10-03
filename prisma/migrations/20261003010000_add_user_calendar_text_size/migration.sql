-- CreateEnum
CREATE TYPE "calendar_text_size" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'XLARGE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "calendar_text_size" "calendar_text_size" NOT NULL DEFAULT 'MEDIUM';
