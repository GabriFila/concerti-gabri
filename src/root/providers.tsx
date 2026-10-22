/* ──────────────────────────────────────────────────────────────
   Slot del root: i provider che avvolgono ogni pagina (PIANO §3, §7.0).
   Proprietario: traguardo 3.

   Il client Convex è quello della richiesta (`convexQueryClient.convexClient`,
   dal contesto del router): lo stesso che usano le query di TanStack
   (`convexQuery`), quindi l'autenticazione vale per tutte e due le strade.
   - Con una sessione vista dall'SSR (lib/auth-sessione.ts):
     ConvexProviderWithAuth, che chiede il JWT al plugin convex() di Better
     Auth (`authClient.convex.token`, GET /api/auth/convex/token) dopo
     l'idratazione e lo rinnova da solo. Il token dell'SSR non si passa al
     browser: starebbe nell'HTML. Fino al token le query aspettano
     (expectAuth), e la pagina mostra intanto i dati dell'SSR.
   - Senza sessione: un semplice ConvexProvider (per `useConvex()` e le
     mutation dei form), senza chiedere la sessione a ogni visita.

   Perché non ConvexBetterAuthProvider (0.12.5): legge anche
   `useSession()`, e quando la sessione arriva dal fetch (dopo
   l'idratazione) cambia identità a `fetchAccessToken`. ConvexProviderWithAuth
   allora fa `clearAuth()` e si riautentica: ogni query autenticata gira una
   volta SENZA sessione (me.profile → null, query del proprietario →
   unauthorized), e /benvenuto rimontava il passo perdendo il form (visto
   negli e2e). Qui login e logout ricaricano sempre la pagina per intero
   (§1.5), quindi lo stato di autenticazione è fisso per tutta la vita della
   pagina e `fetchAccessToken` non cambia mai.
   QueryClientProvider lo aggiunge già setupRouterSsrQueryIntegration.
   ────────────────────────────────────────────────────────────── */

import { useState, type ReactNode } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { ConvexProvider, ConvexProviderWithAuth } from "convex/react";
import { authClient } from "../lib/auth-client.ts";

const rootApi = getRouteApi("__root__");

type StatoAuth = {
  isLoading: boolean;
  isAuthenticated: boolean;
  fetchAccessToken: (args: { forceRefreshToken: boolean }) => Promise<string | null>;
};

/** Lo `useAuth` di ConvexProviderWithAuth per una pagina caricata con la sessione: identità fissa. */
function creaUseAuth(): () => StatoAuth {
  let token: string | null = null;
  const stato: StatoAuth = {
    isLoading: false,
    isAuthenticated: true,
    fetchAccessToken: async ({ forceRefreshToken }) => {
      if (token && !forceRefreshToken) return token;
      const { data } = await authClient.convex.token({ fetchOptions: { throw: false } });
      token = data?.token ?? null;
      return token;
    },
  };
  return () => stato;
}

export function RootProviders({ children }: { children: ReactNode }) {
  const { convexQueryClient, auth } = rootApi.useRouteContext();
  const client = convexQueryClient.convexClient;
  // una volta per pagina: stessa identità per tutta la sua vita
  const [useAuth] = useState(creaUseAuth);
  if (!auth?.autenticato) return <ConvexProvider client={client}>{children}</ConvexProvider>;
  return (
    <ConvexProviderWithAuth client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
