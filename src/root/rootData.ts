/* ──────────────────────────────────────────────────────────────
   Dati della route di root, letti una volta sola sul server:
   - `now`: l'istante della pagina. Si cattura qui e viene serializzato verso
     il client, così SSR e idratazione decidono passato/in programma con lo
     stesso orologio (il giorno si calcola poi a Roma, shared/lib/dates.ts).
     Solo per i test locali, con E2E=1 e fuori da Vercel, E2E_NOW (ISO 8601)
     congela l'orologio del server.
   - `tema`: il cookie del tema del visitatore (theme/tema.ts).
   ────────────────────────────────────────────────────────────── */

import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { serverNow } from "../server/now.ts";
import { parseTema, TEMA_COOKIE, type Tema } from "../theme/tema.ts";

export interface RootData {
  now: number;
  tema: Tema;
}

export const getRootData = createServerFn({ method: "GET" }).handler((): RootData => ({
  now: serverNow(),
  tema: parseTema(getCookie(TEMA_COOKIE)),
}));
