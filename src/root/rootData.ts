/* ──────────────────────────────────────────────────────────────
   Dati della route di root, letti una volta sola sul server:
   - `now`: l'istante della pagina. Si cattura qui e viene serializzato verso
     il client, così SSR e idratazione decidono passato/in programma con lo
     stesso orologio (il giorno si calcola poi a Roma, shared/lib/dates.ts).
     Solo per i test locali, con E2E=1 e fuori da Vercel, E2E_NOW (ISO 8601)
     congela l'orologio del server.
   - `tema`: il cookie del tema del visitatore (theme/tema.ts).
   - `origine`: l'origine canonica del deployment (PIANO §1.8), la stessa
     di /mcp e dei metadati OAuth (server/mcp/origine.ts: VERCEL_ENV e le
     variabili di sistema di Vercel, fuori da Vercel SITE_URL), mai
     dall'header Host. Si legge qui, sul server, così né le variabili né
     le origini di sviluppo finiscono nel bundle del browser; head() dei
     profili (shell/seo.ts) la prende da qui (traguardo 4).
   ────────────────────────────────────────────────────────────── */

import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { envDelProcesso, origineCanonica } from "../server/mcp/origine.ts";
import { serverNow } from "../server/now.ts";
import { parseTema, TEMA_COOKIE, type Tema } from "../theme/tema.ts";

export interface RootData {
  now: number;
  tema: Tema;
  /** Es. https://concerti.gabrifila.me, senza barra finale. */
  origine: string;
}

export const getRootData = createServerFn({ method: "GET" }).handler((): RootData => ({
  now: serverNow(),
  tema: parseTema(getCookie(TEMA_COOKIE)),
  origine: origineCanonica(envDelProcesso()),
}));
