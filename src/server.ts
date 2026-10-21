/* ──────────────────────────────────────────────────────────────
   Entry del server Start: delega all'handler predefinito e aggiunge
   `Cache-Control: private, no-store` a ogni risposta dinamica (HTML SSR,
   server function, API) che non ne dichiara uno suo. Le pagine possono
   contenere dati per-visitatore (tema, poi sessione): né il CDN né un proxy
   devono tenerne copia. Gli asset statici non passano di qui (CDN di Vercel,
   middleware di Vite in sviluppo); chi vuole una cache vera la imposta da sé
   (es. l'immagine OG con s-maxage).
   ────────────────────────────────────────────────────────────── */

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

export default createServerEntry({
  async fetch(request, opts) {
    return withNoStore(await handler.fetch(request, opts));
  },
});
