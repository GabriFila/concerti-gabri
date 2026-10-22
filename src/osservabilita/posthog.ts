/* ──────────────────────────────────────────────────────────────
   PostHog nel browser (PIANO §1.13, traguardo 8). Solo client: lo importa
   instrument.client.ts, e Identifica.tsx solo dentro un effetto.

   - Senza cookie (`cookieless_mode: 'always'`, persistenza in memoria):
     l'identità del visitatore la calcola PostHog sul server con un hash
     giornaliero, niente cookie né localStorage né sessionStorage.
   - Tutto passa da /ingest, il proxy di Nitro (vite.config.ts) che toglie
     Cookie e Authorization della nostra origine.
   - Un pageview per ogni navigazione del router ('history_change': solo
     quando cambia il percorso, non per query o #sec-…).
   - Spenti: autocapture, rageclick, dead click, heatmap, eccezioni (le
     segue Sentry), performance, replay, sondaggi, tour, conversazioni,
     esperimenti, feature flag e qualunque script esterno.
   - `before_send` passa ogni evento da shared/scrub.ts.
   - I proprietari loggati: `identify(profileId)` a ogni caricamento (la
     memoria si azzera a ogni pagina), solo l'id opaco; `reset()` all'uscita
     (esci() in lib/auth-client.ts, prima del reload) e quando il profilo
     sparisce senza reload (account eliminato: me.profile → null).
   Nei build e2e (VITE_E2E=1) la chiave è finta, gli eventi non sono
   compressi e /ingest finisce nello stand-in locale (scripts/e2e-ingest.mjs):
   un test non manda mai niente al PostHog vero.
   ────────────────────────────────────────────────────────────── */

import posthog from "posthog-js";
import { scrubPosthogEvent } from "../../shared/scrub.ts";

const E2E = import.meta.env.VITE_E2E === "1";
/** La Project API key (phc_, pubblica). Nei build e2e una finta. */
const CHIAVE = E2E ? "phc_e2e_locale" : import.meta.env.VITE_POSTHOG_KEY;

let attivo = false;
let identificato: string | null = null;

export function avviaPosthog(): void {
  if (attivo || !CHIAVE || typeof window === "undefined") return;
  posthog.init(CHIAVE, {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    defaults: "2026-05-30",
    cookieless_mode: "always",
    persistence: "memory",
    person_profiles: "identified_only",
    capture_pageview: "history_change",
    autocapture: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    // localhost non diventa un "utente interno" (che attiverebbe i profili persona)
    internal_or_test_user_hostname: null,
    disable_compression: E2E,
    before_send: event => scrubPosthogEvent(event),
  });
  attivo = true;
}

/** Il proprietario loggato (id opaco del profilo) o null; identify/reset solo quando cambia. */
export function identificaProprietario(profileId: string | null): void {
  if (!attivo) return;
  if (profileId && profileId !== identificato) {
    // nessuna proprietà: niente email, handle o nome nella persona di PostHog
    posthog.identify(profileId);
    identificato = profileId;
  } else if (!profileId && identificato) {
    posthog.reset();
    identificato = null;
  }
}
