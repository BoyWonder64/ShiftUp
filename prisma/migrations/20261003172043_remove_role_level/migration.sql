-- Rank-based authorization (Role.level) has been replaced with a flat
-- ADMIN-only check for reassigning roles and acting on staff members (see
-- src/app/api/staff/route.ts and src/app/api/staff/[id]/route.ts).
ALTER TABLE "roles" DROP COLUMN "level";
