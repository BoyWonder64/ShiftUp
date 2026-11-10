-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "staff_profile_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teams_tenant_id_idx" ON "teams"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_tenant_id_name_key" ON "teams"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "team_members_tenant_id_idx" ON "team_members"("tenant_id");

-- CreateIndex
CREATE INDEX "team_members_staff_profile_id_idx" ON "team_members"("staff_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_team_id_staff_profile_id_key" ON "team_members"("team_id", "staff_profile_id");

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
