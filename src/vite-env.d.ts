/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string;
  /** URL del deployment Convex, inserito al build (`convex deploy --cmd`, o .env.worktree nei worktree). */
  readonly VITE_CONVEX_URL?: string;
  /** URL del sito HTTP del deployment Convex (httpAction), inserito al build. */
  readonly VITE_CONVEX_SITE_URL?: string;
  /** Build e2e locale (es. PostHog senza compressione dal traguardo 8): mai su Vercel. */
  readonly VITE_E2E?: string;
  /** DSN di Sentry (pubblico), per client e server; nei build e2e il sink locale. */
  readonly VITE_SENTRY_DSN?: string;
  /** Project API key di PostHog (phc_, pubblica); i build e2e usano una chiave finta. */
  readonly VITE_POSTHOG_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
