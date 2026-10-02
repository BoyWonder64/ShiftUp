-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "allow_overlapping_shifts" BOOLEAN NOT NULL DEFAULT false;

-- Narrow appointments_no_overlapping_staff_time (see the add_phase1_scheduling_and_permissions
-- migration) to only ever cover rows with a client attached - a real,
-- client-facing appointment always stays double-booking-proof at the DB
-- level regardless of tenant settings. A shift (client_id IS NULL) is no
-- longer constrained here at all; whether a staff member's shifts may
-- overlap is now a per-tenant choice (Tenant.allow_overlapping_shifts)
-- enforced in application code (src/modules/scheduling/service.ts) instead,
-- since a Postgres EXCLUDE constraint's WHERE clause can't reference another
-- table's row to key off a tenant-level setting.
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_no_overlapping_staff_time";

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlapping_staff_time"
  EXCLUDE USING gist (
    staff_id WITH =,
    tsrange(start_time, end_time) WITH &&
  ) WHERE (status <> 'CANCELLED' AND client_id IS NOT NULL);
