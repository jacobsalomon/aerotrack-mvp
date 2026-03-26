import { defineConfig, devices } from "@playwright/test";

// The app uses basePath "/aerovision", so all test URLs include the basePath.
// Base URL stays at the origin, and tests prepend BASE_PATH themselves.
export const BASE_PATH = "/aerovision";
const webServerCommand = process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? "npm run dev";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 1,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Local runs use `npm run dev`; CI overrides this to `npm run start`
  // so browser smoke validates the production build that was just created.
  webServer: {
    command: webServerCommand,
    port: 3000,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
});
