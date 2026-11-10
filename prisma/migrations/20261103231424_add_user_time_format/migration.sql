-- CreateEnum
CREATE TYPE "time_format" AS ENUM ('TWELVE_HOUR', 'TWENTY_FOUR_HOUR');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "time_format" "time_format" NOT NULL DEFAULT 'TWELVE_HOUR';
