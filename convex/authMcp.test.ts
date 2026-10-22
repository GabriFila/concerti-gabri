/* Il plugin mcp() 1.6 con le opzioni e gli hook di convex/authMcp.ts, su un
   Better Auth vero (adapter in memoria, fuori da Convex): il consenso
   compare SEMPRE, anche senza prompt=consent; senza PKCE niente codice;
   solo gli scope concerti e offline_access, quindi niente id_token con
   l'email; /mcp/get-session è spento; la registrazione dinamica passa da
   dcrGlobal. */

import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { mcp } from "better-auth/plugins";
import { HOUR } from "@convex-dev/rate-limiter";
import { describe, expect, it } from "vitest";
import {
  DCR_MAX_CORPO, DURATA_ACCESS_S, DURATA_REFRESH_S, PERCORSI_MCP_DISATTIVATI, irrobustimentoMcp, limiteRegistrazione, opzioniMcp, scopeConcesso,
} from "./authMcp.ts";

const BASE = "http://localhost:3000";
const REDIRECT = "http://localhost:9/callback";

function creaAuth(limiteOk = true) {
  const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [], oauthApplication: [], oauthAccessToken: [], oauthConsent: [] };
  const chiamateLimite: unknown[] = [];
  const ctx = {
    runMutation: async (_ref: unknown, args: unknown) => {
      chiamateLimite.push(args);
      return { ok: limiteOk, retryAfter: limiteOk ? undefined : 60_000 };
    },
  };
  const auth = betterAuth({
    baseURL: BASE,
    secret: "segreto-di-test-lungo-almeno-32-caratteri",
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    disabledPaths: [...PERCORSI_MCP_DISATTIVATI],
    plugins: [mcp({ ...opzioniMcp }), irrobustimentoMcp(ctx)],
    logger: { disabled: true },
  });
  return { auth, db, chiamateLimite };
}

async function sessione(auth: ReturnType<typeof creaAuth>["auth"]) {
  const r = await auth.api.signUpEmail({ body: { email: "a@example.com", password: "password-di-test-1", name: "A" }, asResponse: true });
  return r.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
}

async function registra(auth: ReturnType<typeof creaAuth>["auth"]) {
  const r = await auth.handler(
    new Request(`${BASE}/api/auth/mcp/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", client_name: "Client di prova", grant_types: ["authorization_code", "refresh_token"] }),
    }),
  );
  return { status: r.status, body: (await r.json()) as { client_id: string } };
}

async function registraCorpo(auth: ReturnType<typeof creaAuth>["auth"], corpo: unknown) {
  const r = await auth.handler(
    new Request(`${BASE}/api/auth/mcp/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }),
  );
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

