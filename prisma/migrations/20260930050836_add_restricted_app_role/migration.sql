-- Fixes a real bug caught by src/lib/tenant-context.rls.test.ts: the Postgres
-- role the app connects as (from docker-compose.yml locally, or the Flexible
-- Server admin in Azure) is a superuser/owner, and superusers always bypass
-- Row-Level Security - FORCE ROW LEVEL SECURITY only affects the table owner,
-- never a superuser. So the app's RUNTIME connection must use a separate,
-- least-privileged role that is not exempt from RLS.
--
-- Migrations continue to run as the privileged role (DATABASE_URL). Only the
-- running app switches to this restricted role (APP_DATABASE_URL) - see
-- src/lib/prisma.ts. The same split applies in Azure: Postgres Flexible
-- Server admin for migrations, this restricted role for the deployed app.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'shiftup_app') THEN
    CREATE ROLE shiftup_app LOGIN PASSWORD 'shiftup_app_dev_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO shiftup_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO shiftup_app;

-- Keeps future tables (from future migrations, run as the privileged role)
-- automatically granted to shiftup_app without a follow-up GRANT each time.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO shiftup_app;
