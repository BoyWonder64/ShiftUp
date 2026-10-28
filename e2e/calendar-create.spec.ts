import { test, expect } from "@playwright/test";
import { signUp, createStaffMember } from "./helpers/auth";

/**
 * Covers the calendar create flow rebuilt in the 2026-10-24/25 sessions
 * (see PROGRESS.md): one "+ Add event" button everywhere, the in-form
 * "This is a..." type switcher, and the "Custom event" quick-create. Every
 * tenant signs up on the BOTH tier so both Appointments and Shifts are
 * available (and therefore the switcher actually has something to switch
 * between).
 */
test.describe("calendar create flow", () => {
  test("the combined 'All' calendar shows exactly one '+ Add event' button with a type switcher", async ({ page }) => {
    const tenant = await signUp(page, { featureTier: "BOTH" });
    await createStaffMember(page);

    await page.goto(`/app/${tenant.slug}/calendar/all`);
    const addButtons = page.locator('button:has-text("+ Add event")');
    await expect(addButtons).toHaveCount(1);

    await addButtons.click();
    await expect(page.getByText("This is a...")).toBeVisible();
    await expect(page.getByRole("button", { name: "Appointment", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Shift", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Custom event", exact: true })).toBeVisible();
  });

  test("a fixed-kind page (Shifts only) still offers the switcher, including Custom event", async ({ page }) => {
    const tenant = await signUp(page, { featureTier: "BOTH" });
    await createStaffMember(page);

    await page.goto(`/app/${tenant.slug}/calendar/shifts`);
    await page.click('button:has-text("+ Add event")');
    await expect(page.getByText("This is a...")).toBeVisible();
    await expect(page.getByRole("button", { name: "Custom event", exact: true })).toBeVisible();
  });

  test("creating a shift through the full form shows it on the calendar", async ({ page }) => {
    const tenant = await signUp(page, { featureTier: "BOTH" });
    const staffer = await createStaffMember(page);

    await page.goto(`/app/${tenant.slug}/calendar/shifts`);
    await page.click('button:has-text("+ Add event")');
    // Wait for the real staff member to actually be the selected option
    // before submitting - the Staff <select> defaults to "+ Add new staff
    // member" until GET /api/staff resolves, and submitting too early hits
    // the (empty, unfilled) inline new-staff sub-form instead.
    await expect(page.locator("form").getByRole("combobox").first()).toHaveValue(staffer.id);

    await page.click('button[type="submit"]:has-text("Create shift")');
    await expect(page.getByText(/couldn't create/i)).not.toBeVisible();
    // The modal closes on success - its own "New shift" heading disappears
    // (the toolbar's own Cancel button stays in the DOM, just invisible,
    // regardless of modal state - not a reliable "did it close" signal).
    await expect(page.getByRole("heading", { name: "New shift" })).toHaveCount(0);
  });

  test("a Custom event gets its own minimal form and shows up with its free-text title", async ({ page }) => {
    const tenant = await signUp(page, { featureTier: "BOTH" });
    await createStaffMember(page);
    const title = `E2E lunch outing ${Date.now()}`;

    await page.goto(`/app/${tenant.slug}/calendar/shifts`);
    await page.click('button:has-text("+ Add event")');
    await page.click('button:has-text("Custom event")');

    // The lightweight form - no client/job-type/payment fields, just these.
    await expect(page.getByText("Title")).toBeVisible();
    await expect(page.getByText("File under")).toBeVisible();
    await page.fill('input[placeholder="e.g. Lunch outing"]', title);
    await page.click('button:has-text("Create event")');

    await expect(page.getByText(/couldn't create/i)).not.toBeVisible();
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
  });

  test("switching the type mid-form clears fields from the previous type (no stale data)", async ({ page }) => {
    const tenant = await signUp(page, { featureTier: "BOTH" });
    await createStaffMember(page);

    await page.goto(`/app/${tenant.slug}/calendar/all`);
    await page.click('button:has-text("+ Add event")');
    await page.click('button:has-text("Custom event")');
    await page.fill('input[placeholder="e.g. Lunch outing"]', "Should not survive a type switch");

    await page.click('button:has-text("Appointment")');
    // Back in the full form now - the custom-event title field shouldn't exist here at all.
    await expect(page.locator('input[placeholder="e.g. Lunch outing"]')).toHaveCount(0);
    // The heading specifically - a draft "ghost" event on the calendar grid
    // behind the modal also renders "New ..." text, so a bare getByText
    // match is ambiguous between the two.
    await expect(page.getByRole("heading", { name: "New appointment" })).toBeVisible();
  });
});
