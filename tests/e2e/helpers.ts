// Shared helpers for E2E tests.
// All URLs need the basePath prefix because Next.js serves under /aerovision.
// All pages are behind NextAuth session-based auth.

import type { Page } from "@playwright/test";

export const BASE_PATH = "/aerovision";

/** Prepend the basePath to a route path. e.g. url("/dashboard") → "/aerovision/dashboard" */
export function url(path: string): string {
  return `${BASE_PATH}${path}`;
}

/** Headers that include a valid session cookie for protected API routes.
 *  In E2E tests, you'll need to log in via the UI or set a session cookie. */
export const authHeaders = {
  Cookie: "authjs.session-token=test-session",
};

/** Log in by filling out the login form.
 *  Requires a test user to exist in the database. */
export async function loginAsTestUser(page: Page, email = "test@example.com", password = "testpassword123") {
  await page.goto(url("/login"));
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Wait for redirect to dashboard
  await page.waitForURL(/\/(demo|dashboard)/);
}
