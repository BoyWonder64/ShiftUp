import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

/**
 * Real browser E2E tests against a live `npm run dev` + the local dev
 * Postgres (same DB vitest's integration suite uses - see each spec's own
 * doc comment). Unlike `vitest run` (src/**\/*.test.ts, hits the DB
 * directly via runInSystemContext), these drive the actual app through
 * Chromium - signup, login, the calendar create flow, etc. - the same way a
 * real user would, catching UI-layer bugs no server-side test can.
 *
 * Run with `npm run test:e2e` (starts the dev server automatically if one
 * isn't already running on :3000 - see `webServer` below) or `npx
 * playwright test --ui` for the interactive runner.
 *
 * Test tenants are NOT cleaned up automatically (there's no self-service
 * "delete my tenant" API, only a direct DB operation) - every run leaves a
 * handful of new `e2e-<timestamp>-*` tenants in the dev DB, same as the
 * ad-hoc manual verification scripts used throughout this project's
 * history. Harmless for a local dev DB; never point this at a shared or
 * production database.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Capped (not Playwright's usual cpuCount/2 default) - against `next dev`
  // (Turbopack, on-demand per-route compilation, not a prebuilt `next
  // start`), too much parallelism means many tests hitting first-time
  // routes simultaneously, and compiles queue up behind each other anyway -
  // more workers mostly just produces spurious timeouts, not a faster run.
  // A prebuilt/CI target wouldn't have this problem, but this suite is
  // meant to run against local dev day to day, so it's tuned for that.
  workers: 3,
  reporter: "list",
  // Generous - a first hit on an uncompiled route under Turbopack has taken
  // 15-20s+ in this project before (see PROGRESS.md); default to tolerating
  // that per-test rather than flaking on cold compiles.
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
