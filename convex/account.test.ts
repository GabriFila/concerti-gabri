/* #account (T5): export nel formato di import (senza coordinate, ipHmac,
   writeKeyHash, authUserId) ed eliminazione con la cascata di §5.9 su
   OGNI tabella, venue.createdBy compreso. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CANARINO } from "../e2e/helpers/canarino.ts";
import { fileEsportato } from "../shared/schema/dashboard.ts";
import { importJson } from "../shared/schema/importFormat.ts";
import { SESSIONE_RECENTE_MS } from "./account.ts";
import { codiceDi } from "./lib/errors.ts";
import { envLocale } from "./test.auth.ts";
import { conProfilo, sessione, setup, venue, type T } from "./test.setup";

beforeEach(() => {
  envLocale();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const codice = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return codiceDi(e) ?? String((e as Error).message);
  }
};

const EMAIL = "a@example.com";

/** Un utente Better Auth vero (riga `user` del componente) con profilo `active` e una sessione recente. */
async function utente(t: T, handle: string, email: string) {
  const now = Date.now();
  const u = (await t.run(ctx =>
    ctx.runMutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: handle, email, emailVerified: true, createdAt: now, updatedAt: now } } }),
  )) as { _id: string };
  return { ...(await conProfilo(t, u._id, handle)), userId: u._id };
}

