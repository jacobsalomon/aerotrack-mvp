import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const origin = "http://localhost:3005";
const basePath = "/aerovision-demo";
const screenshotDir = join(process.cwd(), "screenshots", "ux-review-updated");

const desktopChecks = [
  {
    path: "/demo",
    waitText: "Start Guided Demo",
    screenshot: "demo.png",
  },
  {
    path: "/sessions",
    waitText: "Mike Chen",
    screenshot: "sessions.png",
    absentTexts: ["Review queue unavailable"],
  },
  {
    path: "/sessions/test-session-reviewer-cockpit",
    waitText: "Audit Trail",
    screenshot: "session-detail.png",
    absentTexts: ["Reviewer cockpit unavailable", "API error: 500"],
  },
  {
    path: "/parts/demo-hpc7-overhaul",
    waitText: "HPC-7 Hydraulic Pump",
    screenshot: "part-detail.png",
  },
];

async function buildContext(browser, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([
    {
      name: "av-session",
      value: "authenticated",
      url: origin,
    },
  ]);
  await context.addInitScript(() => {
    window.sessionStorage.setItem("demo-unlocked", "true");
  });
  return context;
}

async function verifyRoute(context, check) {
  const page = await context.newPage();
  await page.goto(`${origin}${basePath}${check.path}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.getByText(check.waitText, { exact: false }).first().waitFor({
    state: "visible",
    timeout: 30_000,
  });

  for (const text of check.absentTexts ?? []) {
    if ((await page.getByText(text, { exact: false }).count()) > 0) {
      throw new Error(`Unexpected text "${text}" found on ${check.path}`);
    }
  }

  await page.screenshot({
    path: join(screenshotDir, check.screenshot),
    fullPage: true,
  });
  await page.close();
}

async function main() {
  mkdirSync(screenshotDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    const desktop = await buildContext(browser, { width: 1440, height: 1024 });
    for (const check of desktopChecks) {
      await verifyRoute(desktop, check);
    }
    await desktop.close();

    const narrow = await buildContext(browser, { width: 768, height: 1024 });
    const narrowPage = await narrow.newPage();
    await narrowPage.goto(`${origin}${basePath}/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await narrowPage
      .getByText("Parts Fleet Overview", { exact: false })
      .waitFor({ state: "visible", timeout: 30_000 });
    await narrowPage.getByLabel("Open navigation").waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await narrowPage.screenshot({
      path: join(screenshotDir, "dashboard-narrow.png"),
      fullPage: true,
    });
    await narrowPage.getByLabel("Open navigation").click();
    await narrowPage.locator('[data-slot="sheet-content"]').waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await narrowPage.screenshot({
      path: join(screenshotDir, "dashboard-narrow-nav.png"),
      fullPage: true,
    });
    await narrow.close();

    console.log(
      JSON.stringify(
        {
          success: true,
          screenshotDir,
          routes: desktopChecks.map((check) => check.path).concat("/dashboard (768px)"),
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
