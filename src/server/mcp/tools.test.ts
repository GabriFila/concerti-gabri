/* Il server MCP senza Convex (client finto): strumenti = catalogo,
   descrizioni con la regola dei soprannomi e le scale, input accettati
   dall'API di Claude, niente chiavi private nelle risposte, errori
   `{code, messaggio}`, 401/403/405, Origin e metadati OAuth. */

import { ConvexError } from "convex/values";
import { getFunctionName, type FunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import { CATALOGO } from "../../../shared/agent/catalog.ts";
import { handleMcp, type ClientConvex } from "./handler.ts";
import { correggiMetadatiAs, documentoRisorsa, handleMetadatiAs, handleMetadatiRisorsa } from "./metadati.ts";
import { origineCanonica } from "./origine.ts";
import { descrizioneStrumento, inserisceNomi, jsonSchemaInput, proietta, usaScale } from "./strumenti.ts";

const ORIGINE = "https://concerti.example";
const ENV = { SITE_URL: ORIGINE };
const CHIAVE = `cgk_${"a".repeat(64)}`;
const CANARINO = "Via dei Canarini 7, Genova";

type Chiamata = { fn: string; args: Record<string, unknown> };

/** Un client Convex finto: introspect accetta CHIAVE, le altre funzioni rispondono con `risposte`. */
function clientFinto(risposte: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  const chiamate: Chiamata[] = [];
  const chiama = async (ref: FunctionReference<any>, args: Record<string, unknown>) => {
    const fn = getFunctionName(ref);
    chiamate.push({ fn, args });
    if (fn === "agents:introspect") return args.agentToken === CHIAVE ? { via: "apikey", scopes: ["concerti"] } : null;
    const r = risposte[fn];
    if (!r) throw new Error(`Could not find public function for '${fn}'`);
    return r(args);
  };
  const client: ClientConvex = { query: chiama, mutation: chiama, action: chiama };
  return { client, chiamate };
}

const rpc = (method: string, params: Record<string, unknown> = {}, id = 1) => ({ jsonrpc: "2.0", id, method, params });

async function post(body: unknown, { headers = {}, client = clientFinto().client } = {} as { headers?: Record<string, string>; client?: ClientConvex }) {
  const req = new Request("http://localhost:3100/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", ...headers },
    body: JSON.stringify(body),
  });
  return await handleMcp(req, { env: ENV, client: () => client });
}

/** Il messaggio JSON-RPC di una risposta (JSON o SSE). */
async function messaggio(res: Response): Promise<any> {
  const text = await res.text();
  const data = text.startsWith("{") ? text : text.split("\n").find(l => l.startsWith("data:"))?.slice(5).trim();
  return JSON.parse(data ?? "null");
}

async function chiamaStrumento(name: string, args: unknown, risposte: Record<string, (a: Record<string, unknown>) => unknown>) {
  const { client, chiamate } = clientFinto(risposte);
  const res = await post(rpc("tools/call", { name, arguments: args }), { headers: { "x-api-key": CHIAVE }, client });
  expect(res.status).toBe(200);
  const m = await messaggio(res);
  return { risultato: m.result, testo: m.result.content[0].text as string, chiamate };
}

describe("strumenti = catalogo", () => {
  it("tools/list elenca un solo strumento per operazione, con input object senza oneOf alla radice", async () => {
    const res = await post(rpc("tools/list"), { headers: { authorization: `Bearer ${CHIAVE}` } });
    expect(res.status).toBe(200);
    const tools = (await messaggio(res)).result.tools as { name: string; description: string; inputSchema: Record<string, unknown> }[];
    expect(tools.map(t => t.name).sort()).toEqual(CATALOGO.map(o => o.name).sort());
    for (const t of tools) {
      expect(t.inputSchema.type, t.name).toBe("object");
      expect(t.inputSchema, t.name).not.toHaveProperty("oneOf");
      expect(t.inputSchema, t.name).not.toHaveProperty("anyOf");
      expect(t.description, t.name).toBe(descrizioneStrumento(CATALOGO.find(o => o.name === t.name)!));
    }
    // add_concert: le proprietà di concerto e festival insieme, obbligatorie solo quelle comuni
    const add = tools.find(t => t.name === "add_concert")!.inputSchema as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(add.properties)).toEqual(expect.arrayContaining(["kind", "artist", "with", "name", "concerts", "venue", "from"]));
    expect(add.required.sort()).toEqual(["city", "date", "kind", "venue"]);
  });

  it("descrizioni: regola dei soprannomi dove si inseriscono nomi, scale dove servono, mai indirizzi", () => {
    const conNomi = CATALOGO.filter(inserisceNomi).map(o => o.name);
    expect(conNomi).toEqual(expect.arrayContaining(["add_concert", "update_concert", "add_person", "rename_person", "add_gifter", "update_gifter", "import_concerts"]));
    for (const op of CATALOGO) {
      const d = descrizioneStrumento(op);
      if (inserisceNomi(op)) {
        expect(d, op.name).toContain("Marco Rossi");
        expect(d, op.name).toContain("Marco R.");
      }
      if (usaScale(op)) for (const s of ["Transenna", "Anello alto", "voto 1–5"]) expect(d, op.name).toContain(s);
      // nessuno strumento chiede o promette un indirizzo
      expect(JSON.stringify(jsonSchemaInput(op.input)), op.name).not.toMatch(/"(address|indirizzo|lat|lng)"/);
    }
    for (const n of ["add_concert", "update_concert", "import_concerts"]) expect(descrizioneStrumento(CATALOGO.find(o => o.name === n)!)).toContain("#partenze");
  });
});

