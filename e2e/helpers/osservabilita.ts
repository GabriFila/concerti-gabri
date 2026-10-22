/* ──────────────────────────────────────────────────────────────
   Sentry e PostHog negli e2e locali (traguardo 8): il sink di
   scripts/e2e-sink.mjs, che playwright.config.ts accende prima di Start.

   - SENTRY_DSN_E2E è il DSN dei build e2e (client e server): gli envelope
     arrivano al sink, mai al Sentry vero.
   - E2E_INGEST_URL (= SINK_URL) dice al server Start e2e dove deviare il
     proxy /ingest (scripts/e2e-ingest.mjs): PostHog finto, chiave finta.
   La porta è fissa perché il DSN entra nel bundle al build; le run e2e sono
   una alla volta (lock), quindi non si pestano i piedi.
   - PostHog scarta gli eventi dei browser automatizzati (navigator.webdriver
     e "HeadlessChrome" nello user agent o nei brand di userAgentData, il suo
     filtro anti-bot): le spec che aspettano traffico PostHog chiamano
     prima `comeUnVisitatore(page)`. La configurazione dell'app resta quella
     di produzione.
   ────────────────────────────────────────────────────────────── */

import type { Page } from "@playwright/test";

export const SINK_PORT = 3197;
export const SINK_URL = `http://127.0.0.1:${SINK_PORT}`;
export const SENTRY_DSN_E2E = `http://public@127.0.0.1:${SINK_PORT}/1`;

export interface InvioSentry {
  at: number;
  query: string;
  /** L'envelope com'è arrivato (testo). */
  body: string;
}

export interface RichiestaPosthog {
  at: number;
  method: string;
  /** /i/… (eu.i.posthog.com) o /assets/… (eu-assets.i.posthog.com). */
  path: string;
  query: string;
  headers: Record<string, string>;
  body: string;
}

export interface Sink {
  sentry: InvioSentry[];
  posthog: RichiestaPosthog[];
}

/**
 * Per PostHog il browser di `page` non è più un bot: navigator.webdriver = false e niente
 * userAgentData (Chromium headless mette "HeadlessChrome" tra i brand, anche quando
 * Playwright sostituisce lo user agent).
 */
export async function comeUnVisitatore(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const finto = (nome: string, valore: unknown) => Object.defineProperty(Navigator.prototype, nome, { get: () => valore, configurable: true });
    finto("webdriver", false);
    finto("userAgentData", undefined);
  });
}

export async function leggiSink(): Promise<Sink> {
  const res = await fetch(`${SINK_URL}/_sink`);
  return (await res.json()) as Sink;
}

export async function svuotaSink(): Promise<void> {
  await fetch(`${SINK_URL}/_sink`, { method: "DELETE" });
}

/** Gli item di un envelope Sentry: [intestazione dell'item, payload]. */
export function itemsEnvelope(body: string): { header: any; payload: any }[] {
  const righe = body.split("\n").filter(r => r.trim());
  const out: { header: any; payload: any }[] = [];
  for (let i = 1; i + 1 < righe.length; i += 2) {
    const header = JSON.parse(righe[i]);
    let payload: any = righe[i + 1];
    try {
      payload = JSON.parse(righe[i + 1]);
    } catch {
      // payload non JSON (allegati): resta testo
    }
    out.push({ header, payload });
  }
  return out;
}

/** Gli eventi d'errore Sentry arrivati al sink, con l'envelope che li conteneva. */
export function eventiSentry(sink: Sink): { event: any; envelope: string }[] {
  return sink.sentry.flatMap(s => itemsEnvelope(s.body).filter(i => i.header?.type === "event").map(i => ({ event: i.payload, envelope: s.body })));
}

/** Il corpo di una richiesta di PostHog come JSON (anche `data=<base64>`), o null. */
export function corpoPosthog(body: string): any {
  try {
    return JSON.parse(body);
  } catch {
    // forma "data=…" (base64 o JSON urlencoded)
  }
  try {
    const data = new URLSearchParams(body).get("data");
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return JSON.parse(Buffer.from(data, "base64").toString("utf8"));
    }
  } catch {
    return null;
  }
}

/** Gli eventi PostHog arrivati al sink, in ordine di timestamp. */
export function eventiPosthog(sink: Sink): any[] {
  const eventi = sink.posthog.flatMap(r => {
    const j = corpoPosthog(r.body);
    if (!j) return [];
    const lista = Array.isArray(j) ? j : Array.isArray(j.batch) ? j.batch : [j];
    return lista.filter((e: any) => e && typeof e.event === "string");
  });
  return eventi.sort((a, b) => String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? "")));
}
