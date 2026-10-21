-- ISSUES.md #1: split the single shared "service_types" table into two
-- independent tables - AppointmentServiceType (client-facing, has
-- price/payment/public-booking) and ShiftServiceType (internal, name +
-- duration only, no price concept). Hand-written (not `prisma migrate dev`,
-- which only diffs schema) because this needs to actually move data, not
-- just create/drop tables - same reasoning as the hand-written
-- remove_role_level/add_blocked_time migrations.
--
-- Split rule: a service_types row referenced by any appointment with a
-- client (a real appointment) becomes an AppointmentServiceType; one
-- referenced by any clientless appointment (a shift) or any
-- schedule_template_shifts row becomes a ShiftServiceType. A row used by
-- both is copied into both tables (same id, two independent rows going
-- forward - the id is reused only because it's a fresh table with no
-- collision risk, not because the two rows stay linked). A row used by
-- neither defaults to AppointmentServiceType.

-- CreateTable
CREATE TABLE "appointment_service_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "price" DECIMAL(10,2),
    "requires_payment" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_publicly_bookable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_service_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_service_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_service_types_tenant_id_idx" ON "appointment_service_types"("tenant_id");

-- CreateIndex
CREATE INDEX "shift_service_types_tenant_id_idx" ON "shift_service_types"("tenant_id");

-- AddForeignKey
ALTER TABLE "appointment_service_types" ADD CONSTRAINT "appointment_service_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_service_types" ADD CONSTRAINT "shift_service_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: same fail-closed tenant-isolation pattern as every
-- other tenant-scoped table (see add_phase1_scheduling_and_permissions).
ALTER TABLE "appointment_service_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointment_service_types" FORCE ROW LEVEL SECURITY;
ALTER TABLE "shift_service_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_service_types" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_appointment_service_types ON "appointment_service_types"
  FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_shift_service_types ON "shift_service_types"
  FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));

-- DataMigration: copy existing service_types rows into the new tables per
-- the split rule described above.
INSERT INTO "appointment_service_types" ("id", "tenant_id", "name", "duration_minutes", "price", "requires_payment", "is_active", "is_publicly_bookable", "created_at", "updated_at")
SELECT st."id", st."tenant_id", st."name", st."duration_minutes", st."price", st."requires_payment", st."is_active", st."is_publicly_bookable", st."created_at", st."updated_at"
FROM "service_types" st
WHERE EXISTS (SELECT 1 FROM "appointments" a WHERE a."service_type_id" = st."id" AND a."client_id" IS NOT NULL)
   OR (
        NOT EXISTS (SELECT 1 FROM "appointments" a WHERE a."service_type_id" = st."id")
        AND NOT EXISTS (SELECT 1 FROM "schedule_template_shifts" s WHERE s."service_type_id" = st."id")
      );

INSERT INTO "shift_service_types" ("id", "tenant_id", "name", "duration_minutes", "is_active", "created_at", "updated_at")
SELECT st."id", st."tenant_id", st."name", st."duration_minutes", st."is_active", st."created_at", st."updated_at"
FROM "service_types" st
WHERE EXISTS (SELECT 1 FROM "appointments" a WHERE a."service_type_id" = st."id" AND a."client_id" IS NULL)
   OR EXISTS (SELECT 1 FROM "schedule_template_shifts" s WHERE s."service_type_id" = st."id");

-- AlterTable: add the two new FK columns on appointments (exactly one is
-- ever set, matching client_id null/not-null - see schema.prisma doc
-- comment on Appointment.appointmentServiceTypeId).
ALTER TABLE "appointments" ADD COLUMN "appointment_service_type_id" TEXT;
ALTER TABLE "appointments" ADD COLUMN "shift_service_type_id" TEXT;

UPDATE "appointments" SET "appointment_service_type_id" = "service_type_id" WHERE "service_type_id" IS NOT NULL AND "client_id" IS NOT NULL;
UPDATE "appointments" SET "shift_service_type_id" = "service_type_id" WHERE "service_type_id" IS NOT NULL AND "client_id" IS NULL;

ALTER TABLE "appointments" DROP CONSTRAINT "appointments_service_type_id_fkey";
ALTER TABLE "appointments" DROP COLUMN "service_type_id";

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_appointment_service_type_id_fkey" FOREIGN KEY ("appointment_service_type_id") REFERENCES "appointment_service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_shift_service_type_id_fkey" FOREIGN KEY ("shift_service_type_id") REFERENCES "shift_service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: schedule_template_shifts only ever needs the shift side.
ALTER TABLE "schedule_template_shifts" ADD COLUMN "shift_service_type_id" TEXT;
UPDATE "schedule_template_shifts" SET "shift_service_type_id" = "service_type_id" WHERE "service_type_id" IS NOT NULL;

ALTER TABLE "schedule_template_shifts" DROP CONSTRAINT "schedule_template_shifts_service_type_id_fkey";
ALTER TABLE "schedule_template_shifts" DROP COLUMN "service_type_id";

ALTER TABLE "schedule_template_shifts" ADD CONSTRAINT "schedule_template_shifts_shift_service_type_id_fkey" FOREIGN KEY ("shift_service_type_id") REFERENCES "shift_service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropTable: the old shared pool, now fully replaced.
DROP TABLE "service_types";

-- ISSUES.md #5: tenant-wide toggle for whether the appointment detail panel
-- shows/lets staff edit Appointment.paymentStatus at all. Defaults to true -
-- this is purely additive (today's existing always-on display becomes
-- togglable), not a behavior change for existing tenants.
ALTER TABLE "tenants" ADD COLUMN "show_payment_status" BOOLEAN NOT NULL DEFAULT true;
