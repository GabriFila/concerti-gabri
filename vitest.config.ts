import { defineConfig } from "vitest/config";

// Unit tests (Vitest), separate from vite.config.ts so the Start/Nitro plugins
// never load here. The e2e suite runs separately with Playwright.
// Two projects (PIANO §2, T2):
// - unit: node, src/ shared/ scripts/;
// - convex: edge-runtime (like Convex), convex-test; the components' ./test
//   helpers ship raw TS with import.meta.glob, so they are inlined.
export default defineConfig({
  define: {
    __VERCEL_ENV__: JSON.stringify(""),
    __VERCEL_GIT_COMMIT_REF__: JSON.stringify(""),
  },
  test: {
    exclude: ["**/node_modules/**", "e2e/**"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          // privacy.test.ts legge i sorgenti con node:fs: gira in node
          include: ["src/**/*.test.ts", "shared/**/*.test.ts", "scripts/**/*.test.ts", "convex/privacy.test.ts"],
          // query.test.ts semina un backend convex-test: gira nel progetto convex
          exclude: ["**/node_modules/**", "src/server/oracolo/query.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/**/*.test.ts", "src/server/oracolo/query.test.ts"],
          exclude: ["**/node_modules/**", "convex/privacy.test.ts"],
          server: { deps: { inline: ["convex-test", "@convex-dev/rate-limiter", "@convex-dev/better-auth"] } },
        },
      },
    ],
  },
});
