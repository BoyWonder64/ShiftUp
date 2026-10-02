-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "show_color_key_on_shift_form" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_job_estimate_on_shift_form" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_job_type_on_shift_form" BOOLEAN NOT NULL DEFAULT true;
