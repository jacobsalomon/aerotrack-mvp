import { expect, test } from "@playwright/test";
import { loginAsTestUser, url } from "./helpers";

test.describe("Executive Demo", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test("starts from the demo landing page and advances into the sessions flow", async ({
    page,
  }) => {
    await page.goto(url("/demo"));
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", {
        name: /take a buyer from paperwork pain to verified roi/i,
      })
    ).toBeVisible();

    await page.getByRole("link", { name: /start guided demo/i }).click();

    await expect(page).toHaveURL(/\/aerovision\/demo\?demo=executive&step=intro/);
    await expect(
      page.getByRole("heading", { name: "Pain, Proof, Trust, ROI" })
    ).toBeVisible();

    await page.getByRole("button", { name: /^Next$/i }).click();

    await expect(page).toHaveURL(/\/aerovision\/sessions\?demo=executive&step=pain/);
    await expect(page.getByText("Pain: Review Queue")).toBeVisible();
    await expect(page.getByText("Pending Review")).toBeVisible();
  });
});
