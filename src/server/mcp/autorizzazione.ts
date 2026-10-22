/* ──────────────────────────────────────────────────────────────
   Il cancello di /api/auth/mcp/authorize (PIANO traguardo 7; ricerca
   auth-mcp.md, limiti (a) e (g) di mcp() 1.6).

   - Senza sessione il browser va a /accedi?next=<percorso e query>, e
     Better Auth non vede la richiesta: così non imposta mai il cookie
     `oidc_login_prompt`, che anche l'hook oidc di convex() leggerebbe.
     Dopo il login /accedi riporta qui e la richiesta riparte con la
     sessione.
   - Con la sessione la richiesta va a Better Auth con `prompt=consent`
     forzato (lo forza anche l'hook in convex/authMcp.ts, che vale pure per
     chi chiama *.convex.site direttamente): il codice arriva al client
     solo dopo /autorizza.
   Puro: la route passa `sessione` e `inoltra` (lib/auth-server.ts).
   ────────────────────────────────────────────────────────────── */

export interface DipendenzeCancello {
  /** true se la richiesta ha una sessione valida. */
  sessione: () => Promise<boolean>;
  /** Inoltra la richiesta a Better Auth (il proxy di /api/auth). */
  inoltra: (request: Request) => Promise<Response>;
}

/** /accedi con `next` = percorso e query della richiesta (stessa origine). */
export function versoAccedi(url: URL): string {
  return `/accedi?next=${encodeURIComponent(url.pathname + url.search)}`;
}

export async function cancelloAutorizzazione(request: Request, dip: DipendenzeCancello): Promise<Response> {
  const url = new URL(request.url);
  const conSessione = await dip.sessione().catch(() => false);
  if (!conSessione) {
    return new Response(null, { status: 302, headers: { Location: versoAccedi(url), "Cache-Control": "no-store" } });
  }
  url.searchParams.set("prompt", "consent");
  return await dip.inoltra(new Request(url, { method: request.method, headers: request.headers }));
}
