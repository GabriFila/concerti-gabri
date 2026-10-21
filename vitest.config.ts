import { defineConfig } from "vitest/config";

// Unit tests (Vitest), separate from vite.config.ts so the Start/Nitro plugins
// never load here. The e2e suite runs separately with Playwright.
export default defineConfig({
  define: {
    __VERCEL_ENV__: JSON.stringify(""),
    __VERCEL_GIT_COMMIT_REF__: JSON.stringify(""),
  },
  test: {
    include: ["src/**/*.test.ts", "shared/**/*.test.ts", "convex/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
