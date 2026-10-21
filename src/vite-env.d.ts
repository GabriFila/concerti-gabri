/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string;
  /** URL del deployment Convex, inserito al build (`convex deploy --cmd`, o .env.worktree nei worktree). */
  readonly VITE_CONVEX_URL?: string;
  /** URL del sito HTTP del deployment Convex (httpAction), inserito al build. */
  readonly VITE_CONVEX_SITE_URL?: string;
  /** Build e2e locale (es. PostHog senza compressione dal traguardo 8): mai su Vercel. */
  readonly VITE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
