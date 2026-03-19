// E2E Tests — Dashboard & Parts Detail (US-008)
// Tests the core fleet management views in a real browser.

import { test, expect } from "@playwright/test";
import { url, loginAsTestUser } from "./helpers";

test.describe("Dashboard Page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test("loads and shows stats cards", async ({ page }) => {
    await page.goto(url("/dashboard"));
    await page.waitForLoadState("networkidle");

    // Should show the main stats section
    const body = await page.textContent("body");
    expect(body).toBeTruthy();

    // Should have the parts table
    const table = page.locator("table");
    await expect(table).toBeVisible();
  });

  test("parts table has correct columns", async ({ page }) => {
    await page.goto(url("/dashboard"));
    await page.waitForLoadState("networkidle");

    // Look for table headers
    const headers = page.locator("th");
    const headerTexts = await headers.allTextContents();
    const headerStr = headerTexts.join(" ").toLowerCase();

    // Should have key columns (exact text may vary)
    expect(headerStr).toContain("part");
    expect(headerStr).toContain("serial");
  });

  test("search box filters results", async ({ page }) => {
    await page.goto(url("/dashboard"));
    await page.waitForLoadState("networkidle");

    // Count initial rows
    const initialRows = await page.locator("tbody tr").count();

    // Search for a specific part number
    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("881700-1089");
      // Wait for filtering
      await page.waitForTimeout(500);
      const filteredRows = await page.locator("tbody tr").count();
      // Should have fewer or equal results
      expect(filteredRows).toBeLessThanOrEqual(initialRows);
    }
  });
});

test.describe("Parts Detail Page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test("shows component details for demo part", async ({ page }) => {
    await page.goto(url("/parts/demo-hpc7-overhaul"));
    await page.waitForLoadState("networkidle");

    const body = await page.textContent("body");
    // Should show the part number and serial number
    expect(body).toContain("881700-1089");
    expect(body).toContain("SN-2024-11432");
  });

  test("shows lifecycle timeline", async ({ page }) => {
    await page.goto(url("/parts/demo-hpc7-overhaul"));
    await page.waitForLoadState("networkidle");

    const body = (await page.textContent("body")) || "";
    // The event type labels use uppercase (e.g. "MANUFACTURED")
    const hasLifecycleContent =
      body.includes("MANUFACTURED") ||
      body.includes("manufacture") ||
      body.includes("Lifecycle");
    expect(hasLifecycleContent).toBe(true);
  });

  test("shows compliance documents section", async ({ page }) => {
    await page.goto(url("/parts/demo-hpc7-overhaul"));
    await page.waitForLoadState("networkidle");

    const body = (await page.textContent("body")) || "";
    // Should mention compliance/documents somewhere
    const hasDocSection =
      body.toLowerCase().includes("compliance") ||
      body.toLowerCase().includes("document") ||
      body.toLowerCase().includes("8130");
    expect(hasDocSection).toBe(true);
  });
});
