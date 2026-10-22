/* ──────────────────────────────────────────────────────────────
   Righe di prova nel componente Better Auth per convex-test (traguardo 7):
   client OAuth, access token di mcp() e richieste di consenso, scritte
   attraverso l'adapter del componente (come farebbe Better Auth).
   setup() (test.setup.ts) registra già il componente VERO della corsia 3
   (convex/betterAuth/, con mcp() e apiKey()): niente componente finto.
   Il nome ha due punti: la CLI Convex non lo pubblica e test.setup.ts non
   lo carica come modulo dell'app.
   ────────────────────────────────────────────────────────────── */

import type { T } from "./test.setup";
import { adapterAuth } from "./lib/agentToken.ts";

/** Una riga nel componente, attraverso il suo adapter (come farebbe Better Auth). */
export async function creaInAuth(t: T, model: string, data: Record<string, unknown>) {
  return await t.run(async ctx => await ctx.runMutation(adapterAuth().create, { input: { model, data } }));
}

const LETTERE = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** n lettere a caso (i token di mcp() 1.6 sono 32 lettere). */
export const lettere = (n: number) => Array.from({ length: n }, () => LETTERE[Math.floor(Math.random() * 52)]).join("");

/** Un client OAuth registrato (DCR). */
export async function nuovoClientOAuth(t: T, clientId: string, extra: Record<string, unknown> = {}) {
  const now = Date.now();
  return await creaInAuth(t, "oauthApplication", { name: `Client ${clientId}`, clientId, clientSecret: "", redirectUrls: "http://localhost:9/callback", type: "public", disabled: false, createdAt: now, updatedAt: now, ...extra });
}

/** Un access token OAuth (32 lettere come mcp() 1.6) per `userId` sul client `clientId`. */
export async function nuovoTokenOAuth(t: T, userId: string, clientId: string, extra: Record<string, unknown> = {}) {
  const now = Date.now();
  const accessToken = lettere(32);
  await creaInAuth(t, "oauthAccessToken", {
    accessToken, refreshToken: lettere(32), accessTokenExpiresAt: now + 3600_000, refreshTokenExpiresAt: now + 30 * 86400_000,
    clientId, userId, scopes: "concerti offline_access", createdAt: now, updatedAt: now, ...extra,
  });
  return accessToken;
}

/** Una richiesta di consenso come la salva mcp() 1.6 in /mcp/authorize (prompt=consent); restituisce il consent_code. */
export async function nuovaRichiestaConsenso(
  t: T, userId: string, clientId: string, extra: { redirectURI?: string; scadenza?: number; requireConsent?: boolean; scope?: string[] } = {},
) {
  const now = Date.now();
  const code = lettere(32);
  await creaInAuth(t, "verification", {
    identifier: code,
    value: JSON.stringify({
      clientId, redirectURI: extra.redirectURI ?? "http://localhost:9/callback", scope: extra.scope ?? ["concerti", "offline_access"], userId,
      authTime: now, requireConsent: extra.requireConsent ?? true, state: "s", codeChallenge: "c", codeChallengeMethod: "s256",
    }),
    expiresAt: extra.scadenza ?? now + 600_000, createdAt: now, updatedAt: now,
  });
  return code;
}
