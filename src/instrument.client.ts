/* ──────────────────────────────────────────────────────────────
   Osservabilità nel browser (PIANO §1.12–1.13, traguardo 8). È il primo
   import di src/client.tsx: Sentry deve esserci prima dell'idratazione.

   Sentry: solo errori (nessuna integrazione di replay, feedback o tracing,
   nessun tracesSampleRate, niente sessioni), `dataCollection` tutto spento
   (osservabilita/sentry.ts) e ogni evento e breadcrumb ripulito da
   shared/scrub.ts. Il DSN è pubblico e arriva al build (VITE_SENTRY_DSN);
   nei build e2e vale solo un sink locale.
   PostHog: osservabilita/posthog.ts.
   ────────────────────────────────────────────────────────────── */

import * as Sentry from "@sentry/tanstackstart-react";
import { scrubBreadcrumb, scrubSentryEvent } from "../shared/scrub.ts";
import { avviaPosthog } from "./osservabilita/posthog.ts";
import { ambiente, DATA_COLLECTION, dsnSentry } from "./osservabilita/sentry.ts";

const e2e = import.meta.env.VITE_E2E === "1";
const dsn = dsnSentry(import.meta.env.VITE_SENTRY_DSN, e2e);

if (dsn) {
  Sentry.init({
    dsn,
    environment: ambiente(e2e),
    dataCollection: DATA_COLLECTION,
    // le sessioni (release health) partirebbero a ogni caricamento: qui si tengono solo gli errori
    integrations: defaults => defaults.filter(i => i.name !== "BrowserSession"),
    sendClientReports: false,
    beforeSend: event => scrubSentryEvent(event),
    beforeBreadcrumb: crumb => scrubBreadcrumb(crumb),
  });
}

avviaPosthog();
