-- AlterTable
ALTER TABLE "holidays" ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "blocked_holiday_names" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "blocked_time" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "label" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_time_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blocked_time_tenant_id_idx" ON "blocked_time"("tenant_id");

-- CreateIndex
CREATE INDEX "blocked_time_tenant_id_start_time_idx" ON "blocked_time"("tenant_id", "start_time");

-- AddForeignKey
ALTER TABLE "blocked_time" ADD CONSTRAINT "blocked_time_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: same fail-closed tenant-isolation pattern as every
-- other tenant-scoped table. GRANTs for shiftup_app already apply
-- automatically via the ALTER DEFAULT PRIVILEGES set up in add_restricted_app_role.
ALTER TABLE "blocked_time" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blocked_time" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_blocked_time ON "blocked_time"
  FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
