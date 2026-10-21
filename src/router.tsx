/* ──────────────────────────────────────────────────────────────
   Il router, uno per richiesta (PIANO §1.5, §1.7, §6).

   Start chiama getRouter() a ogni SSR (e una volta nel browser). Dentro
   nascono, ogni volta nuovi:
   - QueryClient (TanStack Query), la cache dei dati della richiesta;
   - ConvexQueryClient, che sul server crea il SUO ConvexHttpClient
     (`serverHttpClient`, query coerenti a un solo timestamp) e nel browser
     il ConvexReactClient col WebSocket.
   Mai a livello di modulo: su Vercel Fluid le richieste concorrenti
   condividono l'istanza, e un client di modulo con `setAuth(token)` (dal
   traguardo 3) metterebbe i dati `me.*` di un visitatore nell'HTML di un
   altro. src/router.test.ts lo verifica.

   setupRouterSsrQueryIntegration porta i dati caricati dai loader
   nell'HTML (dehydrate) e li reidrata nel browser; lì ConvexQueryClient
   vede le query aggiunte alla cache e le sottoscrive via WebSocket, quindi
   la pagina resta viva dopo l'idratazione (e2e/live.spec.ts).

   expectAuth: vero solo se l'SSR ha visto una sessione (<html data-auth="1">,
   dal traguardo 3). Con `true` fisso il WebSocket dei visitatori anonimi
   resterebbe in pausa e niente si aggiornerebbe dal vivo.
   ────────────────────────────────────────────────────────────── */

import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { convexUrl } from "./lib/convexUrl.ts";
import { routeTree } from "./routeTree.gen";

/** Il contesto di ogni route: i client della richiesta corrente. */
export interface RouterContext {
  queryClient: QueryClient;
  convexQueryClient: ConvexQueryClient;
}

export function getRouter() {
  const expectAuth = typeof document !== "undefined" && document.documentElement.dataset.auth === "1";
  const convexQueryClient = new ConvexQueryClient(convexUrl(), { expectAuth });
  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
  });
  convexQueryClient.connect(queryClient);

  const context: RouterContext = { queryClient, convexQueryClient };
  const router = createRouter({
    routeTree,
    context,
    scrollRestoration: true,
  });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
