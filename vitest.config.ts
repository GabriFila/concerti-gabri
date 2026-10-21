import { defineConfig } from "vitest/config";

// Unit tests (Vitest). The e2e suite runs separately with Playwright.
// passWithNoTests keeps `pnpm vitest run` green until the first tests land.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "convex/**/*.test.ts", "scripts/**/*.test.ts"],
    passWithNoTests: true,
  },
});
