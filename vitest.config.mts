import { defineConfig } from "vitest/config";
import path from "node:path";
import "dotenv/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // e2e/**/*.spec.ts are Playwright specs (real-browser tests, run via
    // `npm run test:e2e`), not vitest ones - they use @playwright/test's
    // own test()/expect(), which vitest's default *.spec.ts discovery would
    // otherwise also try to pick up and fail to run.
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
