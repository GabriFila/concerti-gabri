/* ──────────────────────────────────────────────────────────────
   MCP di Better Auth (PIANO §1.1, traguardo 7; contratto di ondata).
   convex/auth.ts (corsia 3) le usa così:

     disabledPaths: [...PERCORSI_MCP_DISATTIVATI, …],
     plugins: [ …, mcp({ ...opzioniMcp }), irrobustimentoMcp(ctx), … ],

   Il plugin mcp() 1.6 va irrobustito (docs/multiutente/ricerca/auth-mcp.md):
   - consenso SEMPRE: un hook `before` su /mcp/authorize forza
     `prompt=consent`, così un client registrato da chiunque (DCR aperta)
     non riceve mai un codice senza passare da /autorizza. Vale anche per
     chi chiama direttamente *.convex.site, scavalcando il proxy Start;
   - solo gli scope `concerti` e `offline_access`: mcp() accetta sempre
     anche openid, profile ed email, e con openid il token arriva con un
     id_token che contiene l'id, l'email e il nome dell'utente. Lo stesso
     hook li toglie dalla richiesta (scopeConcesso), prima che Better Auth
     la salvi;
   - `/mcp/get-session` spento: restituirebbe la riga del token, refresh
     token compreso, a chiunque abbia l'access token;
   - PKCE obbligatorio (solo S256), scope `concerti`, access token da 1 ora,
     refresh da 30 giorni;
   - registrazione dinamica limitata da `dcrGlobal` (20 all'ora in tutto);
     i client senza token si cancellano dopo 24 ore (cron agents.cleanupDcrClients).
   I metadati pubblici (issuer, PRM) li serve Start in src/routes/[.]well-known/.
   ────────────────────────────────────────────────────────────── */

import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { rateLimiter } from "./rateLimits.ts";
import { SCOPE_CONCERTI, SCOPE_RINNOVO } from "../shared/agent/mcp.ts";

/** MCP acceso (traguardo 7): auth.ts toglie dai disabledPaths tutto tranne get-session. */
export const MCP_ATTIVO = true;

/** Access token: 1 ora. Refresh token: 30 giorni (PIANO §7, traguardo 7). */
export const DURATA_ACCESS_S = 3600;
export const DURATA_REFRESH_S = 30 * 24 * 3600;

/** Le opzioni di `mcp({ ...opzioniMcp })`. */
export const opzioniMcp = {
  loginPage: "/accedi",
  oidcConfig: {
    loginPage: "/accedi",
    consentPage: "/autorizza",
    requirePKCE: true,
    allowPlainCodeChallengeMethod: false,
    scopes: [SCOPE_CONCERTI],
    // un client che non chiede scope riceve comunque l'accesso e il refresh
    defaultScope: `${SCOPE_CONCERTI} ${SCOPE_RINNOVO}`,
    accessTokenExpiresIn: DURATA_ACCESS_S,
    refreshTokenExpiresIn: DURATA_REFRESH_S,
    codeExpiresIn: 600,
  },
};

/** Tutti i percorsi del plugin mcp() 1.6 (sotto /api/auth). */
export const PERCORSI_MCP = [
  "/mcp/authorize",
  "/mcp/token",
  "/mcp/register",
  "/mcp/get-session",
  "/oauth2/consent",
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
] as const;

/**
 * Da mettere in `disabledPaths` (Better Auth li confronta esatti, niente
 * jolly come "/mcp/*"). Con MCP acceso resta spento solo get-session.
 */
export const PERCORSI_MCP_DISATTIVATI: readonly string[] = MCP_ATTIVO ? ["/mcp/get-session"] : [...PERCORSI_MCP];

/**
 * Lo scope che /mcp/authorize concede davvero: `concerti` sempre e
 * `offline_access` se il client lo chiede (o se non chiede niente, come il
 * defaultScope). Il resto (openid, profile, email, scope sconosciuti) si
 * toglie: un server OAuth può concedere meno di quanto chiesto e la risposta
 * di /mcp/token dice lo scope vero (RFC 6749 §3.3).
 */
export function scopeConcesso(richiesto: unknown): string {
  const r = typeof richiesto === "string" ? richiesto.split(" ").filter(Boolean) : [];
  if (!r.length) return opzioniMcp.oidcConfig.defaultScope;
  return r.includes(SCOPE_RINNOVO) ? `${SCOPE_CONCERTI} ${SCOPE_RINNOVO}` : SCOPE_CONCERTI;
}

/** Il contesto Convex di createAuthOptions(ctx): qui serve solo runMutation (rate limiter). */
type CtxConMutation = { runMutation?: unknown };

/**
 * Gli hook che irrobustiscono mcp(): da mettere nei plugin DOPO
 * `mcp({ ...opzioniMcp })`. `ctx` è quello di createAuthOptions(ctx): la
 * registrazione dinamica arriva da un'httpAction, che ha runMutation.
 */
export function irrobustimentoMcp(ctx: object): BetterAuthPlugin {
  // GenericCtx di Convex: una query non ha runMutation (il tipo debole non basta a TS)
  const conMutation = ctx as CtxConMutation;
  return {
    id: "concerti-mcp",
    hooks: {
      before: [
        {
          // consenso sempre, qualunque `prompt` mandi il client; solo gli scope ammessi
          matcher: c => c.path === "/mcp/authorize",
          handler: createAuthMiddleware(async c => ({
            context: { query: { ...(c.query ?? {}), prompt: "consent", scope: scopeConcesso(c.query?.scope) } },
          })),
        },
        {
          matcher: c => c.path === "/mcp/register",
          handler: createAuthMiddleware(async () => {
            if (typeof conMutation.runMutation !== "function") {
              throw new APIError("SERVICE_UNAVAILABLE", { error: "temporarily_unavailable", error_description: "registrazione dei client non disponibile" });
            }
            const r = await rateLimiter.limit(ctx as Parameters<typeof rateLimiter.limit>[0], "dcrGlobal", {});
            if (!r.ok) {
              throw new APIError("TOO_MANY_REQUESTS", { error: "temporarily_unavailable", error_description: "troppe registrazioni di client: riprova più tardi" });
            }
          }),
        },
      ],
    },
  };
}
