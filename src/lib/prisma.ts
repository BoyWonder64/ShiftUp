import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// The app runs as a restricted, non-superuser DB role (APP_DATABASE_URL) so that
// Row-Level Security actually applies to it - a superuser/owner (the default
// DATABASE_URL, used only for migrations) bypasses RLS entirely. See
// prisma/migrations/*_add_restricted_app_role and src/lib/tenant-context.ts.
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!appDatabaseUrl) {
  throw new Error(
    "APP_DATABASE_URL is not set. The app must connect as the restricted shiftup_app role, not the migration superuser - see .env.example."
  );
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl: appDatabaseUrl });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
