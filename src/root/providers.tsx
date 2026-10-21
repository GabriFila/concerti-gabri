/* ──────────────────────────────────────────────────────────────
   Slot del root: i provider che avvolgono ogni pagina (PIANO §3, §7.0).
   Proprietario: traguardo 3, che ci mette ConvexBetterAuthProvider con
   `convexQueryClient.convexClient` (dal contesto del router) e il token
   letto nel `beforeLoad` di root.

   Nel traguardo 2 è vuoto: QueryClientProvider lo aggiunge già
   setupRouterSsrQueryIntegration (src/router.tsx) e le pagine leggono
   Convex solo con TanStack Query (`convexQuery`).
   ────────────────────────────────────────────────────────────── */

import type { ReactNode } from "react";

export function RootProviders({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
