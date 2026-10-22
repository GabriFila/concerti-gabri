import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import { sentryBuild } from "./instrument.build.ts";

// le credenziali della nostra origine non escono mai dal proxy /ingest
const SENZA_CREDENZIALI = ["cookie", "authorization"];

// TanStack Start (SSR) + Nitro. Su Vercel Nitro sceglie da solo il preset
// `vercel` e scrive .vercel/output; le funzioni girano a Dublino (dub1),
// accanto a Convex EU. In locale `vite build` produce .output (node-server).
export default defineConfig({
  server: {
    // portless passa PORT; senza, la porta fissa del dev su t3node
    port: Number(process.env.PORT) || 3100,
    strictPort: true,
    // Vite blocca gli Host sconosciuti: l'URL tailnet che espone la 3100
    // (*.localhost di portless è già ammesso)
    allowedHosts: ["t3node.tail4a8e3b.ts.net"],
  },
  define: {
    // per il titolo delle preview ("<branch> · Gabri ai concerti"): valori del
    // build, sul client process.env non esiste
    __VERCEL_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? ""),
    __VERCEL_GIT_COMMIT_REF__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_REF ?? ""),
  },
  // il componente Better Auth di Convex va compilato con l'SSR (guida
  // ufficiale per TanStack Start): fissato qui nel traguardo 2, usato dal 3
  ssr: { noExternal: ["@convex-dev/better-auth"] },
  plugins: [
    tanstackStart(),
    nitro({
      vercel: { functions: { regions: ["dub1"] } },
      // PostHog via /ingest (PIANO §1.13, usato dal traguardo 8). Prima i
      // percorsi più specifici. Gli header di sicurezza stanno in
      // vercel.json: una regola '/**' con soli header qui oscurerebbe
      // queste regole.
      // `filterHeaders`: Cookie e Authorization della NOSTRA origine (dal
      // traguardo 3 c'è il cookie di sessione di Better Auth, path "/") non
      // vanno mai a PostHog. h3 inoltra ogni header salvo gli hop-by-hop, e
      // una rewrite della CDN di Vercel inoltrerebbe anche i cookie: con
      // `filterHeaders` Nitro tiene la regola come proxy nella funzione
      // (dub1) invece della rewrite CDN, in dev e su Vercel. Verifica sulla
      // preview nello spike del traguardo 8.
      routeRules: {
        "/ingest/static/**": { proxy: { to: "https://eu-assets.i.posthog.com/static/**", filterHeaders: SENZA_CREDENZIALI } },
        "/ingest/array/**": { proxy: { to: "https://eu-assets.i.posthog.com/array/**", filterHeaders: SENZA_CREDENZIALI } },
        "/ingest/**": { proxy: { to: "https://eu.i.posthog.com/**", filterHeaders: SENZA_CREDENZIALI } },
      },
    }),
    // react's vite plugin must come after start's vite plugin
    viteReact(),
    // Sentry per ultimo (traguardo 8): source map solo con SENTRY_AUTH_TOKEN, cancellate dopo l'upload
    sentryBuild(),
  ],
});
