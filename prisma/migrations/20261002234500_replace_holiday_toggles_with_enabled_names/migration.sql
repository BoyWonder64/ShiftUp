-- Replace the two region-level holiday toggles (show_federal_holidays,
-- show_european_holidays) with one array of individually-enabled holiday
-- names - the Settings UI now shows one checkbox per holiday instead of one
-- per region (src/lib/holidays/catalog.ts).

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "enabled_holiday_names" TEXT[] NOT NULL DEFAULT ARRAY['New Year''s Day','Martin Luther King Jr. Day','Washington''s Birthday','Memorial Day','Juneteenth','Independence Day','Labor Day','Columbus Day','Veterans Day','Thanksgiving Day','Christmas Day']::TEXT[];

-- Backfill from the old per-region booleans before dropping them, so an
-- existing tenant's effective holiday set doesn't silently change.
UPDATE "tenants" SET "enabled_holiday_names" =
  (CASE WHEN "show_federal_holidays" THEN ARRAY['New Year''s Day','Martin Luther King Jr. Day','Washington''s Birthday','Memorial Day','Juneteenth','Independence Day','Labor Day','Columbus Day','Veterans Day','Thanksgiving Day','Christmas Day'] ELSE ARRAY[]::TEXT[] END)
  ||
  (CASE WHEN "show_european_holidays" THEN ARRAY['Epiphany','Good Friday','Easter Sunday','Easter Monday','Labour Day','Assumption of Mary','All Saints'' Day','St. Stephen''s Day'] ELSE ARRAY[]::TEXT[] END);

-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "show_european_holidays",
DROP COLUMN "show_federal_holidays";