/** Una sessione dell'utente nata `fa` ms fa. */
async function sessioneDi(t: T, userId: string, fa = 0) {
  const s = await sessione(t, userId);
  if (fa) {
    await t.run(ctx =>
      ctx.runMutation(components.betterAuth.adapter.updateOne, { input: { model: "session", where: [{ field: "_id", value: s.sessionId }], update: { createdAt: Date.now() - fa } } }),
    );
  }
  return s.as;
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/** Un profilo con dati in ogni tabella di §5.9. */
async function pieno(t: T, user: string, handle: string, email: string) {
  const p = await utente(t, handle, email);
  const as = p.as;
  const fab = await t.run(async ctx => (await ctx.db.query("venues").collect()).find(v => v.name === "Fabrique")?._id) ?? (await venue(t, "Fabrique", "Milano", 9.25, 45.45));
  await as.mutation(api.people.add, { input: { name: "Lu" } });
  await as.mutation(api.people.add, { input: { name: "Marco R." } });
  const { id: casa } = await as.mutation(api.departures.add, { input: { name: "Casa" } });
  const { id: vecchia } = await as.mutation(api.departures.add, { input: { name: "Vecchia casa" } });
  const { id: altra } = await as.mutation(api.departures.add, { input: { name: "Altra" } });
  // indirizzi: Casa e Vecchia casa confermati, Altra con candidati in sospeso
  for (const d of [casa, vecchia]) {
    await t.mutation(internal.departures.saveDraft, { profileId: p.profileId, departureId: d as Id<"departures">, candidates: [{ label: CANARINO.displayName, lng: CANARINO.lng, lat: CANARINO.lat }] });
    await as.mutation(api.departures.confirmAddress, { input: { departureId: d, indice: 0 } });
  }
  await t.mutation(internal.departures.saveDraft, { profileId: p.profileId, departureId: altra as Id<"departures">, candidates: [{ label: "x", lng: 9, lat: 45 }] });
  // una coppia km rimasta da una partenza cancellata (le coppie restano per sempre)
  const { id: daTogliere } = await as.mutation(api.entries.add, { input: { kind: "concert", date: "01/02/2025", artist: "Via", venue: "Fabrique", city: "Milano", from: "Vecchia casa" } });
  await as.mutation(api.entries.remove, { input: { id: daTogliere, confirm: true } });
  await as.mutation(api.departures.remove, { input: { id: vecchia, confirm: true } });
  const { id: amici } = await as.mutation(api.gifters.add, { input: { label: "Amici", url: "https://amici.example" } });
  const logo = await t.run(async ctx => await ctx.storage.store(new Blob([PNG], { type: "image/png" })));
  await as.action(api.gifters.setLogo, { input: { id: amici, storageId: logo } });
  await as.mutation(api.entries.add, {
    input: { kind: "concert", date: "24/07/2025", artist: "Caparezza", venue: "Fabrique", city: "Milano", with: ["Lu"], voto: 5, vicinanza: 6, canzoniNote: 4, cost: 60.5, gift: true, giftFrom: "Amici", from: "Casa", comments: "Serata enorme" },
  });
  await as.mutation(api.entries.add, {
    input: { kind: "festival", name: "MI AMI", date: "21–24/05/2025", venue: "Fabrique", city: "Milano", cost: "na", from: "Casa", concerts: [{ artist: "Rares", with: ["Marco R."], date: "22/05/2025", voto: 4 }, { artist: "Patagarri", with: [] }] },
  });
  await as.mutation(api.wishlist.set, { input: { artists: ["Bon Iver", "Mitski"] } });
  await as.mutation(api.profiles.update, { input: { handle: `${handle}-nuovo` } }); // il vecchio handle diventa un alias
  await t.run(async ctx => {
    await ctx.db.insert("chatThreads", { profileId: p.profileId, threadId: `t-${user}-1`, visibility: "pubblica", title: "Domanda", author: "Ospite", writeKeyHash: "HASHSEGRETO", ipHmac: "IPSEGRETO", messages: [{ role: "user", content: "quanti concerti?" }], updatedAt: Date.now(), expiresAt: Date.now() + 1e9 });
    await ctx.db.insert("chatThreads", { profileId: p.profileId, threadId: `t-${user}-2`, visibility: "proprietario", title: "Scrittura", messages: [], updatedAt: Date.now(), expiresAt: Date.now() + 1e9 });
    await ctx.db.insert("devOtpOutbox", { email, otp: "123456", type: "sign-in", createdAt: Date.now() });
    await ctx.db.insert("venues", { name: "Locale nuovo", city: "Milano", nameKey: "locale nuovo", cityKey: "milano", lng: 9.2, lat: 45.5, source: "osm", osm: `N${user.length}9`, createdBy: p.profileId });
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return { ...p, as, logo, fab, handle: `${handle}-nuovo` };
}

/** Quanti documenti di ogni tabella appartengono al profilo (per le venue: createdBy). */
async function conteggi(t: T, profileId: Id<"profiles">) {
  return await t.run(async ctx => {
    const out: Record<string, number> = {};
    const tabelle = ["profiles", "handleAliases", "entries", "people", "gifters", "wishlist", "departures", "departureSecrets", "geocodeDrafts", "kmPairs", "activity", "chatThreads"] as const;
    for (const tab of tabelle) {
      out[tab] = (await ctx.db.query(tab).collect()).filter(d => (tab === "profiles" ? d._id : (d as { profileId?: string }).profileId) === profileId).length;
    }
    out.venuesCreatedBy = (await ctx.db.query("venues").collect()).filter(v => v.createdBy === profileId).length;
    return out;
  });
}

describe("account.esporta", () => {
  it("concerti nel formato di import, indirizzi come testo; mai coordinate, ipHmac, writeKeyHash o authUserId", async () => {
    const t = setup();
    const a = await pieno(t, "u-a", "utente-a", EMAIL);
    const exp = await a.as.query(api.account.esporta, {});
    expect(exp.formato).toBe("concerti-gabri/export");
    expect(importJson.safeParse(exp.concerti).success).toBe(true);
    expect(exp.concerti).toEqual([
      { kind: "festival", name: "MI AMI", date: "21–24/05/2025", venue: "Fabrique", city: "Milano", cost: "na", from: "Casa", concerts: [{ artist: "Rares", with: ["Marco R."], date: "22/05/2025", voto: 4 }, { artist: "Patagarri", with: [] }] },
      { kind: "concert", date: "24/07/2025", venue: "Fabrique", city: "Milano", cost: 60.5, gift: true, giftFrom: "Amici", from: "Casa", comments: "Serata enorme", artist: "Caparezza", with: ["Lu"], voto: 5, vicinanza: 6, canzoniNote: 4 },
    ]);
    expect(exp.persone).toEqual(["Lu", "Marco R."]);
    expect(exp.partenze).toEqual([{ name: "Casa", indirizzo: CANARINO.displayName }, { name: "Altra" }]);
    expect(exp.regali).toEqual([{ label: "Amici", url: "https://amici.example", logoUrl: expect.stringMatching(/^https:/) }]);
    expect(exp.wishlist).toEqual(["Bon Iver", "Mitski"]);
    expect(exp.profilo.handle).toBe("utente-a-nuovo");
    expect(exp.conversazioni.map(c => c.threadId).sort()).toEqual(["t-u-a-1", "t-u-a-2"]);
    const s = JSON.stringify(exp);
    for (const vietato of ["HASHSEGRETO", "IPSEGRETO", "writeKeyHash", "ipHmac", "authUserId", a.userId, "lng", "lat\"", String(CANARINO.lat).slice(0, 7), String(CANARINO.lng).slice(0, 6), "kmPending"]) {
      expect(s, vietato).not.toContain(vietato);
    }
  });

  it("si reimporta così com'è: aggiunto a un altro profilo dà gli stessi concerti", async () => {
    const t = setup();
    const a = await pieno(t, "u-a", "utente-a", EMAIL);
    const exp = await a.as.query(api.account.esporta, {});
    // il file scaricato, intero, passa dallo schema dell'import (fileEsportato → importJson)
    const file = fileEsportato.safeParse(JSON.parse(JSON.stringify(exp)));
    expect(file.success, file.error?.message).toBe(true);
    expect(file.data?.concerti).toHaveLength(exp.concerti.length);
    const b = await conProfilo(t, "u-b", "utente-b");
    for (const name of exp.persone) await b.as.mutation(api.people.add, { input: { name } });
    for (const d of exp.partenze) await b.as.mutation(api.departures.add, { input: { name: d.name } });
    for (const g of exp.regali) await b.as.mutation(api.gifters.add, { input: { label: g.label, url: g.url } });
    for (const e of exp.concerti) await b.as.mutation(api.entries.add, { input: e });
    const senzaIdNeKm = (l: Record<string, unknown>[]) => l.map(({ id, km, kmPending, daCompletare, ...r }) => (void id, void km, void kmPending, void daCompletare, r));
    expect(senzaIdNeKm((await b.as.query(api.entries.list, {})).concerts)).toEqual(senzaIdNeKm((await a.as.query(api.entries.list, {})).concerts));
  });

  it("solo dalla dashboard", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    expect(await codice(a.as.query(api.account.esporta, { as: "oracolo" }))).toBe("solo_dashboard");
    expect(await codice(a.as.query(api.account.esporta, { agentToken: "cgk_x" }))).toBe("unauthorized");
  });
});

describe("account.elimina", () => {
  it("la cascata svuota ogni tabella di §5.9 e toglie createdBy dalle venue; l'altro profilo resta intatto", async () => {
    const t = setup();
    const a = await pieno(t, "u-a", "utente-a", EMAIL);
    const b = await pieno(t, "u-b", "utente-b", "b@example.com");
    const primaA = await conteggi(t, a.profileId);
    for (const [tab, n] of Object.entries(primaA)) expect(n, `prima: ${tab}`).toBeGreaterThan(0);
    const primaB = await conteggi(t, b.profileId);
    expect(await a.as.mutation(api.account.elimina, { input: { conferma: a.handle } })).toEqual({ ok: true });
    // subito: la pagina non c'è più (né col vecchio handle)
    expect(await t.query(api.pages.byHandle, { handle: a.handle })).toBeNull();
    expect(await t.query(api.pages.byHandle, { handle: "utente-a" })).toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const dopo = await conteggi(t, a.profileId);
    for (const [tab, n] of Object.entries(dopo)) expect(n, `dopo: ${tab}`).toBe(0);
    // i file dei loghi, gli OTP dell'email
    expect(await t.run(async ctx => await ctx.db.system.get(a.logo))).toBeNull();
    expect(await t.run(async ctx => (await ctx.db.query("devOtpOutbox").collect()).map(o => o.email))).toEqual(["b@example.com"]);
    // le venue restano nel catalogo
    expect(await t.run(async ctx => (await ctx.db.query("venues").collect()).filter(v => v.name === "Locale nuovo").length)).toBe(2);
    // B intatta
    expect(await conteggi(t, b.profileId)).toEqual(primaB);
    expect(await t.run(async ctx => await ctx.db.system.get(b.logo))).not.toBeNull();
    // l'handle di prima torna libero, e A non ha più né un profilo né una sessione (Better Auth)
    expect(await t.query(api.profiles.handleAvailable, { handle: "utente-a" })).toEqual({ disponibile: true });
    expect(await codice(a.as.query(api.profiles.get, {}))).toBe("unauthorized");
  });

  it("la cascata va a lotti (molti documenti)", async () => {
    const t = setup();
    const a = await utente(t, "utente-a", EMAIL);
    const as = a.as;
    await t.run(async ctx => {
      for (let i = 0; i < 450; i++) await ctx.db.insert("activity", { profileId: a.profileId, at: i, actor: { via: "dashboard", label: "Dashboard" }, op: "create", table: "people", docId: `x${i}`, summary: "x" });
    });
    await as.mutation(api.account.elimina, { input: { conferma: "utente-a" } });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await conteggi(t, a.profileId)).activity).toBe(0);
  });

  it("serve l'handle esatto e una sessione recente; mai da un agente o dall'Oracolo", async () => {
    const t = setup();
    const a = await utente(t, "utente-a", EMAIL);
    const b = await utente(t, "utente-b", "b@example.com");
    const recente = a.as;
    const vecchia = await sessioneDi(t, a.userId, SESSIONE_RECENTE_MS + 1000);
    const senza = t.withIdentity({ subject: a.userId, sessionId: "s" });
    expect(await codice(recente.mutation(api.account.elimina, { input: { conferma: "utente-b" } }))).toBe("input_non_valido");
    try {
      await vecchia.mutation(api.account.elimina, { input: { conferma: "utente-a" } });
      throw new Error("doveva fallire");
    } catch (e) {
      expect((e as { data: unknown }).data).toMatchObject({ code: "unauthorized", sessioneRecente: false, fix: expect.stringContaining("/accedi?next=") });
    }
    expect(await codice(senza.mutation(api.account.elimina, { input: { conferma: "utente-a" } }))).toBe("unauthorized");
    expect(await codice(recente.mutation(api.account.elimina, { as: "oracolo", input: { conferma: "utente-a" } }))).toBe("solo_dashboard");
    // B che scrive l'handle di A non cancella nulla
    const bRecente = b.as;
    expect(await codice(bRecente.mutation(api.account.elimina, { input: { conferma: "utente-a" } }))).toBe("input_non_valido");
    expect(await conteggi(t, a.profileId)).toMatchObject({ profiles: 1 });
    expect(await conteggi(t, b.profileId)).toMatchObject({ profiles: 1 });
  });

  it("eliminaDatiUtente (trigger onDelete di Better Auth) cancella i dati dell'utente sparito", async () => {
    const t = setup();
    const a = await pieno(t, "u-a", "utente-a", EMAIL);
    expect(await t.mutation(internal.account.eliminaDatiUtente, { authUserId: a.userId, email: EMAIL })).toBe(true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    for (const [tab, n] of Object.entries(await conteggi(t, a.profileId))) expect(n, tab).toBe(0);
    expect(await t.mutation(internal.account.eliminaDatiUtente, { authUserId: "nessuno" })).toBe(false);
  });
});

describe("account.dettagli (#account)", () => {
  it("l'email della sessione e i vecchi handle; niente id d'utente; solo dalla dashboard", async () => {
    const t = setup();
    const a = await utente(t, "utente-a", EMAIL);
    const as = a.as;
    expect(await as.query(api.account.dettagli, {})).toEqual({ email: EMAIL, alias: [] });
    await as.mutation(api.profiles.update, { input: { handle: "utente-a-due" } });
    await as.mutation(api.profiles.update, { input: { handle: "utente-a-tre" } });
    const d = await as.query(api.account.dettagli, {});
    expect(d).toEqual({ email: EMAIL, alias: ["utente-a", "utente-a-due"] });
    expect(JSON.stringify(d)).not.toContain(a.userId);
    // una sessione senza la riga `user`: niente email
    const senzaUtente = await conProfilo(t, "u-b", "utente-b");
    expect(await senzaUtente.as.query(api.account.dettagli, {})).toEqual({ email: null, alias: [] });
    expect(await codice(as.query(api.account.dettagli, { as: "oracolo" }))).toBe("solo_dashboard");
    expect(await codice(t.query(api.account.dettagli, {}))).toBe("unauthorized");
  });
});

describe("account.invecchiaSessionePerTest (e2e/account.spec)", () => {
  it("rifiuta sul deployment di produzione", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://brave-chickadee-534.eu-west-1.convex.cloud");
    vi.stubEnv("AUTH_DEV_OTP", "1");
    try {
      await expect(setup().mutation(internal.account.invecchiaSessionePerTest, { email: EMAIL })).rejects.toThrow(/produzione/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("account.creaPartenzaPerTest (e2e senza sessione)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("solo profili di prova e2e-*, idempotente; mai in produzione", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
    vi.stubEnv("AUTH_DEV_OTP", "1");
    const t = setup();
    await conProfilo(t, "u-a", "utente-a");
    await conProfilo(t, "u-e", "e2e-prova");
    const id = await t.mutation(internal.account.creaPartenzaPerTest, { handle: "e2e-prova", name: "Casa" });
    expect(await t.mutation(internal.account.creaPartenzaPerTest, { handle: "e2e-prova", name: "Casa" })).toBe(id);
    await expect(t.mutation(internal.account.creaPartenzaPerTest, { handle: "utente-a", name: "Casa" })).rejects.toThrow(/e2e-/);
    vi.stubEnv("CONVEX_CLOUD_URL", "https://brave-chickadee-534.eu-west-1.convex.cloud");
    await expect(t.mutation(internal.account.creaPartenzaPerTest, { handle: "e2e-prova", name: "Altra" })).rejects.toThrow(/produzione/);
  });
});

describe("cascata: la parte di Better Auth (§5.9)", () => {
  type Modello = "user" | "session" | "account" | "verification" | "apikey" | "oauthAccessToken" | "oauthConsent" | "oauthApplication";

  /** Quante righe del componente appartengono all'utente, tabella per tabella. */
  async function righeAuth(t: T, userId: string, email: string) {
    return await t.run(async ctx => {
      const conta = async (model: Modello, field: string, value: string) =>
        ((await ctx.runQuery(components.betterAuth.adapter.findMany, { model, where: [{ field, value }], paginationOpts: { cursor: null, numItems: 100 } })) as { page: unknown[] }).page.length;
      return {
        user: await conta("user", "email", email),
        session: await conta("session", "userId", userId),
        account: await conta("account", "userId", userId),
        verification: await conta("verification", "identifier", `sign-in-otp-${email}`),
        apikey: await conta("apikey", "referenceId", userId),
        oauthAccessToken: await conta("oauthAccessToken", "userId", userId),
        oauthConsent: await conta("oauthConsent", "userId", userId),
        oauthApplication: await conta("oauthApplication", "userId", userId),
      };
    });
  }

  /** Una riga in ogni tabella di Better Auth che §5.9 cancella (oltre a user e session). */
  async function riempiAuth(t: T, userId: string, email: string) {
    const now = Date.now();
    const crea = (model: Modello, data: Record<string, unknown>) =>
      t.run(ctx => ctx.runMutation(components.betterAuth.adapter.create, { input: { model, data } as never }));
    await crea("account", { accountId: `g-${userId}`, providerId: "google", userId, createdAt: now, updatedAt: now });
    await crea("verification", { identifier: `sign-in-otp-${email}`, value: "hash", expiresAt: now + 600_000, createdAt: now, updatedAt: now });
    await crea("apikey", { configId: "default", referenceId: userId, key: `hash-${userId}`, prefix: "cgk_", enabled: true, createdAt: now, updatedAt: now });
    await crea("oauthApplication", { clientId: `c-${userId}`, name: "Claude", userId, createdAt: now, updatedAt: now });
    await crea("oauthAccessToken", { accessToken: `at-${userId}`, refreshToken: `rt-${userId}`, clientId: `c-${userId}`, userId, createdAt: now, updatedAt: now });
    await crea("oauthConsent", { clientId: `c-${userId}`, userId, consentGiven: true, createdAt: now, updatedAt: now });
  }

  it("account.elimina cancella utente, sessioni, account, verifiche, API key, token, consensi e client OAuth; l'altro utente resta", async () => {
    const t = setup();
    const a = await utente(t, "utente-a", EMAIL);
    const b = await utente(t, "utente-b", "b@example.com");
    await sessione(t, a.userId); // una seconda sessione aperta (un altro dispositivo)
    await riempiAuth(t, a.userId, EMAIL);
    await riempiAuth(t, b.userId, "b@example.com");
    for (const [tab, n] of Object.entries(await righeAuth(t, a.userId, EMAIL))) expect(n, `prima: ${tab}`).toBeGreaterThan(0);
    const primaB = await righeAuth(t, b.userId, "b@example.com");

    expect(await a.as.mutation(api.account.elimina, { input: { conferma: "utente-a" } })).toEqual({ ok: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    for (const [tab, n] of Object.entries(await righeAuth(t, a.userId, EMAIL))) expect(n, `dopo: ${tab}`).toBe(0);
    expect(await righeAuth(t, b.userId, "b@example.com")).toEqual(primaB);
    // la vecchia sessione non vale più: niente profilo, niente scritture
    expect(await a.as.query(api.me.profile, {})).toBeNull();
    expect(await codice(a.as.mutation(api.people.add, { input: { name: "Lu" } }))).toBe("unauthorized");
    expect(await b.as.query(api.me.profile, {})).toMatchObject({ handle: "utente-b" });
  });

  it("con una sessione non recente non cancella niente, nemmeno in Better Auth", async () => {
    const t = setup();
    const a = await utente(t, "utente-a", EMAIL);
    await riempiAuth(t, a.userId, EMAIL);
    const prima = await righeAuth(t, a.userId, EMAIL);
    const vecchia = await sessioneDi(t, a.userId, SESSIONE_RECENTE_MS + 1000);
    expect(await codice(vecchia.mutation(api.account.elimina, { input: { conferma: "utente-a" } }))).toBe("unauthorized");
    expect(await righeAuth(t, a.userId, EMAIL)).toEqual({ ...prima, session: prima.session + 1 });
    expect(await conteggi(t, a.profileId)).toMatchObject({ profiles: 1 });
  });

  it("invecchiaSessionePerTest (e2e) rende non recenti le sessioni dell'email", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
    vi.stubEnv("AUTH_DEV_OTP", "1");
    const t = setup();
    const a = await utente(t, "utente-a", EMAIL);
    expect(await t.mutation(internal.account.invecchiaSessionePerTest, { email: EMAIL })).toBe(true);
    expect(await t.mutation(internal.account.invecchiaSessionePerTest, { email: "nessuno@example.com" })).toBe(false);
    try {
      await a.as.mutation(api.account.elimina, { input: { conferma: "utente-a" } });
      throw new Error("doveva fallire");
    } catch (e) {
      expect((e as { data: unknown }).data).toMatchObject({ code: "unauthorized", sessioneRecente: false });
    }
  });
});
