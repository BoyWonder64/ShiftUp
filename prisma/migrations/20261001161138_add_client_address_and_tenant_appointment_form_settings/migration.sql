-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "require_client_for_appointments" BOOLEAN NOT NULL DEFAULT true;
