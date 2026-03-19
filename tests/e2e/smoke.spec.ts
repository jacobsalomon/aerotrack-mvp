// E2E smoke test — verifies Playwright can reach the app.
// If this passes, the dev server and browser automation work.

import { test, expect } from "@playwright/test";
import { url, loginAsTestUser } from "./helpers";

test("app loads and shows the landing page", async ({ page }) => {
  await loginAsTestUser(page);
  // Navigate to the app root (basePath prepended by url() helper)
  await page.goto(url("/"));
  // The page should have some content — not a blank error page
  await expect(page.locator("body")).not.toBeEmpty();
});
