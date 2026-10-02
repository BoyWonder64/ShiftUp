-- CreateEnum
CREATE TYPE "locale" AS ENUM ('EN', 'ES', 'DE', 'FR');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" "locale" NOT NULL DEFAULT 'EN';
