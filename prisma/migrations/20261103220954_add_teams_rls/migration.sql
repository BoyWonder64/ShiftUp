-- Row-Level Security: same fail-closed tenant-isolation pattern as every
-- other tenant-scoped table. GRANTs for shiftup_app already apply
-- automatically via the ALTER DEFAULT PRIVILEGES set up in add_restricted_app_role.
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teams" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_teams ON "teams"
  FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "team_members" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_team_members ON "team_members"
  FOR ALL
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
