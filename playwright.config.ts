import { defineConfig, devices } from "@playwright/test";

// The app uses basePath "/aerovision-demo", so all URLs must include it.
// We set baseURL to just the origin, and all test URLs include the basePath.
export const BASE_PATH = "/aerovision";

export default defineConfig({
  // Look for E2E test files matching *.spec.ts
  testDir: "tests/e2e",
  // Give each test up to 30 seconds
  timeout: 30_000,
  // Retry failed tests once (catches flaky timing issues)
  retries: 1,
  // Run tests one at a time (they share a dev server)
  workers: 1,
  // Report results with clear output
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    // Base URL is just the origin — tests prepend BASE_PATH to all URLs
    baseURL: "http://localhost:3000",
    // Take a screenshot on failure for debugging
    screenshot: "only-on-failure",
    // Record a trace on failure for step-by-step debugging
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start the dev server automatically before running E2E tests
  webServer: {
    command: "npm run dev",
    port: 3000,
    // Wait up to 60 seconds for the dev server to start
    timeout: 60_000,
    // Reuse an existing server if one is already running
    reuseExistingServer: true,
  },
});
