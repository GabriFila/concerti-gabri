/* ──────────────────────────────────────────────────────────────
   Il plugin Sentry del build (PIANO §1.12, traguardo 8), ultimo dei plugin
   di vite.config.ts. Org e progetto stanno qui (DECISIONI: nel codice, non
   nell'env).

   - Nel build di Vercel (VERCEL=1) con SENTRY_AUTH_TOKEN: source map
     `hidden` (nessun commento sourceMappingURL nei file), caricate su
     Sentry e poi cancellate da tutte le cartelle di output, quindi mai
     servite.
   - Altrimenti (in locale, nelle corsie, negli e2e, anche con il token
     nell'ambiente di t3node): nessuna source map, niente caricamenti,
     nessuna release né set-commits: il build non parla con Sentry. Il
     token è "" e non undefined perché il plugin e @sentry/bundler-plugins
     ripiegano con `??` su process.env.SENTRY_AUTH_TOKEN, e con un token la
     release partirebbe lo stesso nel writeBundle.
   - Le mappe da cancellare sono sempre le nostre: senza, il plugin
     ripiega su tutte le .map del repository, anche fuori da Vercel.
   - Telemetria del plugin spenta; niente strumentazione automatica dei
     middleware (il middleware è già in src/start.ts) né delle librerie
     server al build (solo errori: niente tracing).
   ────────────────────────────────────────────────────────────── */

import { sentryTanstackStart, type SentryTanstackStartOptions } from "@sentry/tanstackstart-react/vite";

export const SENTRY_ORG = "gabriele-filaferro";
export const SENTRY_PROJECT = "concerti-gabri";

/** Dove possono finire le source map del build (locale, Vercel, intermedi): dopo il caricamento si cancellano. */
export const MAPPE_DA_CANCELLARE = [".output/**/*.map", ".vercel/output/**/*.map", "dist/**/*.map", "node_modules/.nitro/**/*.map"];

export function opzioniSentryBuild(env: Record<string, string | undefined> = process.env): SentryTanstackStartOptions {
  // solo il build di Vercel carica: su t3node fnox mette il token in ogni sessione
  const token = (env.VERCEL === "1" && env.SENTRY_AUTH_TOKEN) || "";
  return {
    org: SENTRY_ORG,
    project: SENTRY_PROJECT,
    authToken: token,
    sourcemaps: { disable: !token, filesToDeleteAfterUpload: MAPPE_DA_CANCELLARE },
    release: token ? { create: true, finalize: true } : { create: false, finalize: false, setCommits: false },
    telemetry: false,
    silent: !token,
    autoInstrumentMiddleware: false,
    buildTimeInstrumentation: false,
  };
}

export const sentryBuild = (env: Record<string, string | undefined> = process.env) => sentryTanstackStart(opzioniSentryBuild(env));
