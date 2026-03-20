import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to node environment (fast) — component tests opt into jsdom
    // via a // @vitest-environment jsdom comment at the top of the file
    environment: "node",
    // Unit tests only — API tests run via Playwright (see tests/e2e/)
    include: ["tests/unit/**/*.test.ts", "tests/smoke.test.ts"],
    // Use a separate test database so tests never touch dev data
    env: {
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      // Match the @/* path alias from tsconfig.json
      "@": path.resolve(__dirname, "."),
    },
  },
});
