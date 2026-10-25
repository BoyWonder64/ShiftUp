-- CreateTable
CREATE TABLE "event_presets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "entry_kind" "entry_kind" NOT NULL,
    "custom_calendar_id" TEXT,
    "duration_minutes" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_presets_tenant_id_idx" ON "event_presets"("tenant_id");

-- AddForeignKey
ALTER TABLE "event_presets" ADD CONSTRAINT "event_presets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_presets" ADD CONSTRAINT "event_presets_custom_calendar_id_fkey" FOREIGN KEY ("custom_calendar_id") REFERENCES "custom_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
