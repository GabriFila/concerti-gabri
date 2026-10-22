/* Token degli agenti (PIANO traguardo 7): API key hashate, chiavi e token
   scaduti o disattivati rifiutati, isolamento tra profili, dashboardOnly,
   errori senza il token, agentWrites, revoca e cron di pulizia. Il
   componente Better Auth è quello vero (convex/betterAuth/, da setup()). */

import { defaultKeyHasher } from "@better-auth/api-key";
import { makeFunctionReference } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { codiceDi } from "./lib/errors.ts";
import { CHIAVE_RE, adapterAuth, hashChiave, trovaTutti } from "./lib/agentToken.ts";
import { rateLimiter } from "./rateLimits.ts";
import { creaInAuth, lettere, nuovaRichiestaConsenso, nuovoClientOAuth, nuovoTokenOAuth } from "./test.authFinto.ts";
import { registro } from "./test.registry.ts";
import { conProfilo, setup, venue } from "./test.setup";

const codice = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return codiceDi(e) ?? String((e as Error).message);
  }
};

async function ambiente() {
  const t = setup();
  const a = await conProfilo(t, "u-a", "utente-a");
  const b = await conProfilo(t, "u-b", "utente-b");
  return { t, a, b };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("API key", () => {
  it("si vede una volta sola e nel database c'è solo il suo SHA-256 (come @better-auth/api-key)", async () => {
    const { t, a } = await ambiente();
    const { id, chiave } = await a.as.mutation(api.agents.createApiKey, { input: { nome: "Script" } });
    expect(chiave).toMatch(CHIAVE_RE);
    const righe = await t.run(ctx => trovaTutti(ctx, "apikey", [{ field: "referenceId", value: "u-a" }]));
    expect(righe).toHaveLength(1);
    expect(String(righe[0]._id)).toBe(id);
    expect(righe[0].key).toBe(await hashChiave(chiave));
    expect(righe[0].key).toBe(await defaultKeyHasher(chiave));
    expect(JSON.stringify(righe)).not.toContain(chiave);
    // l'elenco non la ripete
    const elenco = await a.as.query(api.agents.list, {});
    expect(JSON.stringify(elenco)).not.toContain(chiave);
    expect(elenco.chiavi).toMatchObject([{ id, nome: "Script", attiva: true }]);
  });

  it("scrive sul profilo del suo utente, come \"API key · nome\" nel registro, e agentWrites la limita", async () => {
    const { t, a } = await ambiente();
    const { chiave } = await a.as.mutation(api.agents.createApiKey, { input: { nome: "Script di casa" } });
    await t.mutation(api.people.add, { agentToken: chiave, input: { name: "Lu" } });
    // `as: "oracolo"` con un token si ignora: resta l'agente
    await t.mutation(api.people.add, { agentToken: chiave, as: "oracolo", input: { name: "Cami" } });
    const voci = (await a.as.query(api.activity.list, {})).voci;
    expect(voci.map(v => [v.autore, v.via])).toEqual([["API key · Script di casa", "apikey"], ["API key · Script di casa", "apikey"]]);
    // finito il secchio di agentWrites, l'agente si ferma; la dashboard no
    await t.run(async ctx => {
      await rateLimiter.limit(ctx, "agentWrites", { key: a.profileId, count: 198 });
    });
    expect(await codice(t.mutation(api.people.add, { agentToken: chiave, input: { name: "Ultimo" } }))).toBe("limite_superato");
    expect(await codice(a.as.mutation(api.people.add, { input: { name: "Dalla dashboard" } }))).toBe("ok");
  });

  it("una chiave disattivata, scaduta o revocata è rifiutata", async () => {
    const { t, a, b } = await ambiente();
    const now = Date.now();
    const base = { configId: "default", referenceId: "u-a", createdAt: now, updatedAt: now };
    const disattivata = `cgk_${lettere(64)}`;
    const scaduta = `cgk_${lettere(64)}`;
    await creaInAuth(t, "apikey", { ...base, key: await hashChiave(disattivata), enabled: false });
    await creaInAuth(t, "apikey", { ...base, key: await hashChiave(scaduta), enabled: true, expiresAt: now - 1000 });
    for (const k of [disattivata, scaduta]) {
      expect(await codice(t.query(api.people.list, { agentToken: k }))).toBe("unauthorized");
      expect(await t.query(api.agents.introspect, { agentToken: k })).toBeNull();
    }
    const { id, chiave } = await a.as.mutation(api.agents.createApiKey, { input: { nome: "Da revocare", scadenzaGiorni: 30 } });
    expect(await t.query(api.agents.introspect, { agentToken: chiave })).toMatchObject({ via: "apikey", scopes: ["concerti"] });
    // B non revoca la chiave di A (stesso errore di una chiave inesistente)
    expect(await codice(b.as.mutation(api.agents.revokeApiKey, { input: { id } }))).toBe("not_found");
    expect(await codice(b.as.mutation(api.agents.revokeApiKey, { input: { id: "nonesiste" } }))).toBe("not_found");
    await a.as.mutation(api.agents.revokeApiKey, { input: { id } });
    expect(await codice(t.query(api.people.list, { agentToken: chiave }))).toBe("unauthorized");
  });
});

describe("token OAuth (mcp())", () => {
  it("valido: scrive come \"MCP · client\"; scaduto, senza scope o di un client disattivato: rifiutato", async () => {
    const { t, a } = await ambiente();
    await nuovoClientOAuth(t, "claude", { name: "Claude" });
    await nuovoClientOAuth(t, "spento", { disabled: true });
    const buono = await nuovoTokenOAuth(t, "u-a", "claude");
    const scaduto = await nuovoTokenOAuth(t, "u-a", "claude", { accessTokenExpiresAt: Date.now() - 1 });
    const senzaScope = await nuovoTokenOAuth(t, "u-a", "claude", { scopes: "openid" });
    const spento = await nuovoTokenOAuth(t, "u-a", "spento");
    await t.mutation(api.people.add, { agentToken: buono, input: { name: "Lu" } });
    expect((await a.as.query(api.activity.list, {})).voci[0]).toMatchObject({ autore: "MCP · Claude", via: "mcp" });
    expect(await t.query(api.agents.introspect, { agentToken: buono })).toMatchObject({ via: "mcp", clientId: "claude", scopes: ["concerti", "offline_access"] });
    for (const tok of [scaduto, senzaScope, spento]) expect(await codice(t.query(api.people.list, { agentToken: tok }))).toBe("unauthorized");
    expect(await t.query(api.agents.introspect, { agentToken: scaduto })).toBeNull();
  });

  it("revocare un client ne cancella i token", async () => {
    const { t, a, b } = await ambiente();
    await nuovoClientOAuth(t, "claude");
    const tok = await nuovoTokenOAuth(t, "u-a", "claude");
    await nuovoTokenOAuth(t, "u-b", "claude");
    expect((await a.as.query(api.agents.list, {})).client.map(c => c.clientId)).toEqual(["claude"]);
    // B non tocca i token di A
    await b.as.mutation(api.agents.revokeOAuthClient, { input: { clientId: "claude" } });
    expect(await codice(t.query(api.people.list, { agentToken: tok }))).toBe("ok");
    await a.as.mutation(api.agents.revokeOAuthClient, { input: { clientId: "claude" } });
    expect(await codice(t.query(api.people.list, { agentToken: tok }))).toBe("unauthorized");
    expect(await codice(a.as.mutation(api.agents.revokeOAuthClient, { input: { clientId: "claude" } }))).toBe("not_found");
  });

  it("Scollega toglie anche i token più nuovi, oltre le prime 1000 righe dell'utente (un refresh crea una riga ogni volta)", async () => {
    const { t, a } = await ambiente();
    await nuovoClientOAuth(t, "vecchio");
    await nuovoClientOAuth(t, "claude");
    // 1050 righe più vecchie di un altro client, poi i token in uso di "claude"
    await t.run(async ctx => {
      const now = Date.now();
      for (let i = 0; i < 1050; i++) {
        await ctx.runMutation(adapterAuth().create, {
          input: {
            model: "oauthAccessToken",
            data: {
              accessToken: lettere(32), refreshToken: lettere(32), accessTokenExpiresAt: now + 3600_000, refreshTokenExpiresAt: now + 30 * 86400_000,
              clientId: "vecchio", userId: "u-a", scopes: "concerti offline_access", createdAt: now, updatedAt: now,
            },
          },
        });
      }
    });
    const primo = await nuovoTokenOAuth(t, "u-a", "claude");
    const rinnovato = await nuovoTokenOAuth(t, "u-a", "claude");
    await creaInAuth(t, "oauthConsent", { clientId: "claude", userId: "u-a", scopes: "concerti offline_access", consentGiven: true, createdAt: Date.now(), updatedAt: Date.now() });
    expect((await a.as.query(api.agents.list, {})).client.map(c => c.clientId).sort()).toEqual(["claude", "vecchio"]);

    expect(await a.as.mutation(api.agents.revokeOAuthClient, { input: { clientId: "claude" } })).toEqual({ ok: true, revocati: 2 });
    for (const tok of [primo, rinnovato]) expect(await codice(t.query(api.people.list, { agentToken: tok }))).toBe("unauthorized");
    const resto = await t.run(async ctx => ({
      token: await trovaTutti(ctx, "oauthAccessToken", [{ field: "userId", value: "u-a" }], Infinity),
      consensi: await trovaTutti(ctx, "oauthConsent", [{ field: "userId", value: "u-a" }], Infinity),
    }));
    expect(resto.token).toHaveLength(1050);
    expect(resto.token.every(r => r.clientId === "vecchio")).toBe(true);
    expect(resto.consensi).toEqual([]);
    expect((await a.as.query(api.agents.list, {})).client.map(c => c.clientId)).toEqual(["vecchio"]);
  });
});

describe("consenso (/autorizza)", () => {
  it("mostra al proprietario il client e l'host del redirect_uri; scaduta, già usata o altrui = not_found", async () => {
    const { t, a, b } = await ambiente();
    await nuovoClientOAuth(t, "claude", { name: "Claude", redirectUrls: "https://claude.ai/api/mcp/auth_callback" });
    await nuovoClientOAuth(t, "cc", { name: "Claude Code", redirectUrls: "http://localhost:33418/callback" });
    await nuovoClientOAuth(t, "spento", { disabled: true });
    const code = await nuovaRichiestaConsenso(t, "u-a", "claude", { redirectURI: "https://claude.ai/api/mcp/auth_callback" });
    expect(await a.as.query(api.agents.consenso, { input: { consentCode: code } })).toMatchObject({
      cliente: "Claude", host: "claude.ai", tipo: "https", scopes: ["concerti", "offline_access"],
    });
    const locale = await nuovaRichiestaConsenso(t, "u-a", "cc", { redirectURI: "http://localhost:33418/callback" });
    expect(await a.as.query(api.agents.consenso, { input: { consentCode: locale } })).toMatchObject({ host: "localhost:33418", tipo: "locale" });
    // l'elenco dei client mostra gli stessi host
    await nuovoTokenOAuth(t, "u-a", "claude");
    expect((await a.as.query(api.agents.list, {})).client).toMatchObject([{ clientId: "claude", nome: "Claude", host: ["claude.ai"] }]);

    const usata = await nuovaRichiestaConsenso(t, "u-a", "claude", { requireConsent: false });
    const scaduta = await nuovaRichiestaConsenso(t, "u-a", "claude", { scadenza: Date.now() - 1 });
    const spenta = await nuovaRichiestaConsenso(t, "u-a", "spento");
    for (const c of [usata, scaduta, spenta, lettere(32)]) expect(await codice(a.as.query(api.agents.consenso, { input: { consentCode: c } }))).toBe("not_found");
    // B non vede la richiesta di A (stesso errore di un codice inesistente)
    expect(await codice(b.as.query(api.agents.consenso, { input: { consentCode: code } }))).toBe("not_found");
    // un codice malformato non torna nell'errore
    try {
      await a.as.query(api.agents.consenso, { input: { consentCode: "Via dei Canarini 7, Genova" } });
      throw new Error("doveva fallire");
    } catch (e) {
      expect(codiceDi(e)).toBe("input_non_valido");
      expect(JSON.stringify((e as { data?: unknown }).data)).not.toContain("Canarini");
    }
    // un token non vede le richieste di consenso
    const { chiave } = await a.as.mutation(api.agents.createApiKey, { input: { nome: "K" } });
    expect(await codice(t.query(api.agents.consenso, { agentToken: chiave, input: { consentCode: code } }))).toBe("solo_dashboard");
  });

  it("redirect_uri di un'app (schema proprio), in http o senza host: l'indirizzo non resta mai vuoto e l'avviso http vale solo per http", async () => {
    const { t, a } = await ambiente();
    const casi: [string, string, string][] = [
      ["cursor://anysphere.cursor-mcp/oauth/callback", "cursor://anysphere.cursor-mcp", "app"],
      ["com.example.app:/oauth2redirect", "com.example.app:/oauth2redirect", "app"],
      ["http://agente.example.com/cb", "agente.example.com", "http"],
      ["http://[::1]:5000/cb", "[::1]:5000", "locale"],
    ];
    for (const [uri, host, tipo] of casi) {
      const clientId = `c-${tipo}-${host.length}`;
      await nuovoClientOAuth(t, clientId, { redirectUrls: uri });
      const code = await nuovaRichiestaConsenso(t, "u-a", clientId, { redirectURI: uri });
      expect(await a.as.query(api.agents.consenso, { input: { consentCode: code } }), uri).toMatchObject({ host, tipo });
    }
    // un URI lunghissimo si taglia
    const lungo = `com.example.app:/${"x".repeat(500)}`;
    await nuovoClientOAuth(t, "lungo", { redirectUrls: lungo });
    const r = await a.as.query(api.agents.consenso, { input: { consentCode: await nuovaRichiestaConsenso(t, "u-a", "lungo", { redirectURI: lungo }) } });
    expect(r.host.length).toBeLessThanOrEqual(120);
    expect(r.host.endsWith("…")).toBe(true);
  });

  it("il nome scelto dal client si ripulisce e si taglia a 40 caratteri, come nel registro", async () => {
    const { t, a } = await ambiente();
    await nuovoClientOAuth(t, "furbo", { name: `Claude\u202e\u0007 ufficiale\n${"!".repeat(200)}`, redirectUrls: "https://evil.example/cb" });
    const code = await nuovaRichiestaConsenso(t, "u-a", "furbo", { redirectURI: "https://evil.example/cb" });
    const { cliente } = await a.as.query(api.agents.consenso, { input: { consentCode: code } });
    expect(cliente).toBe(`Claude ufficiale ${"!".repeat(23)}`);
    expect([...cliente].length).toBe(40);
    await nuovoTokenOAuth(t, "u-a", "furbo");
    expect((await a.as.query(api.agents.list, {})).client[0].nome).toBe(cliente);
  });

  it("una richiesta con scope oltre concerti/offline_access (openid, email…) non si mostra", async () => {
    const { t, a } = await ambiente();
    await nuovoClientOAuth(t, "claude", { name: "Claude" });
    for (const scope of [["concerti", "openid"], ["concerti", "offline_access", "email"], ["profile"]]) {
      const code = await nuovaRichiestaConsenso(t, "u-a", "claude", { scope });
      expect(await codice(a.as.query(api.agents.consenso, { input: { consentCode: code } })), scope.join(" ")).toBe("not_found");
    }
    const solo = await nuovaRichiestaConsenso(t, "u-a", "claude", { scope: ["concerti"] });
    expect(await a.as.query(api.agents.consenso, { input: { consentCode: solo } })).toMatchObject({ scopes: ["concerti"] });
  });

  it("trova anche un consent_code salvato come SHA-256 (verification.storeIdentifier: hashed)", async () => {
    const { t, a } = await ambiente();
    await nuovoClientOAuth(t, "claude", { name: "Claude" });
    const code = lettere(32);
    const now = Date.now();
    await creaInAuth(t, "verification", {
      identifier: await hashChiave(code),
      value: JSON.stringify({ clientId: "claude", redirectURI: "https://claude.ai/cb", scope: ["concerti"], userId: "u-a", requireConsent: true }),
      expiresAt: now + 60_000, createdAt: now, updatedAt: now,
    });
    expect(await a.as.query(api.agents.consenso, { input: { consentCode: code } })).toMatchObject({ cliente: "Claude", host: "claude.ai" });
  });
});

describe("isolamento e dashboardOnly con i token", () => {
  it("A non vede e non modifica B; le funzioni dashboardOnly rispondono solo_dashboard", async () => {
    const { t, a, b } = await ambiente();
    await venue(t, "Fabrique", "Milano", 9.25, 45.45);
    const personaA = (await a.as.mutation(api.people.add, { input: { name: "Marco R." } })).id;
    const partenzaA = (await a.as.mutation(api.departures.add, { input: { name: "Casa" } })).id;
    const { chiave } = await b.as.mutation(api.agents.createApiKey, { input: { nome: "B" } });
    await nuovoClientOAuth(t, "claude");
    const tokB = await nuovoTokenOAuth(t, "u-b", "claude");
    for (const tok of [chiave, tokB]) {
      expect((await t.query(api.people.list, { agentToken: tok })).people).toEqual([]);
      expect(await codice(t.mutation(api.people.rename, { agentToken: tok, input: { id: personaA, name: "Preso" } }))).toBe("not_found");
      expect(await codice(t.mutation(api.departures.confirmAddress, { agentToken: tok, input: { departureId: partenzaA, indice: 0 } }))).toBe("solo_dashboard");
      expect(await codice(t.mutation(api.agents.createApiKey, { agentToken: tok, input: { nome: "altra" } }))).toBe("solo_dashboard");
      expect(await codice(t.query(api.agents.list, { agentToken: tok }))).toBe("solo_dashboard");
      expect(await codice(t.action(api.geo.geocodeDeparture, { agentToken: tok, input: { departureId: partenzaA, address: "Via dei Canarini 7, Genova" } }))).toBe("solo_dashboard");
      expect(await codice(t.query(api.importer.preview, { agentToken: tok, input: { formato: "json", contenuto: "[]" } }))).toBe("solo_dashboard");
    }
    expect((await a.as.query(api.people.list, {})).people.map(p => p.name)).toEqual(["Marco R."]);
  });

  it("ogni funzione dashboardOnly risponde solo_dashboard a una API key e a un token OAuth (account.export e account.delete compresi)", async () => {
    const { t, a } = await ambiente();
    const { chiave } = await a.as.mutation(api.agents.createApiKey, { input: { nome: "A" } });
    await nuovoClientOAuth(t, "claude");
    const tok = await nuovoTokenOAuth(t, "u-a", "claude");
    const soloDashboard = registro().filter(f => f.meta?.dashboardOnly);
    const percorsi = soloDashboard.map(f => f.path);
    expect(percorsi).toEqual(expect.arrayContaining(["agents:list", "agents:createApiKey", "agents:revokeOAuthClient", "agents:consenso", "importer:preview"]));
    // account.export e account.delete (corsia 5: `export` e `delete` sono parole riservate, quindi esporta ed elimina)
    expect(percorsi).toEqual(expect.arrayContaining(["account:esporta", "account:elimina"]));
    for (const agentToken of [chiave, tok]) {
      for (const f of soloDashboard) {
        // il controllo viene prima dell'input: un input vuoto basta
        const args = { agentToken, input: {} };
        const esito = f.fn.isQuery
          ? t.query(makeFunctionReference<"query">(f.path), args)
          : f.fn.isMutation
            ? t.mutation(makeFunctionReference<"mutation">(f.path), args)
            : t.action(makeFunctionReference<"action">(f.path), args);
        expect(await codice(esito), f.path).toBe("solo_dashboard");
      }
    }
  });

  it("un agentToken malformato non compare nell'errore", async () => {
    const { t } = await ambiente();
    const CANARINO = "Via dei Canarini 7, Genova";
    for (const tok of [CANARINO, `cgk_${CANARINO}`, `Bearer ${CANARINO}`, "x".repeat(5000), 42, { t: CANARINO }]) {
      try {
        await t.query(api.people.list, { agentToken: tok });
        throw new Error("doveva fallire");
      } catch (e) {
        const testo = JSON.stringify((e as { data?: unknown }).data) + String((e as Error).message);
        expect(codiceDi(e)).toBe("unauthorized");
        expect(testo).not.toContain("Canarini");
        expect(testo).not.toContain("xxxxxxxxxx");
      }
      expect(await t.query(api.agents.introspect, { agentToken: tok })).toBeNull();
    }
  });
});

describe("get_stats", () => {
  it("le KPI della pagina dell'agente, filtrabili per anno", async () => {
    const { t, a } = await ambiente();
    await venue(t, "Fabrique", "Milano", 9.25, 45.45);
    const { chiave } = await a.as.mutation(api.agents.createApiKey, { input: { nome: "Stat" } });
    await a.as.mutation(api.people.add, { input: { name: "Lu" } });
    await a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/02/2024", artist: "X", venue: "Fabrique", city: "Milano", with: ["Lu"], voto: 4, cost: 30 } });
    await a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/02/2025", artist: "Y", venue: "Fabrique", city: "Milano", voto: 2, cost: 20 } });
    const tutte = await t.query(api.agents.stats, { agentToken: chiave });
    expect(tutte).toMatchObject({ eventi: 2, concerti: 2 });
    expect(tutte.kpi.find(k => k.id === "concerti")?.valore).toBe(2);
    expect(tutte.kpi.find(k => k.id === "speso")?.valore).toBe("€50");
    const anno = await t.query(api.agents.stats, { agentToken: chiave, input: { anno: 2024 } });
    expect(anno).toMatchObject({ anno: 2024, eventi: 1 });
    expect(anno.kpi.find(k => k.id === "compagni")?.valore).toBe(1);
    // come la dashboard: l'anno di partenza della media viene dal profilo intero, non dall'anno filtrato
    const a25 = await t.query(api.agents.stats, { agentToken: chiave, input: { anno: 2025 } });
    expect(a25.kpi.find(k => k.id === "media")?.nota).toBe("dal 2024 a oggi");
  });
});

describe("cron di pulizia", () => {
  it("client DCR senza token dopo 24 ore; token non più usabili; chiavi scadute", async () => {
    const { t, a } = await ambiente();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() - 2 * 24 * 3600_000);
    await nuovoClientOAuth(t, "vecchio-senza-token");
    await nuovoClientOAuth(t, "vecchio-con-token");
    vi.useRealTimers();
    await nuovoClientOAuth(t, "nuovo-senza-token");
    await nuovoTokenOAuth(t, "u-a", "vecchio-con-token");
    const morto = await nuovoTokenOAuth(t, "u-a", "vecchio-con-token", { accessTokenExpiresAt: Date.now() - 1, refreshTokenExpiresAt: Date.now() - 1 });
    const rinnovabile = await nuovoTokenOAuth(t, "u-a", "vecchio-con-token", { accessTokenExpiresAt: Date.now() - 1 });
    const { chiave } = await a.as.mutation(api.agents.createApiKey, { input: { nome: "Breve", scadenzaGiorni: 1 } });

    await t.mutation(internal.agents.cleanupDcrClients, {});
    const app = await t.run(ctx => trovaTutti(ctx, "oauthApplication", []));
    expect(app.map(x => x.clientId).sort()).toEqual(["nuovo-senza-token", "vecchio-con-token"]);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * 24 * 3600_000);
    await t.mutation(internal.agents.cleanupExpiredTokens, {});
    vi.useRealTimers();
    const token = (await t.run(ctx => trovaTutti(ctx, "oauthAccessToken", []))).map(x => x.accessToken);
    expect(token).not.toContain(morto);
    expect(token).toContain(rinnovabile);
    expect(await t.query(api.agents.introspect, { agentToken: chiave })).toBeNull();
    expect(await t.run(ctx => trovaTutti(ctx, "apikey", []))).toEqual([]);
  });
});
