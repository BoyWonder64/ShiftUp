-- CreateTable
CREATE TABLE "schedule_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period_length_days" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_template_shifts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "day_offset" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "service_type_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_template_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_templates_tenant_id_idx" ON "schedule_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "schedule_template_shifts_tenant_id_idx" ON "schedule_template_shifts"("tenant_id");

-- CreateIndex
CREATE INDEX "schedule_template_shifts_template_id_idx" ON "schedule_template_shifts"("template_id");

-- AddForeignKey
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_template_shifts" ADD CONSTRAINT "schedule_template_shifts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_template_shifts" ADD CONSTRAINT "schedule_template_shifts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "schedule_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_template_shifts" ADD CONSTRAINT "schedule_template_shifts_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_template_shifts" ADD CONSTRAINT "schedule_template_shifts_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security: same fail-closed tenant-isolation pattern as every
-- other tenant-scoped table. GRANTs for shiftup_app already apply
-- automatically via the ALTER DEFAULT PRIVILEGES set up in add_restricted_app_role.
ALTER TABLE "schedule_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schedule_templates" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_schedule_templates ON "schedule_templates"
  FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE "schedule_template_shifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schedule_template_shifts" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_schedule_template_shifts ON "schedule_template_shifts"
  FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
