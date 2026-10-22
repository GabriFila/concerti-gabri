/* ──────────────────────────────────────────────────────────────
   La sessione della richiesta, per il `beforeLoad` di root (PIANO §1.5,
   §1.7, traguardo 3).

   Sul server (SSR):
   - senza cookie di sessione di Better Auth non si chiama nessuno: un
     visitatore anonimo non costa una richiesta in più a Convex;
   - con il cookie, `getToken()` lo scambia col JWT di Convex, che va
     sul client HTTP DI QUESTA RICHIESTA (`serverHttpClient`, nato in
     getRouter(): mai uno di modulo) e `me.profile` si carica subito, così
     guard, useViewer() e HTML hanno già il profilo;
   - il token NON arriva al browser: il contesto del beforeLoad finisce
     nell'HTML (idratazione), e lì c'è solo `autenticato`. Il browser
     chiede il suo primo token a /api/auth/convex/token
     (root/providers.tsx); <html data-auth="1"> decide `expectAuth`.
   Nel browser, dopo l'idratazione, il beforeLoad di root si rilancia a
   ogni navigazione: lì non si chiede niente al server, vale lo stato del
   caricamento (login e logout ricaricano la pagina per intero).
   ────────────────────────────────────────────────────────────── */

import { createServerFn } from "@tanstack/react-start";
import type { RouterContext } from "../router.tsx";
import { viewerQuery } from "./viewer.ts";

/** Finisce nell'HTML: niente token, email o id dell'utente. */
export interface AuthRichiesta {
  /** C'era una sessione valida al caricamento della pagina. */
  autenticato: boolean;
}

/** Il JWT di Convex per il cookie di sessione della richiesta, o null. */
const tokenDellaRichiesta = createServerFn({ method: "GET" }).handler(async (): Promise<string | null> => {
  const { getRequestHeaders } = await import("@tanstack/react-start/server");
  const { getSessionCookie } = await import("better-auth/cookies");
  if (!getSessionCookie(new Headers(getRequestHeaders()))) return null;
  const { getToken } = await import("./auth-server.ts");
  try {
    return (await getToken()) ?? null;
  } catch {
    // Convex irraggiungibile o sessione illeggibile: si prosegue da anonimi
    return null;
  }
});

export async function authDellaRichiesta(context: RouterContext): Promise<AuthRichiesta> {
  if (typeof document !== "undefined") {
    return { autenticato: document.documentElement.dataset.auth === "1" };
  }
  const token = await tokenDellaRichiesta();
  if (!token) return { autenticato: false };
  context.convexQueryClient.serverHttpClient?.setAuth(token);
  await context.queryClient.ensureQueryData(viewerQuery());
  return { autenticato: true };
}