describe("chiamate", () => {
  it("la funzione del catalogo, col token dell'agente e l'input così com'è (lo valida Convex)", async () => {
    const { testo, chiamate } = await chiamaStrumento("list_concerts", { anno: 2025 }, { "entries:list": () => ({ concerts: [{ id: "e1" }] }) });
    expect(JSON.parse(testo)).toEqual({ concerts: [{ id: "e1" }] });
    expect(chiamate.at(-1)).toEqual({ fn: "entries:list", args: { agentToken: CHIAVE, input: { anno: 2025 } } });
  });

  it("nessuna risposta contiene address, lat, lng o coordinate; i fix diventano URL assoluti", async () => {
    const { testo } = await chiamaStrumento("search_venue", { query: "Fabrique" }, {
      "geo:searchVenue": () => ({ catalogo: [], candidati: [{ ref: "abcdefgh:0", name: "Fabrique", city: "Milano", lng: 9.25, lat: 45.45, label: "Fabrique" }], attribuzione: "© OpenStreetMap contributors" }),
    });
    expect(testo).not.toMatch(/"(lat|lng)"/);
    const add = await chiamaStrumento("add_concert", { kind: "concert" }, {
      "entries:add": () => ({ id: "e1", avviso: "departure_address_missing", fix: "/utente-a/modifica#partenze", address: CANARINO }),
    });
    expect(JSON.parse(add.testo)).toEqual({ id: "e1", avviso: "departure_address_missing", fix: `${ORIGINE}/utente-a/modifica#partenze` });
    expect(proietta({ a: [{ coordinate: [1, 2], b: { indirizzo: "x", ok: 1 } }] }, ORIGINE)).toEqual({ a: [{ b: { ok: 1 } }] });
  });

  it("errori: {code, messaggio} del nostro codice con il fix assoluto, generico per tutto il resto", async () => {
    const convex = await chiamaStrumento("add_person", { name: "Lu" }, {
      "people:add": () => {
        throw new ConvexError({ code: "no_profile", messaggio: "completa prima il profilo", fix: "/benvenuto" });
      },
    });
    expect(convex.risultato.isError).toBe(true);
    expect(JSON.parse(convex.testo)).toEqual({ code: "no_profile", messaggio: "completa prima il profilo", fix: `${ORIGINE}/benvenuto` });
    const grezzo = await chiamaStrumento("add_person", { name: CANARINO }, {
      "people:add": () => {
        throw new Error(`Server Error: Uncaught Error: ${CANARINO} ${CHIAVE}`);
      },
    });
    expect(grezzo.risultato.isError).toBe(true);
    expect(JSON.parse(grezzo.testo)).toMatchObject({ code: "non_disponibile" });
    expect(grezzo.testo).not.toContain("Canarini");
    expect(grezzo.testo).not.toContain(CHIAVE);
  });

  it("set_gifter_logo chiama gifters:setLogoFromUrl (corsia 5) col token dell'agente", async () => {
    const { risultato, chiamate } = await chiamaStrumento("set_gifter_logo", { id: "g1", url: null }, { "gifters:setLogoFromUrl": () => ({ ok: true }) });
    expect(risultato.isError).toBeFalsy();
    expect(chiamate.map(c => c.fn)).toEqual(["agents:introspect", "gifters:setLogoFromUrl"]);
    expect(chiamate[1].args).toEqual({ agentToken: CHIAVE, input: { id: "g1", url: null } });
  });
});

