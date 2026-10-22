/* ──────────────────────────────────────────────────────────────
   Osservabilità sul server (PIANO §1.12, traguardo 8). È il primo import
   di src/server.ts: Sentry parte quando Nitro carica il codice di Start,
   cioè alla prima richiesta di pagina, API o server function.

   - Sentry: solo errori, `dataCollection` tutto spento, ogni evento e
     breadcrumb ripulito da shared/scrub.ts, che qui riceve anche i VALORI
     dei segreti del server (letti una volta da process.env, mai scritti da
     nessuna parte) per oscurarli se finissero in un messaggio d'errore.
     Redirect e notFound di TanStack non sono errori: non partono.
   - DSN: quello del build (import.meta.env.VITE_SENTRY_DSN), come gli URL
     Convex (§1.6): così il server usa sempre lo stesso DSN del client, e
     nei test e2e solo il sink locale.
   - Test e2e (E2E=1, fuori da Vercel): ambiente "e2e" e solo un DSN locale
     (osservabilita/sentry.ts). Il PostHog finto dietro /ingest lo carica
     scripts/e2e-server.mjs (scripts/e2e-ingest.mjs), non questo file.
   ────────────────────────────────────────────────────────────── */

import * as Sentry from "@sentry/tanstackstart-react";
import { isNotFound, isRedirect } from "@tanstack/react-router";
import { scrubBreadcrumb, scrubSentryEvent } from "../shared/scrub.ts";
import { ambiente, DATA_COLLECTION, dsnSentry } from "./osservabilita/sentry.ts";

const env = process.env;
const e2e = env.E2E === "1" && !env.VERCEL;

/* I valori dei segreti del server (nomi come quelli di bundle-guard; i VITE_* sono pubblici). */
const NOME_SEGRETO = /SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|_KEY$|_KEY_|^KEY$/i;
const segreti = Object.entries(env)
  .filter(([nome, valore]) => !!valore && valore.length >= 8 && !nome.startsWith("VITE_") && NOME_SEGRETO.test(nome))
  .map(([, valore]) => valore as string);

const dsn = dsnSentry(import.meta.env.VITE_SENTRY_DSN, e2e);

if (dsn) {
  Sentry.init({
    dsn,
    environment: ambiente(e2e),
    dataCollection: DATA_COLLECTION,
    sendClientReports: false,
    beforeSend: (event, hint) => {
      const err = hint?.originalException;
      if (isRedirect(err) || isNotFound(err)) return null;
      return scrubSentryEvent(event, { segreti });
    },
    beforeBreadcrumb: crumb => scrubBreadcrumb(crumb, { segreti }),
  });
}
