/* La vista admin in sola lettura (DECISIONI «Vista admin», 2026-11-12):
   solo la sessione di un utente in ADMIN_USER_IDS; chiunque altro (token
   agente e `as: "oracolo"` compresi) riceve `not_found`; nessuna risposta
   porta indirizzi, coordinate, email, chiavi, hash o il testo delle chat
   private (sentinelle nel seed del test). */

import { afterEach, describe, expect, it, vi } from "vitest";
import { flatConcerts } from "../shared/model/concert.ts";
import { pageToDataset, type PaginaPubblica } from "../shared/lib/pageToDataset.ts";
import { api, components, internal } from "./_generated/api";
import { codiceDi } from "./lib/errors.ts";
import { idAdmin } from "./lib/admin.ts";
import { nuovoClientOAuth, nuovoTokenOAuth } from "./test.authFinto.ts";
import { conProfilo, setup, venue, type T } from "./test.setup";

const SENTINELLA = {
  indirizzo: "Via della Sentinella Admin 42, Genova",
  lng: 8.9876543,
  lat: 44.3456789,
  email: "sentinella-admin@example.test",
  testoPrivato: "testo privato sentinella",
  titoloPrivato: "titolo privato sentinella",
  hash: "hash-sentinella-chiave",
  ip: "ip-sentinella-hmac",
};

/** Un utente Better Auth vero (con l'email sentinella) e il suo profilo. */
async function utenteConEmail(t: T, email: string, handle: string) {
  const now = Date.now();
  const u = (await t.run(ctx =>
    ctx.runMutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: handle, email, emailVerified: true, createdAt: now, updatedAt: now } } }),
  )) as { _id: string };
  return { userId: u._id, ...(await conProfilo(t, u._id, handle)) };
}

async function scenario() {
  const t = setup();
  vi.stubEnv("AUTH_DEV_OTP", "1");
  const admin = await conProfilo(t, "u-admin", "gestore");
  vi.stubEnv("ADMIN_USER_IDS", " altro-id , u-admin ");
  const a = await utenteConEmail(t, SENTINELLA.email, "utente-a");
  await venue(t, "Fabrique", "Milano", 9.25, 45.45);
  await a.as.mutation(api.people.add, { input: { name: "Lu" } });
  await a.as.mutation(api.departures.add, { input: { name: "Casa" } });
  await a.as.mutation(api.departures.add, { input: { name: "Ufficio" } });
  await t.mutation(internal.devtools.setDepartureForTest, { handle: "utente-a", departure: "Casa", address: SENTINELLA.indirizzo, lng: SENTINELLA.lng, lat: SENTINELLA.lat });
  await a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/06/2025", artist: "Uno", venue: "Fabrique", city: "Milano", with: ["Lu"], from: "Casa" } });
  await a.as.mutation(api.entries.add, {
    input: { kind: "festival", name: "Fest", date: "02/06/2025", venue: "Fabrique", city: "Milano", from: "Casa", concerts: [{ artist: "Due", with: [] }, { artist: "Tre", with: ["Lu"] }] },
  });
  await a.as.mutation(api.wishlist.set, { input: { artists: ["Quattro"] } });
  const chiave = (await a.as.mutation(api.agents.createApiKey, { input: { nome: "Script" } })).chiave;
  await t.run(async ctx => {
    const base = { profileId: a.profileId, updatedAt: Date.now(), expiresAt: Date.now() + 86_400_000 };
    await ctx.db.insert("chatThreads", {
      ...base, threadId: "privato-a", visibility: "proprietario", title: SENTINELLA.titoloPrivato,
      messages: [{ role: "user", content: SENTINELLA.testoPrivato }, { role: "assistant", content: "ok" }],
    });
    await ctx.db.insert("chatThreads", {
      ...base, threadId: "pubblico-a", visibility: "pubblica", title: "Domanda pubblica", author: "Visitatore",
      writeKeyHash: SENTINELLA.hash, ipHmac: SENTINELLA.ip, messages: [{ role: "user", content: "quanti?" }],
    });
    const p = await ctx.db.get(a.profileId);
    await ctx.db.patch(a.profileId, { layout: { ...p!.layout, nascoste: ["sec-mappa"] } });
    // un profilo a metà onboarding, senza handle
    await ctx.db.insert("profiles", {
      authUserId: "u-onb", status: "onboarding", onboardingStep: "partenze", theme: { preset: "predefinito" },
      layout: { ordine: [], nascoste: [], titoli: {} }, extra: {}, createdAt: Date.now(),
    });
  });
  return { t, admin, a, chiave };
}

