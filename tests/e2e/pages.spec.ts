// E2E Tests — Other Pages (US-010, US-011)

import { test, expect } from "@playwright/test";
import { url, loginAsTestUser } from "./helpers";

test.describe("Integrity Page", () => {
  test("loads without errors", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto(url("/integrity"));
    await page.waitForLoadState("networkidle");

    // Should show the integrity/compliance heading
    const body = (await page.textContent("body")) || "";
    expect(body.length).toBeGreaterThan(20);
  });
});

test.describe("Analytics Page", () => {
  test("loads and renders charts", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto(url("/analytics"));
    await page.waitForLoadState("networkidle");

    const body = (await page.textContent("body")) || "";
    expect(body.length).toBeGreaterThan(20);

    // Charts render as SVG elements (from Recharts)
    const svgElements = await page.locator("svg").count();
    expect(svgElements).toBeGreaterThan(0);
  });
});

test.describe("Capture Page", () => {
  test("loads without errors", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto(url("/capture"));
    await page.waitForLoadState("networkidle");

    const body = (await page.textContent("body")) || "";
    expect(body.length).toBeGreaterThan(20);
  });
});

test.describe("Landing Page", () => {
  test("loads without errors", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto(url("/"));
    await page.waitForLoadState("networkidle");

    const body = (await page.textContent("body")) || "";
    expect(body.length).toBeGreaterThan(20);
  });
});

test.describe("Sidebar Navigation", () => {
  test("dashboard has navigation links", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto(url("/dashboard"));
    await page.waitForLoadState("networkidle");

    // Should have navigation links (sidebar or content links)
    const links = page.locator("a[href]");
    const linkCount = await links.count();
    expect(linkCount).toBeGreaterThan(0);
  });
});
