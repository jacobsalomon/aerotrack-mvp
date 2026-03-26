import { test, expect } from "@playwright/test";
import { url } from "./helpers";

const publicPages = [
  { path: "/login", heading: "AeroVision", button: "Sign In" },
  { path: "/forgot-password", heading: "Reset Password", button: "Send Reset Link" },
  { path: "/register", heading: "Create Account", button: "Create Account" },
];

test.describe("Public page smoke", () => {
  for (const pageConfig of publicPages) {
    test(`${pageConfig.path} renders its primary CTA`, async ({ page }) => {
      await page.goto(url(pageConfig.path));
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: pageConfig.heading })).toBeVisible();
      await expect(page.getByRole("button", { name: pageConfig.button })).toBeVisible();
    });
  }
});
