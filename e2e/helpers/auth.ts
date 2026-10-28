import { type Page, expect } from "@playwright/test";

export interface TestTenant {
  slug: string;
  email: string;
  username: string;
  password: string;
}

/**
 * Signs up a brand-new tenant through the real `/signup` flow and leaves
 * `page` logged in on its dashboard - the same entry point every real
 * tenant uses, so this also exercises POST /api/auth/signup end to end.
 * Returns the generated credentials so a test can log back in elsewhere
 * (a fresh browser context, after testing logout, etc.).
 */
export async function signUp(
  page: Page,
  opts?: { featureTier?: "BOTH" | "SHIFT_MANAGEMENT" | "APPOINTMENT_MANAGER"; businessName?: string }
): Promise<TestTenant> {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const tenant: TestTenant = {
    slug: `e2e-${stamp}`,
    email: `e2e-${stamp}@example.com`,
    username: `e2e${stamp}`,
    password: "E2ePassword123!",
  };

  const tierLabel =
    opts?.featureTier === "SHIFT_MANAGEMENT"
      ? "Shift management"
      : opts?.featureTier === "APPOINTMENT_MANAGER"
        ? "Appointment manager"
        : "Both";

  await page.goto("/signup");
  await page.click(`button:has-text("${tierLabel}")`);
  await page.fill('input[required][minlength="2"]', opts?.businessName ?? "E2E Test Co");
  await page.fill('input[pattern="[a-z0-9]+(-[a-z0-9]+)*"]', tenant.slug);
  await page.fill('input[type="email"]', tenant.email);
  await page.fill('input[pattern="[a-z0-9]+([_-][a-z0-9]+)*"]', tenant.username);
  await page.fill('input[type="password"] >> nth=0', tenant.password);
  await page.fill('input[type="password"] >> nth=1', tenant.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/app/${tenant.slug}/dashboard`);
  return tenant;
}

/** Logs in through the real `/login` form - username accepted per `findUserByEmailOrUsername`. */
export async function logIn(page: Page, creds: Pick<TestTenant, "username" | "password">) {
  await page.goto("/login");
  await page.fill('input:not([type="password"])', creds.username);
  await page.fill('input[type="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app\//);
}

/**
 * Creates a real StaffProfile via the API (faster than the inline "+ Add
 * new staff member" sub-form every calendar create test would otherwise
 * need to fill out) - requires an already-logged-in ADMIN `page`. Most
 * calendar-create tests need at least one staff member to assign an
 * entry to.
 */
export async function createStaffMember(page: Page, displayName = "E2E Staffer") {
  const rolesRes = await page.request.get("/api/roles");
  expect(rolesRes.ok()).toBeTruthy();
  const { roles } = (await rolesRes.json()) as { roles: Array<{ id: string }> };
  const roleId = roles[0]?.id;
  expect(roleId, "tenant should have at least one seeded default role").toBeTruthy();

  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const res = await page.request.post("/api/staff", {
    data: {
      displayName,
      email: `staffer-${stamp}@example.com`,
      username: `staffer${stamp}`,
      password: "StafferPass123!",
      roleId,
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const { staff } = (await res.json()) as { staff: { id: string; displayName: string } };
  return staff;
}
