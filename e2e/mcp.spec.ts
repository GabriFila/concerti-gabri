/* ──────────────────────────────────────────────────────────────
   /mcp e i metadati OAuth, senza sessione (PIANO traguardo 7):
   - GET e DELETE → 405 `{code, messaggio}` (server stateless);
   - senza token → 401 con WWW-Authenticate verso i metadati della risorsa;
   - un token malformato non torna mai nella risposta;
   - un Origin estraneo → 403;
   - /.well-known/oauth-protected-resource[/mcp]: resource <origine>/mcp.
   I metadati del server di autorizzazione vengono da Better Auth (corsia 3):
   quel test ha il tag @sessione e gira all'integrazione.
   ────────────────────────────────────────────────────────────── */

import { http } from "./helpers/http.ts";
import { rpcMcp } from "./helpers/mcp.ts";
import { expect, test } from "./helpers/test.ts";

const CANARINO = "Via dei Canarini 7, Genova";

test.beforeEach(({}, info) => {
  test.skip(info.project.name === "mobile", "HTTP: basta una volta");
});

test("GET, DELETE e PUT su /mcp → 405 {code, messaggio}", async ({ baseURL }) => {
  for (const method of ["GET", "DELETE", "PUT"]) {
    const res = await http(new URL("/mcp", baseURL).href, { method });
    expect(res.status(), method).toBe(405);
    expect(res.headers()["allow"]).toBe("POST");
    expect(await res.json()).toMatchObject({ code: "non_disponibile" });
  }
});

test("senza token: 401 con WWW-Authenticate e i metadati della risorsa", async ({ baseURL }) => {
  const { res, corpo } = await rpcMcp(baseURL, "tools/list", {});
  expect(res.status()).toBe(401);
  expect(corpo).toMatchObject({ code: "unauthorized" });
  const challenge = res.headers()["www-authenticate"] ?? "";
  expect(challenge).toMatch(/^Bearer /);
  const metadati = challenge.match(/resource_metadata="([^"]+)"/)?.[1];
  expect(metadati).toMatch(/\/\.well-known\/oauth-protected-resource\/mcp$/);
  expect(res.headers()["cache-control"]).toContain("no-store");
});

test("un token malformato non torna nella risposta", async ({ baseURL }) => {
  for (const headers of [{ "x-api-key": `cgk_${CANARINO}` }, { authorization: `Bearer ${CANARINO}` }, { "x-api-key": CANARINO }] as Record<string, string>[]) {
    const { res, testo } = await rpcMcp(baseURL, "tools/list", {}, headers);
    expect(res.status()).toBe(401);
    expect(testo + JSON.stringify(res.headers())).not.toContain("Canarini");
  }
});

test("un Origin estraneo → 403 prima di guardare il token", async ({ baseURL }) => {
  const { res, corpo } = await rpcMcp(baseURL, "tools/list", {}, { origin: "https://evil.example" });
  expect(res.status()).toBe(403);
  expect(corpo).toMatchObject({ code: "unauthorized" });
});

test("metadati della risorsa protetta: resource <origine>/mcp, server di autorizzazione = origine", async ({ baseURL }) => {
  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
    const res = await http(new URL(path, baseURL).href);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["access-control-allow-origin"]).toBe("*");
    const doc = await res.json();
    const origine = new URL(doc.resource).origin;
    expect(doc.resource).toBe(`${origine}/mcp`);
    expect(doc.authorization_servers).toEqual([origine]);
    expect(doc.scopes_supported).toEqual(["concerti"]);
  }
});

test("metadati del server di autorizzazione: issuer = origine, niente jwks/userinfo, solo S256", { tag: "@sessione" }, async ({ baseURL }) => {
  const prm = await (await http(new URL("/.well-known/oauth-protected-resource/mcp", baseURL).href)).json();
  const res = await http(new URL("/.well-known/oauth-authorization-server", baseURL).href);
  expect(res.status()).toBe(200);
  const as = await res.json();
  expect(as.issuer).toBe(prm.authorization_servers[0]);
  expect(as).not.toHaveProperty("jwks_uri");
  expect(as).not.toHaveProperty("userinfo_endpoint");
  expect(as.code_challenge_methods_supported).toEqual(["S256"]);
  expect(as.scopes_supported).toContain("concerti");
  expect(as.registration_endpoint).toBe(`${as.issuer}/api/auth/mcp/register`);
});