describe("HTTP", () => {
  it("GET e DELETE → 405 {code, messaggio}", async () => {
    for (const method of ["GET", "DELETE", "PUT"]) {
      const res = await handleMcp(new Request("http://localhost:3100/mcp", { method }), { env: ENV, client: () => clientFinto().client });
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
      expect(await res.json()).toMatchObject({ code: "non_disponibile" });
    }
  });

  it("senza token o con un token sbagliato → 401 con WWW-Authenticate verso i metadati della risorsa; il token non torna mai", async () => {
    for (const headers of [{}, { authorization: `Bearer ${CANARINO}` }, { "x-api-key": `cgk_${CANARINO}` }, { authorization: "Basic xyz" }] as Record<string, string>[]) {
      const res = await post(rpc("tools/list"), { headers });
      expect([400, 401]).toContain(res.status);
      const text = await res.text();
      expect(JSON.parse(text)).toHaveProperty("code");
      expect(JSON.parse(text)).toHaveProperty("messaggio");
      expect(text + (res.headers.get("www-authenticate") ?? "")).not.toContain("Canarini");
      if (res.status === 401) expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${ORIGINE}/.well-known/oauth-protected-resource/mcp"`);
    }
  });

  it("x-api-key vale come Bearer", async () => {
    const { client, chiamate } = clientFinto();
    const res = await post(rpc("tools/list"), { headers: { "x-api-key": CHIAVE }, client });
    expect(res.status).toBe(200);
    expect(chiamate[0]).toEqual({ fn: "agents:introspect", args: { agentToken: CHIAVE } });
  });

  it("un Origin non ammesso → 403; nessun Origin (client non browser) passa", async () => {
    const res = await post(rpc("tools/list"), { headers: { "x-api-key": CHIAVE, origin: "https://evil.example" } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "unauthorized" });
    expect((await post(rpc("tools/list"), { headers: { "x-api-key": CHIAVE, origin: "http://localhost:3100" } })).status).toBe(200);
  });

  it("Convex irraggiungibile → 503 {code, messaggio}", async () => {
    const giu: ClientConvex = { query: async () => { throw new Error("fetch failed"); }, mutation: async () => null, action: async () => null };
    const res = await post(rpc("tools/list"), { headers: { "x-api-key": CHIAVE }, client: giu });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "non_disponibile" });
  });
});

describe("origine e metadati OAuth", () => {
  it("origine per ambiente, mai dall'Host", () => {
    expect(origineCanonica({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "concerti.gabrifila.me" })).toBe("https://concerti.gabrifila.me");
    expect(origineCanonica({ VERCEL_ENV: "production" })).toBe("https://concerti.gabrifila.me");
    expect(origineCanonica({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "concerti-gabri-git-x.vercel.app" })).toBe("https://concerti-gabri-git-x.vercel.app");
    expect(origineCanonica({ SITE_URL: "https://fase3-m7.concerti-gabri.localhost:1355" })).toBe("https://fase3-m7.concerti-gabri.localhost:1355");
    expect(origineCanonica({ VITE_SITE_URL: "https://t3node.tail4a8e3b.ts.net:8444/" })).toBe("https://t3node.tail4a8e3b.ts.net:8444");
    expect(origineCanonica({})).toBe("http://localhost:3100");
  });

  it("PRM: la risorsa è <origine>/mcp e il server di autorizzazione l'origine (= issuer)", async () => {
    expect(documentoRisorsa(ORIGINE)).toMatchObject({ resource: `${ORIGINE}/mcp`, authorization_servers: [ORIGINE], scopes_supported: ["concerti"] });
    const res = handleMetadatiRisorsa(new Request("http://x/.well-known/oauth-protected-resource/mcp"), ENV);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect((await res.json()).resource).toBe(`${ORIGINE}/mcp`);
    expect(handleMetadatiRisorsa(new Request("http://x/", { method: "POST" }), ENV).status).toBe(405);
  });

  it("AS: i metadati di Better Auth senza jwks/userinfo, con scope concerti e solo S256", async () => {
    const ba = {
      issuer: ORIGINE, authorization_endpoint: `${ORIGINE}/api/auth/mcp/authorize`, token_endpoint: `${ORIGINE}/api/auth/mcp/token`,
      registration_endpoint: `${ORIGINE}/api/auth/mcp/register`, jwks_uri: "x", userinfo_endpoint: "y", scopes_supported: ["openid", "profile", "email", "offline_access"],
      code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    };
    const corretti = correggiMetadatiAs(ba);
    expect(corretti).not.toHaveProperty("jwks_uri");
    expect(corretti).not.toHaveProperty("userinfo_endpoint");
    expect(corretti).toMatchObject({ issuer: ORIGINE, scopes_supported: ["concerti", "offline_access"], code_challenge_methods_supported: ["S256"] });
    let chiesto = "";
    const res = await handleMetadatiAs(new Request("http://x/.well-known/oauth-authorization-server"), "http://127.0.0.1:3211", (async (url: string) => {
      chiesto = url;
      return Response.json(ba);
    }) as unknown as typeof fetch);
    expect(chiesto).toBe("http://127.0.0.1:3211/api/auth/.well-known/oauth-authorization-server");
    expect((await res.json()).registration_endpoint).toBe(`${ORIGINE}/api/auth/mcp/register`);
    const giu = await handleMetadatiAs(new Request("http://x/"), "http://127.0.0.1:3211", (async () => new Response("no", { status: 404 })) as unknown as typeof fetch);
    expect(giu.status).toBe(503);
    expect(await giu.json()).toMatchObject({ code: "non_disponibile" });
  });
});
