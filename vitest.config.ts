import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to node environment (fast) — component tests opt into jsdom
    // via a // @vitest-environment jsdom comment at the top of the file
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    // Unit tests only — API tests run via Playwright (see tests/e2e/)
    include: ["tests/unit/**/*.test.ts", "tests/smoke.test.ts"],
    // DB-backed exception-engine coverage should run in an integration context,
    // not in the fast staging/unit lane.
    exclude: ["tests/unit/exception-engine.test.ts"],
    // Block tests from hitting production DB — require explicit test database
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL || "postgresql://test:test@localhost:5432/aerovision_test",
    },
  },
  resolve: {
    alias: {
      // Match the @/* path alias from tsconfig.json
      "@": path.resolve(__dirname, "."),
      // Vitest runs in Node, so server-only should be a no-op marker.
      "server-only": path.resolve(__dirname, "tests/helpers/server-only.ts"),
    },
  },
});
