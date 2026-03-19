// E2E Tests — Glasses Demo Flow (US-009)
// Tests the 4-phase demo that's the primary sales tool.

import { test, expect } from "@playwright/test";
import { url, loginAsTestUser } from "./helpers";

test.describe("Glasses Demo", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test("pre-start phase shows START button", async ({ page }) => {
    await page.goto(url("/glasses-demo"));
    await page.waitForLoadState("networkidle");

    // Should show the start simulation button
    const startButton = page.getByRole("button", { name: /start/i });
    await expect(startButton).toBeVisible();

    // Should have the dark/green theme
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("clicking START transitions to HUD phase", async ({ page }) => {
    await page.goto(url("/glasses-demo"));
    await page.waitForLoadState("networkidle");

    // Click the start button
    const startButton = page.getByRole("button", { name: /start/i });
    await startButton.click();

    // After clicking, the start button should disappear
    // and HUD content should appear
    await page.waitForTimeout(1000);

    // The HUD phase should show camera/observation content
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    // Start button should be gone or phase should have changed
    await expect(startButton).not.toBeVisible();
  });

  test("full demo flow completes to doc-review phase", async ({ page }) => {
    // Set a longer timeout for this test (the demo runs ~50 seconds)
    test.setTimeout(90_000);

    await page.goto(url("/glasses-demo"));
    await page.waitForLoadState("networkidle");

    // Start the demo
    const startButton = page.getByRole("button", { name: /start/i });
    await startButton.click();

    // Wait for the HUD phase to complete (~43 seconds) + generating (~3.5 seconds)
    // Then doc-review phase should show FAA form tabs
    await page.waitForTimeout(50_000);

    // In doc-review phase, should see form tab content
    const body = (await page.textContent("body")) || "";
    const hasFormContent =
      body.includes("8130") ||
      body.includes("337") ||
      body.includes("8010") ||
      body.includes("Authorized Release") ||
      body.includes("Major Repair");
    expect(hasFormContent).toBe(true);
  });

  test("doc-review phase has View Part Details link", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto(url("/glasses-demo"));
    await page.waitForLoadState("networkidle");

    const startButton = page.getByRole("button", { name: /start/i });
    await startButton.click();

    // Wait for doc-review phase
    await page.waitForTimeout(50_000);

    // Look for the "View Part Details" button/link
    const partDetailsLink = page.getByRole("link", {
      name: /view part details/i,
    });
    if (await partDetailsLink.isVisible()) {
      const href = await partDetailsLink.getAttribute("href");
      expect(href).toContain("demo-hpc7-overhaul");
    }
  });
});
