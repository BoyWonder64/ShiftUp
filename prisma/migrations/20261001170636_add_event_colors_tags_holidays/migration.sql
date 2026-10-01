-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "tag_id" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "event_colors" JSONB,
ADD COLUMN     "show_federal_holidays" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "event_tags" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_tags_tenant_id_idx" ON "event_tags"("tenant_id");

-- CreateIndex
CREATE INDEX "holidays_tenant_id_idx" ON "holidays"("tenant_id");

-- AddForeignKey
ALTER TABLE "event_tags" ADD CONSTRAINT "event_tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "event_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security: same fail-closed tenant-isolation pattern as every
-- other tenant-scoped table. GRANTs for shiftup_app already apply
-- automatically via the ALTER DEFAULT PRIVILEGES set up in add_restricted_app_role.
ALTER TABLE "event_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_tags" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_event_tags ON "event_tags"
  FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE "holidays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "holidays" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_holidays ON "holidays"
  FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
