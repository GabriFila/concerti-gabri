import { createFileRoute } from "@tanstack/react-router";
import { getToken, handler } from "../../../../lib/auth-server.ts";
import { cancelloAutorizzazione } from "../../../../server/mcp/autorizzazione.ts";

/* /api/auth/mcp/authorize (PIANO traguardo 7, corsia 7): più specifica del
   proxy /api/auth/$ (corsia 3), quindi passa di qui. Senza sessione →
   /accedi?next=…; con la sessione → Better Auth con prompt=consent
   (src/server/mcp/autorizzazione.ts). Better Auth la serve solo in GET. */
export const Route = createFileRoute("/api/auth/mcp/authorize")({
  server: {
    handlers: {
      ANY: ({ request }) =>
        request.method === "GET"
          ? cancelloAutorizzazione(request, { sessione: async () => !!(await getToken()), inoltra: handler })
          : new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } }),
    },
  },
});
