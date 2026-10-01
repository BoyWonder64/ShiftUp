-- Row-Level Security: database-level defense in depth for tenant isolation.
-- The app additionally scopes every query by tenantId in the repository layer
-- (see src/lib/tenant-context.ts) — this migration is the backstop that holds
-- even if that application-level scoping is ever missed or has a bug.
--
-- Two Postgres session settings drive these policies, set per-request/transaction
-- by the app (see src/lib/tenant-context.ts):
--   app.tenant_id      - the current tenant's UUID, as text
--   app.is_superadmin  - 'true' only for server-controlled system operations
--                        (e.g. tenant signup, platform superadmin actions).
--                        Never set from user-supplied input.
-- If neither is set, current_setting(..., true) returns NULL and every policy
-- below evaluates to NULL (falsy) -- i.e. fail-closed: no rows are visible.

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
ALTER TABLE "licenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "licenses" FORCE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_tenants ON "tenants"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR id::text = current_setting('app.tenant_id', true)
  );

CREATE POLICY tenant_isolation_licenses ON "licenses"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

-- Superadmin users (tenant_id IS NULL) are only visible/manageable in the
-- superadmin context, since a NULL tenant_id can never equal app.tenant_id.
CREATE POLICY tenant_isolation_users ON "users"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );
