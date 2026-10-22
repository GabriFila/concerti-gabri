/* ──────────────────────────────────────────────────────────────
   MCP con OAuth (PIANO traguardo 7, mcp() 1.6 irrobustito):
   - senza sessione /api/auth/mcp/authorize porta a /accedi?next=… senza
     passare da Better Auth (nessun cookie oidc_login_prompt);
   - /autorizza non si lascia incorniciare (header e prova in un iframe);
   - senza sessione /autorizza non offre "Consenti";
   - con la sessione (@sessione): DCR, authorize SENZA prompt=consent (e con
     prompt=none) → la pagina di consenso compare sempre, con l'host del
     redirect_uri; PKCE obbligatorio (senza code_challenge nessun codice,
     verifier sbagliato nessun token); openid/email/profile chiesti dal
     client si tolgono (niente id_token); poi tools/call col token; Rifiuta
     torna con access_denied; "Scollega" in #agenti toglie l'accesso.
   ────────────────────────────────────────────────────────────── */

import { createHash, randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { nuovoProprietario } from "./helpers/auth.ts";
import { http } from "./helpers/http.ts";
import { rpcMcp } from "./helpers/mcp.ts";
import { expect, test } from "./helpers/test.ts";

const CODICE = "A".repeat(32);
const REDIRECT = "http://127.0.0.1:47123/callback";

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "OAuth: basta una volta");
});

/* ── senza sessione ──────────────────────────────────────────── */

test("senza sessione, authorize porta a /accedi?next=… e Better Auth non la vede", async ({ baseURL }) => {
  const percorso = `/api/auth/mcp/authorize?response_type=code&client_id=x&redirect_uri=${encodeURIComponent(REDIRECT)}&code_challenge=c&code_challenge_method=S256&state=s`;
  const res = await http(new URL(percorso, baseURL).href);
  expect(res.status()).toBe(302);
  const dove = new URL(res.headers()["location"], baseURL);
  expect(dove.pathname).toBe("/accedi");
  expect(dove.searchParams.get("next")).toBe(percorso);
  expect(res.headers()["set-cookie"]).toBeUndefined();
  // Better Auth serve authorize solo in GET
  expect((await http(new URL(percorso, baseURL).href, { method: "POST", data: {} })).status()).toBe(405);
});

test("/autorizza non si lascia incorniciare", async ({ page, baseURL }) => {
  const url = new URL(`/autorizza?consent_code=${CODICE}`, baseURL).href;
  const res = await http(url);
  expect(res.status()).toBe(200);
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(res.headers()["cache-control"]).toContain("no-store");

  // dentro un iframe Chromium non la carica (pagina d'errore al posto del consenso)
  const caricata = page.waitForResponse(r => r.url().startsWith(url));
  await page.setContent(`<iframe src="${url}" width="600" height="400"></iframe>`);
  await caricata;
  const frame = () => page.frames().find(f => f !== page.mainFrame());
  await expect.poll(() => frame()?.url() ?? "").toMatch(/^chrome-error:/);
  expect(await frame()!.locator("text=Consenti").count()).toBe(0);
});

test("senza sessione /autorizza non offre Consenti", async ({ page }) => {
  await page.goto(`/autorizza?consent_code=${CODICE}`);
  await expect(page.getByRole("heading", { name: "Entra per continuare" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Entra" })).toHaveAttribute("href", `/accedi?next=${encodeURIComponent(`/autorizza?consent_code=${CODICE}`)}`);
  await page.goto("/autorizza?consent_code=corto");
  await expect(page.getByRole("heading", { name: "Richiesta non valida" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Consenti" })).toHaveCount(0);
});

/* ── con la sessione ─────────────────────────────────────────── */

const b64url = (b: Buffer) => b.toString("base64url");

/** Un client registrato con la DCR, come fanno Claude e ChatGPT. */
async function registra(baseURL: string | undefined, nome: string) {
  const res = await http(new URL("/api/auth/mcp/register", baseURL).href, {
    method: "POST",
    data: { client_name: nome, redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] },
  });
  expect([200, 201]).toContain(res.status());
  return (await res.json()).client_id as string;
}

/** Apre authorize nel browser e restituisce cosa arriva al redirect_uri (intercettato, nessun server). */
async function autorizza(page: Page, baseURL: string | undefined, q: Record<string, string>) {
  let arrivo: URL | null = null;
  await page.route(`${REDIRECT}**`, route => {
    arrivo = new URL(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
  });
  const url = new URL("/api/auth/mcp/authorize", baseURL);
  for (const [k, v] of Object.entries({ response_type: "code", redirect_uri: REDIRECT, state: "stato-e2e", scope: "concerti offline_access", ...q })) url.searchParams.set(k, v);
  await page.goto(url.href);
  return {
    arrivo: async () => {
      await expect.poll(() => arrivo?.href ?? "", { timeout: 20_000 }).not.toBe("");
      await page.unroute(`${REDIRECT}**`);
      return arrivo!;
    },
  };
}

async function token(baseURL: string | undefined, corpo: Record<string, string>) {
  const res = await fetch(new URL("/api/auth/mcp/token", baseURL), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(corpo),
  });
  return { status: res.status, dati: (await res.json().catch(() => ({}))) as Record<string, any> };
}

test("DCR, consenso sempre, PKCE, tools/call; Rifiuta e Scollega", { tag: "@sessione" }, async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  const { handle } = await nuovoProprietario(page);
  const clientId = await registra(baseURL, "Agente e2e");
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const pkce = { client_id: clientId, code_challenge: challenge, code_challenge_method: "S256" };

  // senza code_challenge: nessun codice, solo l'errore al client. È un 302
  // diretto al redirect_uri, che page.route non intercetta (solo il primo URL
  // di una catena di redirect): si legge il Location con i cookie della pagina
  const senzaUrl = new URL("/api/auth/mcp/authorize", baseURL);
  for (const [k, v] of Object.entries({ response_type: "code", redirect_uri: REDIRECT, state: "stato-e2e", scope: "concerti offline_access", client_id: clientId })) senzaUrl.searchParams.set(k, v);
  const senza = await page.request.get(senzaUrl.href, { maxRedirects: 0 });
  expect(senza.status()).toBe(302);
  const e = new URL(senza.headers()["location"]);
  expect(`${e.origin}${e.pathname}`).toBe(REDIRECT);
  expect(e.searchParams.get("error")).toBe("invalid_request");
  expect(e.searchParams.get("code")).toBeNull();

  // prompt=none: il consenso compare lo stesso, con l'host del redirect_uri in vista
  const primo = await autorizza(page, baseURL, { ...pkce, prompt: "none" });
  await expect(page).toHaveURL(/\/autorizza\?/);
  await expect(page.getByTestId("host-redirect")).toHaveText("127.0.0.1:47123");
  await expect(page.getByText("«Agente e2e»")).toBeVisible();
  await page.getByRole("button", { name: "Consenti" }).click();
  const c1 = (await primo.arrivo()).searchParams;
  expect(c1.get("state")).toBe("stato-e2e");
  // verifier sbagliato: niente token (e il codice è bruciato)
  const sbagliato = await token(baseURL, { grant_type: "authorization_code", code: c1.get("code")!, redirect_uri: REDIRECT, client_id: clientId, code_verifier: b64url(randomBytes(32)) });
  expect(sbagliato.status).toBeGreaterThanOrEqual(400);
  expect(sbagliato.dati.access_token).toBeUndefined();

  // senza prompt, e dopo un consenso già dato: di nuovo il consenso. Chiede
  // anche openid/email/profile: si tolgono, quindi niente id_token né email
  const secondo = await autorizza(page, baseURL, { ...pkce, scope: "concerti offline_access openid email profile" });
  await expect(page.getByTestId("host-redirect")).toHaveText("127.0.0.1:47123");
  await page.getByRole("button", { name: "Consenti" }).click();
  const c2 = (await secondo.arrivo()).searchParams;
  const ok = await token(baseURL, { grant_type: "authorization_code", code: c2.get("code")!, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier });
  expect(ok.status, JSON.stringify(ok.dati.error ?? "")).toBe(200);
  expect(ok.dati.token_type?.toLowerCase()).toBe("bearer");
  expect(ok.dati.refresh_token).toBeTruthy();
  expect(ok.dati.scope).toBe("concerti offline_access");
  expect(ok.dati.id_token).toBeUndefined();
  expect(JSON.stringify(ok.dati)).not.toContain("@");
  const bearer = { authorization: `Bearer ${ok.dati.access_token}` };

  const profilo = await rpcMcp(baseURL, "tools/call", { name: "get_profile", arguments: {} }, bearer);
  expect(profilo.res.status()).toBe(200);
  expect(JSON.parse(profilo.corpo.result.content[0].text)).toMatchObject({ handle });

  // Rifiuta: il client riceve access_denied e nessun codice
  const terzo = await autorizza(page, baseURL, pkce);
  await page.getByRole("button", { name: "Rifiuta" }).click();
  const no = (await terzo.arrivo()).searchParams;
  expect(no.get("error")).toBe("access_denied");
  expect(no.get("code")).toBeNull();

  // #agenti: l'app è elencata con il suo host; Scollega toglie l'accesso subito
  await page.goto(`/${handle}/modifica#agenti`);
  const riga = page.getByRole("list", { name: "Elenco delle app collegate" }).getByRole("listitem").filter({ hasText: "Agente e2e" });
  await expect(riga).toContainText("127.0.0.1:47123");
  await riga.getByRole("button", { name: "Scollega Agente e2e" }).click();
  await riga.getByRole("button", { name: "Sì, scollega" }).click();
  await expect(riga).toHaveCount(0);
  const dopo = await rpcMcp(baseURL, "tools/call", { name: "get_profile", arguments: {} }, bearer);
  expect(dopo.res.status()).toBe(401);
  // e il refresh token non ne crea uno nuovo
  const rinnovo = await token(baseURL, { grant_type: "refresh_token", refresh_token: ok.dati.refresh_token, client_id: clientId });
  expect(rinnovo.dati.access_token).toBeUndefined();
});

test("authorize senza sessione: dopo il login lo stesso next porta al consenso", { tag: "@sessione" }, async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const clientId = await registra(baseURL, "Agente e2e anonimo");
  const challenge = b64url(createHash("sha256").update(b64url(randomBytes(32))).digest());
  const anonimo = await (await browser.newContext()).newPage();
  try {
    const url = new URL("/api/auth/mcp/authorize", baseURL);
    for (const [k, v] of Object.entries({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "s" })) url.searchParams.set(k, v);
    await anonimo.goto(url.href);
    await expect(anonimo).toHaveURL(/\/accedi\?next=/);
    const next = new URL(anonimo.url()).searchParams.get("next")!;
    expect(next.startsWith("/api/auth/mcp/authorize?")).toBe(true);
    // Better Auth non ha visto la richiesta: niente cookie di continuazione
    expect((await anonimo.context().cookies()).map(c => c.name)).not.toContain("oidc_login_prompt");

    await nuovoProprietario(anonimo);
    await anonimo.goto(next);
    await expect(anonimo).toHaveURL(/\/autorizza\?/);
    await expect(anonimo.getByTestId("host-redirect")).toHaveText("127.0.0.1:47123");
    await expect(anonimo.getByRole("button", { name: "Consenti" })).toBeVisible();
  } finally {
    await anonimo.context().close();
  }
});
