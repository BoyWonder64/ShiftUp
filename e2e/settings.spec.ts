import { test, expect } from "@playwright/test";
import { signUp } from "./helpers/auth";

test.describe("settings navigation", () => {
  test("ADMIN sees every section, including the renamed Calendar Display / Manage Calendars tabs", async ({ page }) => {
    const tenant = await signUp(page, { featureTier: "BOTH" });

    await page.goto(`/app/${tenant.slug}/admin/settings/account`);
    // Scoped to <main> - the header's own nav also has a "Dashboard" link
    // (getByRole without scoping matches both and fails Playwright's strict
    // mode, since AppHeader and the Settings sub-nav render in the same page).
    const settingsNav = page.locator("main");
    for (const label of [
      "Appointments",
      "Shifts",
      "Calendar Display",
      "Manage Calendars",
      "Dashboard",
      "Company Profile",
      "Staff",
      "Permissions",
      "Booking Widget",
      "Account",
    ]) {
      await expect(settingsNav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  });

  test("Manage Calendars lets an ADMIN create a free (not paid-gated) custom calendar", async ({ page }) => {
    const tenant = await signUp(page, { featureTier: "BOTH" });
    const name = `E2E Calendar ${Date.now()}`;

    await page.goto(`/app/${tenant.slug}/admin/settings/calendars`);
    await page.fill('input[placeholder="e.g. Site Visits"]', name);
    await page.click('button:has-text("+ Add calendar")');

    // The calendar's name renders as an editable <input>'s value, not plain
    // text (CustomCalendarsManager.tsx) - getByText() can't see it at all,
    // and would otherwise coincidentally match the same name appearing as
    // an <option> in Preset events' "Creates a" dropdown further down the
    // page instead (which Playwright correctly reports as not visible,
    // since <option> never is until its <select> is opened).
    await expect(page.getByDisplayValue(name)).toBeVisible();
    await expect(page.getByText(/upgrade/i)).not.toBeVisible();
  });

  test("Preset events can be created and then picked in the calendar create form", async ({ page }) => {
    const tenant = await signUp(page, { featureTier: "BOTH" });
    const label = `E2E Preset ${Date.now()}`;

    await page.goto(`/app/${tenant.slug}/admin/settings/calendars`);
    await page.fill('input[placeholder="e.g. Lunch outing"]', label);
    await page.click('button:has-text("+ Add preset")');
    await expect(page.getByText(label)).toBeVisible();

    await page.goto(`/app/${tenant.slug}/calendar/all`);
    await page.click('button:has-text("+ Add event")');
    await expect(page.getByRole("button", { name: new RegExp(label) })).toBeVisible();
  });
});
