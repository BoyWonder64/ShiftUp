import { test, expect } from "@playwright/test";
import { signUp, logIn } from "./helpers/auth";

test.describe("signup and login", () => {
  test("signing up lands on the new tenant's dashboard as ADMIN", async ({ page }) => {
    const tenant = await signUp(page);
    await expect(page).toHaveURL(`/app/${tenant.slug}/dashboard`);
    // "Admin" alone is ambiguous - the dashboard's "Signed in as **Admin**"
    // and its "As Admin, you have full access..." line both bold the role
    // name separately, so a bare getByText("Admin") matches two elements.
    await expect(page.getByText(/signed in as\s*admin/i)).toBeVisible();
  });

  test("signing out then logging back in with username + password works", async ({ page }) => {
    const tenant = await signUp(page);
    await page.click('button:has-text("Sign out"), a:has-text("Sign out")');
    await page.waitForURL(/\/login|\/$/);

    await logIn(page, tenant);
    await expect(page).toHaveURL(new RegExp(`/app/${tenant.slug}/`));
  });

  test("a wrong password shows a generic error and doesn't navigate", async ({ page }) => {
    const tenant = await signUp(page);
    await page.click('button:has-text("Sign out"), a:has-text("Sign out")');
    await page.waitForURL(/\/login|\/$/);

    await page.goto("/login");
    await page.fill('input:not([type="password"])', tenant.username);
    await page.fill('input[type="password"]', "definitely-the-wrong-password");
    await page.click('button[type="submit"]');

    await expect(page.getByText(/invalid email\/username or password/i)).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("an unknown username also shows the identical generic error (no enumeration)", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input:not([type="password"])', `nobody-${Date.now()}`);
    await page.fill('input[type="password"]', "whatever-password-123");
    await page.click('button[type="submit"]');

    await expect(page.getByText(/invalid email\/username or password/i)).toBeVisible();
  });
});