/** Il testo di una risposta, e quali sentinelle (o segreti del test) ci sono dentro. */
function sentinelleIn(risposta: unknown, extra: string[] = []): string[] {
  const testo = JSON.stringify(risposta);
  const aghi = [
    SENTINELLA.indirizzo, "Sentinella", SENTINELLA.email, SENTINELLA.testoPrivato, SENTINELLA.titoloPrivato, SENTINELLA.hash, SENTINELLA.ip,
    ...[SENTINELLA.lng, SENTINELLA.lat].flatMap(n => [4, 5, 7].map(d => n.toFixed(d))),
    ...extra,
  ];
  return aghi.filter(x => testo.includes(x));
}

afterEach(() => vi.unstubAllEnvs());

describe("ADMIN_USER_IDS", () => {
  it("lista separata da virgole; vuota o assente = nessun admin", () => {
    expect([...idAdmin(" a , b,,c ")]).toEqual(["a", "b", "c"]);
    expect(idAdmin("").size).toBe(0);
    expect(idAdmin(undefined).size).toBe(0);
  });
});

describe("vista admin", () => {
  it("l'admin vede tutti i profili, anche in onboarding, con conteggi, partenze e sezioni nascoste", async () => {
    const { admin, a } = await scenario();
    const lista = await admin.as.query(api.admin.profili, {});
    expect(lista).toHaveLength(3);
    expect(new Set(lista.map(p => p.handle))).toEqual(new Set(["gestore", "utente-a", null]));
    const voce = lista.find(p => p.handle === "utente-a")!;
    expect(voce._id).toBe(a.profileId);
    expect(voce.status).toBe("active");
    expect(voce.conteggi).toEqual({ eventi: 2, concerti: 3, persone: 1, foto: 0, wishlist: 1, chatPubbliche: 1, chatPrivate: 1, chatOltre: false });
    expect(voce.partenze).toEqual(expect.arrayContaining([{ nome: "Casa", indirizzo: true }, { nome: "Ufficio", indirizzo: false }]));
    expect(voce.sezioniNascoste).toEqual(["sec-mappa"]);
    expect(voce.ultimaAttivita).toEqual(expect.any(Number));
    expect(lista.find(p => p.handle === null)).toMatchObject({ status: "onboarding", ultimaAttivita: null, conteggi: { eventi: 0 } });
  });

  it("il dettaglio: gli stessi campi, il registro (al massimo 50) e i metadati delle chat, senza il titolo di quelle private", async () => {
    const { admin } = await scenario();
    const d = (await admin.as.query(api.admin.profilo, { input: { handle: "Utente-A" } }))!;
    expect(d.handle).toBe("utente-a");
    expect(d.registro.length).toBeGreaterThan(0);
    expect(d.registro.length).toBeLessThanOrEqual(50);
    expect(d.registro[0]).toEqual({ at: expect.any(Number), autore: expect.any(String), via: expect.any(String), op: expect.any(String), riassunto: expect.any(String), annullata: false });
    const privata = d.chat.find(c => c.visibility === "proprietario")!;
    expect(privata).toEqual({ visibility: "proprietario", messaggi: 2, creata: expect.any(Number), aggiornata: expect.any(Number), scade: expect.any(Number) });
    expect(d.chat.find(c => c.visibility === "pubblica")).toMatchObject({ titolo: "Domanda pubblica", autore: "Visitatore", messaggi: 1 });
    expect(await admin.as.query(api.admin.profilo, { input: { handle: "nessuno-qui" } })).toBeNull();
  });

  it("concerti come flatConcerts: sul seed di gabrifila 84 righe e 91 concerti", async () => {
    const t = setup();
    vi.stubEnv("ADMIN_USER_IDS", "u-admin");
    await t.mutation(internal.seed.ensure, {});
    const admin = await conProfilo(t, "u-admin", "gestore");
    const page = (await t.query(api.pages.byHandle, { handle: "gabrifila" })) as PaginaPubblica;
    const voce = (await admin.as.query(api.admin.profili, {})).find(p => p.handle === "gabrifila")!;
    expect(voce.conteggi.eventi).toBe(page.entries.length);
    expect(voce.conteggi.concerti).toBe(flatConcerts(pageToDataset(page).entries).length);
    expect(voce.conteggi.concerti).toBe(91);
  });

  it("nessuna risposta contiene indirizzi, coordinate, email, chiavi, hash, authUserId o il testo delle chat private", async () => {
    const { admin, a, chiave } = await scenario();
    const risposte = [
      await admin.as.query(api.admin.profili, {}),
      await admin.as.query(api.admin.profilo, { input: { handle: "utente-a" } }),
      await admin.as.mutation(api.admin.registraAccesso, { input: { vista: "profilo", handle: "utente-a" } }),
    ];
    // il controllo vede davvero i dati di A
    expect(JSON.stringify(risposte[1])).toContain("Casa");
    for (const r of risposte) expect(sentinelleIn(r, [chiave, a.userId, "u-admin", "u-onb"])).toEqual([]);
  });

  it("un utente normale, un anonimo, un token agente e as: \"oracolo\" ricevono not_found; con ADMIN_USER_IDS vuota anche l'admin", async () => {
    const { t, admin, a } = await scenario();
    const chiaveAdmin = (await admin.as.mutation(api.agents.createApiKey, { input: { nome: "Admin" } })).chiave;
    await nuovoClientOAuth(t, "client-admin");
    const tokenAdmin = await nuovoTokenOAuth(t, "u-admin", "client-admin");
    const codice = async (p: Promise<unknown>) => p.then(() => "ok", e => codiceDi(e) ?? "altro");
    const prove: [string, () => Promise<unknown>][] = [
      ["utente normale", () => a.as.query(api.admin.profili, {})],
      ["anonimo", () => t.query(api.admin.profili, {})],
      ["API key dell'admin", () => t.query(api.admin.profili, { agentToken: chiaveAdmin })],
      ["token OAuth dell'admin", () => t.query(api.admin.profili, { agentToken: tokenAdmin })],
      ["admin come Oracolo", () => admin.as.query(api.admin.profili, { as: "oracolo" })],
      ["utente normale, dettaglio", () => a.as.query(api.admin.profilo, { input: { handle: "utente-a" } })],
      ["utente normale, accesso", () => a.as.mutation(api.admin.registraAccesso, { input: { vista: "elenco" } })],
    ];
    for (const [nome, prova] of prove) expect(await codice(prova()), nome).toBe("not_found");
    expect(await codice(admin.as.query(api.admin.profili, {}))).toBe("ok");
    vi.stubEnv("ADMIN_USER_IDS", "");
    expect(await codice(admin.as.query(api.admin.profili, {}))).toBe("not_found");
    vi.stubEnv("ADMIN_USER_IDS", undefined);
    expect(await codice(admin.as.query(api.admin.profili, {}))).toBe("not_found");
  });

  it("registraAccesso scrive una riga in adminAccessi e niente in activity", async () => {
    const { t, admin, a } = await scenario();
    const attivitaPrima = await t.run(ctx => ctx.db.query("activity").collect());
    await admin.as.mutation(api.admin.registraAccesso, { input: { vista: "elenco" } });
    await admin.as.mutation(api.admin.registraAccesso, { input: { vista: "profilo", handle: "utente-a" } });
    const righe = await t.run(ctx => ctx.db.query("adminAccessi").collect());
    expect(righe.map(r => ({ authUserId: r.authUserId, vista: r.vista, profileId: r.profileId }))).toEqual([
      { authUserId: "u-admin", vista: "elenco", profileId: undefined },
      { authUserId: "u-admin", vista: "profilo", profileId: a.profileId },
    ]);
    expect(await t.run(ctx => ctx.db.query("activity").collect())).toEqual(attivitaPrima);
  });
});