async function sha256(s: string) {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("mcp() irrobustito", () => {
  it("opzioni: PKCE obbligatorio, scope concerti, 1 ora / 30 giorni, login /accedi e consenso /autorizza", () => {
    expect(opzioniMcp).toMatchObject({ loginPage: "/accedi", oidcConfig: { requirePKCE: true, scopes: ["concerti"], consentPage: "/autorizza", loginPage: "/accedi" } });
    expect(opzioniMcp.oidcConfig.accessTokenExpiresIn).toBe(3600);
    expect(DURATA_ACCESS_S).toBe(3600);
    expect(opzioniMcp.oidcConfig.refreshTokenExpiresIn).toBe(30 * 24 * 3600);
    expect(DURATA_REFRESH_S).toBe(30 * 24 * 3600);
    expect(PERCORSI_MCP_DISATTIVATI).toEqual(["/mcp/get-session"]);
  });

  it("il consenso compare sempre, anche senza prompt=consent; senza PKCE niente codice", async () => {
    const { auth } = creaAuth();
    const cookie = await sessione(auth);
    const { status, body } = await registra(auth);
    expect(status).toBe(201);
    const verifier = "v".repeat(50);
    const parametri = (extra: Record<string, string>) =>
      new URLSearchParams({ client_id: body.client_id, response_type: "code", redirect_uri: REDIRECT, scope: "concerti offline_access", state: "s1", ...extra });
    for (const prompt of [{}, { prompt: "none" }, { prompt: "login" }, { prompt: "consent" }]) {
      const r = await auth.handler(
        new Request(`${BASE}/api/auth/mcp/authorize?${parametri({ code_challenge: await sha256(verifier), code_challenge_method: "S256", ...prompt })}`, { headers: { cookie } }),
      );
      const dove = r.headers.get("location") ?? "";
      expect(r.status, JSON.stringify(prompt)).toBe(302);
      expect(dove, JSON.stringify(prompt)).toMatch(/^\/autorizza\?consent_code=/);
      expect(dove).not.toContain(REDIRECT.replace(/[:/]/g, ""));
    }
    // senza PKCE: errore verso il redirect, nessun codice
    const senza = await auth.handler(new Request(`${BASE}/api/auth/mcp/authorize?${parametri({})}`, { headers: { cookie } }));
    const dove = senza.headers.get("location") ?? "";
    expect(dove).toContain("error=invalid_request");
    expect(dove).not.toContain("code=");
  });

  it("scopeConcesso: concerti sempre, offline_access se chiesto, il resto mai", () => {
    expect(scopeConcesso(undefined)).toBe("concerti offline_access");
    expect(scopeConcesso("")).toBe("concerti offline_access");
    expect(scopeConcesso("concerti")).toBe("concerti");
    expect(scopeConcesso("openid email profile")).toBe("concerti");
    expect(scopeConcesso("openid offline_access email")).toBe("concerti offline_access");
    expect(scopeConcesso(["concerti", "email"])).toBe("concerti offline_access");
  });

  it("openid, profile ed email non arrivano mai al token: niente id_token, email, nome o id dell'utente", async () => {
    const { auth, db } = creaAuth();
    const cookie = await sessione(auth);
    const { body } = await registra(auth);
    const idUtente = String((db.user[0] as { id: string }).id);
    const casi: [string | null, string][] = [
      ["concerti openid email profile", "concerti"],
      ["openid email profile offline_access", "concerti offline_access"],
      ["concerti offline_access scope-sconosciuto", "concerti offline_access"],
      [null, "concerti offline_access"],
    ];
    for (const [chiesto, concesso] of casi) {
      const verifier = `verifier-${"x".repeat(50)}-${concesso.length}`;
      const q = new URLSearchParams({
        client_id: body.client_id, response_type: "code", redirect_uri: REDIRECT, state: "s1", nonce: "n1",
        code_challenge: await sha256(verifier), code_challenge_method: "S256", ...(chiesto === null ? {} : { scope: chiesto }),
      });
      const autorizza = await auth.handler(new Request(`${BASE}/api/auth/mcp/authorize?${q}`, { headers: { cookie } }));
      const dove = new URL(autorizza.headers.get("location") ?? "", BASE);
      expect(dove.pathname, String(chiesto)).toBe("/autorizza");
      expect(dove.searchParams.get("scope"), String(chiesto)).toBe(concesso);
      const consenso = await auth.handler(
        new Request(`${BASE}/api/auth/oauth2/consent`, {
          method: "POST",
          headers: { cookie, origin: BASE, "content-type": "application/json" },
          body: JSON.stringify({ accept: true, consent_code: dove.searchParams.get("consent_code") }),
        }),
      );
      expect(consenso.status, String(chiesto)).toBe(200);
      const code = new URL(((await consenso.json()) as { redirectURI: string }).redirectURI).searchParams.get("code");
      const token = await auth.handler(
        new Request(`${BASE}/api/auth/mcp/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "authorization_code", code: code ?? "", redirect_uri: REDIRECT, client_id: body.client_id, code_verifier: verifier }),
        }),
      );
      const testo = await token.text();
      expect(token.status, testo).toBe(200);
      const t = JSON.parse(testo) as Record<string, unknown>;
      expect(t.scope, String(chiesto)).toBe(concesso);
      expect(t).not.toHaveProperty("id_token");
      expect(!!t.refresh_token).toBe(concesso.includes("offline_access"));
      for (const fuga of ["a@example.com", idUtente]) expect(testo).not.toContain(fuga);
    }
    expect((db.oauthAccessToken as { scopes: string }[]).map(r => r.scopes)).toEqual(casi.map(([, c]) => c));
    expect((db.oauthConsent as { scopes: string }[]).every(r => !/openid|profile|email/.test(r.scopes))).toBe(true);
  });

  it("/mcp/get-session è spento", async () => {
    const { auth } = creaAuth();
    const r = await auth.handler(new Request(`${BASE}/api/auth/mcp/get-session`, { headers: { authorization: "Bearer abc" } }));
    expect(r.status).toBe(404);
  });

  it("la registrazione dinamica passa da dcrGlobal e si ferma quando il limite è finito", async () => {
    const ok = creaAuth(true);
    expect((await registra(ok.auth)).status).toBe(201);
    expect(ok.chiamateLimite).toHaveLength(1);
    // proprio dcrGlobal (§5.8: 20 all'ora, globale, quindi senza chiave)
    expect(ok.chiamateLimite[0]).toMatchObject({ name: "dcrGlobal", config: { kind: "fixed window", rate: 20, period: HOUR } });
    expect(ok.chiamateLimite[0]).not.toHaveProperty("key");
    const pieno = creaAuth(false);
    const r = await registra(pieno.auth);
    expect(r.status).toBe(429);
    expect(pieno.db.oauthApplication).toEqual([]);
  });

  it("una registrazione fuori misura si rifiuta prima di salvarla e non consuma dcrGlobal", async () => {
    const { auth, db, chiamateLimite } = creaAuth(true);
    const base = { redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", client_name: "Client di prova", grant_types: ["authorization_code", "refresh_token"] };
    const fuori = [
      // ~1 MB di metadata (la prova del revisore: 201 e un documento da 950 KB)
      { ...base, metadata: { x: "m".repeat(950_000) } },
      { ...base, client_name: "n".repeat(201) },
      { ...base, redirect_uris: Array.from({ length: 11 }, (_, i) => `http://localhost:${9000 + i}/callback`) },
      { ...base, redirect_uris: [`http://localhost:9/${"p".repeat(1100)}`] },
      { ...base, logo_uri: `https://example.com/${"l".repeat(1100)}` },
      { ...base, contacts: Array.from({ length: 600 }, (_, i) => `c${i}@example.com`) },
    ];
    for (const corpo of fuori) {
      const r = await registraCorpo(auth, corpo);
      expect(r.status, JSON.stringify(corpo).slice(0, 60)).toBe(400);
      expect(r.body).toMatchObject({ error: "invalid_client_metadata" });
      // l'errore dice il tetto, mai il valore ricevuto
      expect(JSON.stringify(r.body)).not.toMatch(/mmmm|nnnn|pppp|llll/);
    }
    expect(db.oauthApplication).toEqual([]);
    expect(chiamateLimite).toEqual([]);
    // un client normale (anche con logo e URI del sito) passa
    expect((await registraCorpo(auth, { ...base, logo_uri: "https://example.com/logo.png", client_uri: "https://example.com" })).status).toBe(201);
    expect(db.oauthApplication).toHaveLength(1);
  });

  it("limiteRegistrazione: i tetti", () => {
    expect(limiteRegistrazione({ redirect_uris: [REDIRECT], client_name: "Claude" })).toBeNull();
    expect(limiteRegistrazione({ client_name: "x".repeat(DCR_MAX_CORPO) })).toMatch(/troppo grande/);
    expect(limiteRegistrazione("stringa")).toBe("corpo non valido");
    expect(limiteRegistrazione([1, 2])).toBe("corpo non valido");
    expect(limiteRegistrazione({ redirect_uris: [42] })).toMatch(/redirect_uri/);
  });
});
