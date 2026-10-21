-- CreateEnum
CREATE TYPE "dashboard_metric_type" AS ENUM ('STAFF_COUNT', 'APPOINTMENT_COUNT');

-- CreateEnum
CREATE TYPE "dashboard_metric_date_range" AS ENUM ('ALL_TIME', 'UPCOMING', 'PAST', 'TODAY', 'THIS_WEEK', 'THIS_MONTH');

-- CreateEnum
CREATE TYPE "dashboard_metric_status_filter" AS ENUM ('ANY', 'EXCLUDE_CANCELLED', 'PENDING_PAYMENT', 'BOOKED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "dashboard_metrics" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "metric_type" "dashboard_metric_type" NOT NULL,
    "entry_kind_filter" "entry_kind",
    "date_range" "dashboard_metric_date_range" NOT NULL DEFAULT 'ALL_TIME',
    "status_filter" "dashboard_metric_status_filter" NOT NULL DEFAULT 'EXCLUDE_CANCELLED',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dashboard_metrics_tenant_id_idx" ON "dashboard_metrics"("tenant_id");

-- AddForeignKey
ALTER TABLE "dashboard_metrics" ADD CONSTRAINT "dashboard_metrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
