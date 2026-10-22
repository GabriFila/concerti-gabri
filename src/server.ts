/* ──────────────────────────────────────────────────────────────
   Entry del server Start: delega all'handler predefinito e aggiunge
   `Cache-Control: private, no-store` a ogni risposta dinamica (HTML SSR,
   server function, API) che non ne dichiara uno suo. Le pagine possono
   contenere dati per-visitatore (tema, poi sessione): né il CDN né un proxy
   devono tenerne copia. Gli asset statici non passano di qui (CDN di Vercel,
   middleware di Vite in sviluppo); chi vuole una cache vera la imposta da sé
   (es. l'immagine OG con s-maxage).

   Osservabilità (traguardo 8): instrument.server.ts per primo, poi
   `wrapFetchWithSentry`, che su Vercel svuota la coda degli eventi prima
   che la funzione si congeli. Gli errori di API e server function li
   cattura il middleware di Sentry (src/start.ts); qui si cattura quel poco
   che scappasse all'handler di Start.
   Solo nei test locali (E2E=1, fuori da Vercel) e sulle preview di Vercel
   (dietro Vercel Authentication) POST /__e2e/errore-server lancia un errore
   che ripete il corpo ricevuto, come farebbe un errore sbadato:
   e2e/osservabilita.spec.ts controlla che arrivi al sink Sentry locale
   ripulito, e sulla preview l'orchestratore cerca il canarino nell'evento
   vero (PIANO §8.4, spike di §9). In produzione il percorso non esiste.
   ────────────────────────────────────────────────────────────── */

import "./instrument.server.ts";
import * as Sentry from "@sentry/tanstackstart-react";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export const NO_STORE = "private, no-store";

function withNoStore(res: Response): Response {
  const type = res.headers.get("content-type") || "";
  // l'HTML è sempre no-store, anche se qualcuno a monte avesse messo altro
  const force = type.includes("text/html");
  if (!force && res.headers.has("cache-control")) return res;
  try {
    res.headers.set("cache-control", NO_STORE);
    return res;
  } catch {
    // header immutabili (risposta di un fetch inoltrata): si ricopia
    const headers = new Headers(res.headers);
    headers.set("cache-control", NO_STORE);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
}

class ErroreDiProvaE2E extends Error {}

const provaAttiva = () => (process.env.E2E === "1" && !process.env.VERCEL) || __VERCEL_ENV__ === "preview";

async function erroreDiProvaE2E(request: Request): Promise<void> {
  if (!provaAttiva()) return;
  if (request.method !== "POST" || new URL(request.url).pathname !== "/__e2e/errore-server") return;
  const ricevuto = await request.text();
  throw new ErroreDiProvaE2E(`errore di prova del server: ${ricevuto}`);
}

const entry: Parameters<typeof createServerEntry>[0] = {
  async fetch(request, opts) {
    try {
      await erroreDiProvaE2E(request);
      return withNoStore(await handler.fetch(request, opts));
    } catch (err) {
      Sentry.captureException(err);
      if (err instanceof ErroreDiProvaE2E) return new Response("errore di prova", { status: 500, headers: { "cache-control": NO_STORE } });
      throw err;
    }
  },
};

// sostituisce entry.fetch con un proxy di Sentry (meta di trace nell'HTML, coda svuotata su Vercel)
Sentry.wrapFetchWithSentry(entry);

export default createServerEntry(entry);
