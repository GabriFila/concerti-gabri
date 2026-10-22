/* ──────────────────────────────────────────────────────────────
   L'istanza di Start (PIANO §1.9, §7.0: file congelato nel traguardo 2).

   Appena questo file esiste, Start non installa più da sé la protezione
   CSRF delle server function: la mettiamo qui, solo sulle server function
   (`handlerType === "serverFn"`). Una richiesta cross-site (Sec-Fetch-Site
   diverso da same-origin, oppure Origin/Referer di un altro sito) riceve
   403 prima di eseguire la funzione (e2e/http.spec.ts). Pagine e route API
   (/api/chat ha il suo controllo dell'Origin) non passano da qui.

   Il traguardo 8 aggiunge solo il middleware di Sentry in testa agli array:
   cattura gli errori di route API e server function, poi li rilancia.
   ────────────────────────────────────────────────────────────── */

import { sentryGlobalFunctionMiddleware, sentryGlobalRequestMiddleware } from "@sentry/tanstackstart-react";
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

const csrfMiddleware = createCsrfMiddleware({
  filter: ctx => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [sentryGlobalRequestMiddleware, csrfMiddleware],
  functionMiddleware: [sentryGlobalFunctionMiddleware],
}));
