import { test, expect } from "@playwright/test";
import { signUp } from "./helpers/auth";

/**
 * Doesn't exercise real email delivery (no RESEND_API_KEY/EMAIL_FROM
 * configured in most dev environments - see .env.example) - that half is
 * manually checked per VERIFY.md's password-reset entry instead. This
 * covers everything that doesn't need a real inbox: the request flow's
 * response shape/no-enumeration behavior, and the confirm endpoint
 * correctly rejecting bad input.
 */
test.describe("password reset (no real email delivery)", () => {
  test("requesting a reset shows the identical generic message for a real account and an unknown email", async ({ page }) => {
    const tenant = await signUp(page);
    await page.click('button:has-text("Sign out"), a:has-text("Sign out")');
    await page.waitForURL(/\/login|\/$/);

    // Waiting for the specific success text (rather than grabbing
    // page.textContent("body") right after the click) matters here: the
    // confirmation only replaces the form after the POST resolves, and
    // page.textContent("body") would otherwise race it - worse, "body"
    // picks up Next's inline RSC/hydration <script> payloads too, which can
    // contain unrelated boilerplate text that makes a raw substring check
    // unreliable regardless of timing.
    const successText = /if an account exists for/i;

    await page.goto("/forgot-password");
    await page.fill('input[type="email"]', tenant.email);
    await page.click('button[type="submit"]');
    await expect(page.getByText(successText)).toBeVisible();

    await page.goto("/forgot-password");
    await page.fill('input[type="email"]', `nobody-${Date.now()}@example.com`);
    await page.click('button[type="submit"]');
    await expect(page.getByText(successText)).toBeVisible();
  });

  test("confirming with a bogus token is rejected, not silently accepted", async ({ page }) => {
    const res = await page.request.post("/api/auth/password-reset/confirm", {
      data: { token: "not-a-real-token", newPassword: "SomeNewPassword123!" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid or has expired/i);
  });

  test("the reset-password page without a token shows an error instead of a broken form", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText(/missing its reset token/i)).toBeVisible();
  });
});
