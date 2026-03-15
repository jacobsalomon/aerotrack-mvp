// Sentry client-side configuration — captures JavaScript errors and
// performance data from the browser (page loads, navigation, user interactions).

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Browser tracing is automatic in @sentry/nextjs — no extra integration needed
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Capture console.error calls as breadcrumbs (helpful for debugging)
  integrations: [Sentry.breadcrumbsIntegration({ console: true })],

  environment: process.env.NODE_ENV || "development",

  // Don't send events if no DSN is configured (local dev without Sentry)
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
