/* Lo storico dell'Oracolo su Convex (PIANO traguardo 6, Accettazione):
   httpAction col segreto, limiti con rollback e riserva per gabrifila,
   chiave di scrittura (anche rivendicata sui thread legacy), thread legati
   alla loro pagina, query pubbliche senza hash, IP né thread privati, TTL,
   e le funzioni degli indirizzi chiuse all'Oracolo. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CHAT_TTL_MS } from "../shared/chat/thread.ts";
import { codiceDi } from "./lib/errors.ts";
import { CHAT_PAGE_DAY_GABRIFILA, rateLimiter } from "./rateLimits.ts";
import { chiaveScrittura } from "./chat.ts";
import { conProfilo, setup, type T } from "./test.setup";

const SEGRETO = "segreto-di-prova-0123456789abcdef";
const IP_A = "a".repeat(64);
const IP_B = "b".repeat(64);
const CHIAVE_1 = "1".repeat(64);
const CHIAVE_2 = "2".repeat(64);
const DAY = 86_400_000;

beforeEach(() => vi.stubEnv("CHAT_SERVER_SECRET", SEGRETO));
afterEach(() => vi.unstubAllEnvs());

type Corpo = { code?: string; messaggio?: string; ok?: boolean; nuovo?: boolean; messages?: unknown[] };

async function post(t: T, path: "turno" | "trascrizione", body: unknown, auth: string | null = `Bearer ${SEGRETO}`) {
  const res = await t.fetch(`/oracolo/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth === null ? {} : { authorization: auth }) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const testo = await res.text();
  return { status: res.status, testo, corpo: JSON.parse(testo) as Corpo };
}

const turno = (t: T, a: { handle: string; threadId: string; writeKeyHash?: string; ipHmac?: string; visibility?: string }) =>
  post(t, "turno", { visibility: "pubblica", ipHmac: IP_A, ...a });

const trascrizione = (t: T, a: { handle: string; threadId: string; writeKeyHash?: string; ipHmac?: string; visibility?: string; author?: string; messages?: unknown[] }) =>
  post(t, "trascrizione", {
    visibility: "pubblica",
    ipHmac: IP_A,
    messages: [{ role: "user", content: "Quanti concerti nel 2025?" }, { role: "assistant", content: "Sedici." }],
    ...a,
  });

const thread = (t: T, threadId: string) =>
  t.run(ctx => ctx.db.query("chatThreads").withIndex("by_threadId", q => q.eq("threadId", threadId)).first());

/** Inserisce un thread a mano (legacy, scaduto, privato…). */
const inserisci = (t: T, profileId: Id<"profiles">, threadId: string, extra: Record<string, unknown> = {}) =>
  t.run(ctx =>
    ctx.db.insert("chatThreads", {
      profileId, threadId, visibility: "pubblica", title: "Chat", messages: [{ role: "user", content: "ciao" }],
      updatedAt: Date.now(), expiresAt: Date.now() + CHAT_TTL_MS, ...extra,
    } as never),
  );

/** Quanti token restano a un limite (senza consumarne). */
const resta = (t: T, name: "chatIpMinute" | "chatIpDay" | "chatGlobalDay" | "chatOtherPagesDay" | "chatPageDay", key?: string) =>
  t.run(async ctx => (await rateLimiter.getValue(ctx, name, key ? { key } : {})).value);

describe("httpAction /oracolo/*", () => {
  it("Authorization sbagliata o assente → 401, e il segreto non compare mai nelle risposte", async () => {
    const t = setup();
    await conProfilo(t, "u-a", "pagina-a");
    const body = { handle: "pagina-a", threadId: "thread-000001", visibility: "pubblica", ipHmac: IP_A };
    for (const path of ["turno", "trascrizione"] as const) {
      for (const auth of [null, "Bearer sbagliato-ma-lungo-abbastanza", `Bearer ${SEGRETO}x`, SEGRETO, `bearer ${SEGRETO}`]) {
        const r = await post(t, path, body, auth);
        expect(r.status, `${path} ${auth}`).toBe(401);
        expect(r.corpo.code).toBe("unauthorized");
        expect(r.testo).not.toContain(SEGRETO);
        expect(r.testo).not.toContain("sbagliato");
      }
    }
    // col segreto giusto ma un corpo storto: 400, senza ripetere nulla
    for (const storto of ["{non json", { handle: "pagina-a", threadId: "x", visibility: "pubblica", ipHmac: SEGRETO }]) {
      const r = await post(t, "turno", storto);
      expect(r.status).toBe(400);
      expect(r.corpo).toEqual({ code: "input_non_valido", messaggio: "richiesta non valida" });
      expect(r.testo).not.toContain(SEGRETO);
    }
  });

  it("senza CHAT_SERVER_SECRET (o troppo corto) nessuno passa", async () => {
    const t = setup();
    await conProfilo(t, "u-a", "pagina-a");
    vi.stubEnv("CHAT_SERVER_SECRET", "");
    expect((await turno(t, { handle: "pagina-a", threadId: "thread-000001" })).status).toBe(401);
    vi.stubEnv("CHAT_SERVER_SECRET", "corto");
    expect((await post(t, "turno", { handle: "pagina-a", threadId: "thread-000001", visibility: "pubblica", ipHmac: IP_A }, "Bearer corto")).status).toBe(401);
  });

  it("pagina inesistente o non attiva → 404", async () => {
    const t = setup();
    await conProfilo(t, "u-o", "in-onboarding", { status: "onboarding" });
    expect((await turno(t, { handle: "nessuno", threadId: "thread-000001" })).status).toBe(404);
    expect((await turno(t, { handle: "in-onboarding", threadId: "thread-000001" })).status).toBe(404);
  });
});

describe("limiti d'uso (PIANO §5.8)", () => {
  it("8 turni al minuto per IP, poi 429; un altro IP passa ancora", async () => {
    const t = setup();
    await conProfilo(t, "u-a", "pagina-a");
    for (let i = 0; i < 8; i++) expect((await turno(t, { handle: "pagina-a", threadId: `thread-00000${i}` })).status).toBe(200);
    const nono = await turno(t, { handle: "pagina-a", threadId: "thread-000009" });
    expect(nono.status).toBe(429);
    expect(nono.corpo.code).toBe("limite_superato");
    expect(nono.corpo.messaggio).toMatch(/Troppi/);
    expect((await turno(t, { handle: "pagina-a", threadId: "thread-000010", ipHmac: IP_B })).status).toBe(200);
  });

  it("rollback: un limite che rifiuta non lascia consumati gli altri", async () => {
    const t = setup();
    await conProfilo(t, "u-a", "pagina-a");
    // il globale è finito: il turno rifiuta e l'IP non perde il suo token
    await t.run(ctx => rateLimiter.limit(ctx, "chatGlobalDay", { count: 200 }));
    const r = await turno(t, { handle: "pagina-a", threadId: "thread-000001" });
    expect(r.status).toBe(429);
    expect(r.corpo.messaggio).toMatch(/Limite giornaliero della chat/);
    expect(await resta(t, "chatIpMinute", IP_A)).toBeGreaterThan(7.5);
    expect(await resta(t, "chatIpDay", IP_A)).toBe(40);
    expect(await resta(t, "chatOtherPagesDay")).toBe(120);
  });

  it("rollback: un turno rifiutato (chiave sbagliata, altra pagina) non consuma niente", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "pagina-a");
    await conProfilo(t, "u-b", "pagina-b");
    await inserisci(t, a.profileId, "thread-di-a", { writeKeyHash: CHIAVE_1 });
    for (let i = 0; i < 10; i++) {
      expect((await turno(t, { handle: "pagina-a", threadId: "thread-di-a", writeKeyHash: CHIAVE_2 })).status).toBe(403);
      expect((await turno(t, { handle: "pagina-b", threadId: "thread-di-a", writeKeyHash: CHIAVE_1 })).status).toBe(403);
    }
    expect(await resta(t, "chatIpDay", IP_A)).toBe(40);
    expect(await resta(t, "chatGlobalDay")).toBe(200);
    expect((await turno(t, { handle: "pagina-a", threadId: "thread-di-a", writeKeyHash: CHIAVE_1 })).status).toBe(200);
    expect(await resta(t, "chatIpDay", IP_A)).toBe(39);
  });

  it("riserva per gabrifila: le altre pagine si fermano a 120 al giorno in tutto, gabrifila no", async () => {
    const t = setup();
    await conProfilo(t, "u-a", "pagina-a");
    await conProfilo(t, "u-g", "gabrifila");
    await t.run(ctx => rateLimiter.limit(ctx, "chatOtherPagesDay", { count: 120 }));
    const altra = await turno(t, { handle: "pagina-a", threadId: "thread-000001" });
    expect(altra.status).toBe(429);
    expect(altra.corpo.messaggio).toMatch(/di questa pagina/);
    expect((await turno(t, { handle: "gabrifila", threadId: "thread-000002" })).status).toBe(200);
  });

  it("40 turni al giorno per IP, poi 429 \"tuoi messaggi\"; un altro IP passa ancora", async () => {
    const t = setup();
    await conProfilo(t, "u-a", "pagina-a");
    // 39 già consumati oggi da IP_A
    await t.run(ctx => rateLimiter.limit(ctx, "chatIpDay", { key: IP_A, count: 39 }));
    expect((await turno(t, { handle: "pagina-a", threadId: "thread-000040" })).status).toBe(200);
    const oltre = await turno(t, { handle: "pagina-a", threadId: "thread-000041" });
    expect(oltre.status).toBe(429);
    expect(oltre.corpo.code).toBe("limite_superato");
    expect(oltre.corpo.messaggio).toMatch(/tuoi messaggi/);
    // il rifiuto non consuma la pagina né il globale
    expect(await resta(t, "chatGlobalDay")).toBe(199);
    expect((await turno(t, { handle: "pagina-a", threadId: "thread-000042", ipHmac: IP_B })).status).toBe(200);
  });

  it("l'Oracolo in scrittura non pesca dai limiti dei visitatori: pagina, pagine e globale esauriti, il proprietario scrive", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "pagina-a");
    await t.run(async ctx => {
      await rateLimiter.limit(ctx, "chatPageDay", { key: a.profileId, count: 60 });
      await rateLimiter.limit(ctx, "chatOtherPagesDay", { count: 120 });
      await rateLimiter.limit(ctx, "chatGlobalDay", { count: 200 });
      await rateLimiter.limit(ctx, "chatIpDay", { key: IP_B, count: 40 });
    });
    expect((await turno(t, { handle: "pagina-a", threadId: "pubblico-001", ipHmac: IP_B })).status).toBe(429);
    const scrive = await turno(t, { handle: "pagina-a", threadId: "privato-0001", visibility: "proprietario", ipHmac: IP_B });
    expect(scrive.status).toBe(200);

    // e i turni del proprietario non tolgono niente ai visitatori
    const t2 = setup();
    await conProfilo(t2, "u-a", "pagina-a");
    expect((await turno(t2, { handle: "pagina-a", threadId: "privato-0001", visibility: "proprietario" })).status).toBe(200);
    expect(await resta(t2, "chatGlobalDay")).toBe(200);
    expect(await resta(t2, "chatOtherPagesDay")).toBe(120);
    expect(await resta(t2, "chatIpDay", IP_A)).toBe(40);
  });

  it("l'Oracolo in scrittura ha un suo tetto al giorno (60, gabrifila 120), separato da quello dei visitatori, e il limite al minuto", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "pagina-a");
    const g = await conProfilo(t, "u-g", "gabrifila");
    const config = { ...rateLimiter.limits!.chatPageDay, rate: CHAT_PAGE_DAY_GABRIFILA };
    await t.run(async ctx => {
      await rateLimiter.limit(ctx, "chatPageDay", { key: chiaveScrittura(a.profileId), count: 60 });
      await rateLimiter.limit<string>(ctx, "chatPageDay", { key: chiaveScrittura(g.profileId), count: 119, config });
    });
    const finito = await turno(t, { handle: "pagina-a", threadId: "privato-0001", visibility: "proprietario" });
    expect(finito.status).toBe(429);
    expect(finito.corpo.messaggio).toMatch(/Tour manager/);
    // i visitatori della stessa pagina non ne risentono
    expect((await turno(t, { handle: "pagina-a", threadId: "pubblico-001", ipHmac: IP_B })).status).toBe(200);
    expect((await turno(t, { handle: "gabrifila", threadId: "privato-0002", visibility: "proprietario", ipHmac: IP_B })).status).toBe(200);
    expect((await turno(t, { handle: "gabrifila", threadId: "privato-0003", visibility: "proprietario", ipHmac: IP_B })).status).toBe(429);
    // il limite al minuto vale anche per il proprietario (2 turni di IP_B già passati, il rifiuto non conta)
    for (let i = 0; i < 6; i++) expect((await turno(t, { handle: "pagina-a", threadId: `pubblico-01${i}`, ipHmac: IP_B })).status).toBe(200);
    const rapido = await turno(t, { handle: "pagina-a", threadId: "privato-0001", visibility: "proprietario", ipHmac: IP_B });
    expect(rapido.status).toBe(429);
    expect(rapido.corpo.messaggio).toMatch(/Troppi/);
  });

  it("per pagina: 60 al giorno, gabrifila 120", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "pagina-a");
    const g = await conProfilo(t, "u-g", "gabrifila");
    const config = { ...rateLimiter.limits!.chatPageDay, rate: CHAT_PAGE_DAY_GABRIFILA };
    await t.run(async ctx => {
      await rateLimiter.limit(ctx, "chatPageDay", { key: a.profileId, count: 60 });
      await rateLimiter.limit<string>(ctx, "chatPageDay", { key: g.profileId, count: 119, config });
    });
    expect((await turno(t, { handle: "pagina-a", threadId: "thread-000001" })).status).toBe(429);
    expect((await turno(t, { handle: "gabrifila", threadId: "thread-000002" })).status).toBe(200);
    expect((await turno(t, { handle: "gabrifila", threadId: "thread-000003", ipHmac: IP_B })).status).toBe(429);
  });
});

describe("chiave di scrittura e pagina del thread", () => {
  it("chiave sbagliata → 403 \"appartiene\", e la trascrizione non cambia", async () => {
    const t = setup();
    await conProfilo(t, "u-a", "pagina-a");
    const nuovo = await turno(t, { handle: "pagina-a", threadId: "thread-000001", writeKeyHash: CHIAVE_1 });
    expect(nuovo.corpo).toEqual({ ok: true, nuovo: true, messages: [] });
    expect((await trascrizione(t, { handle: "pagina-a", threadId: "thread-000001", writeKeyHash: CHIAVE_1, author: "Lu" })).status).toBe(200);
    expect((await thread(t, "thread-000001"))?.writeKeyHash).toBe(CHIAVE_1);

    for (const chiave of [CHIAVE_2, undefined]) {
      const r = await turno(t, { handle: "pagina-a", threadId: "thread-000001", writeKeyHash: chiave });
      expect(r.status).toBe(403);
      expect(r.corpo.messaggio).toMatch(/appartiene/);
      const s = await trascrizione(t, { handle: "pagina-a", threadId: "thread-000001", writeKeyHash: chiave, messages: [{ role: "user", content: "riscritta" }] });
      expect(s.status).toBe(403);
    }
    const dopo = await thread(t, "thread-000001");
    expect(dopo?.messages).toHaveLength(2);
    expect(dopo?.title).toBe("Quanti concerti nel 2025?");
    expect(dopo?.author).toBe("Lu");
    // con la chiave giusta si continua, e il turno riporta la conversazione salvata (l'unica che torna al modello)
    expect((await turno(t, { handle: "pagina-a", threadId: "thread-000001", writeKeyHash: CHIAVE_1 })).corpo).toEqual({
      ok: true, nuovo: false, messages: [{ role: "user", content: "Quanti concerti nel 2025?" }, { role: "assistant", content: "Sedici." }],
    });
    // chi è rifiutato non la riceve
    expect((await turno(t, { handle: "pagina-a", threadId: "thread-000001", writeKeyHash: CHIAVE_2 })).corpo.messages).toBeUndefined();
  });

  it("un thread scaduto (prima del cron) riparte senza la conversazione vecchia", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "pagina-a");
    await inserisci(t, a.profileId, "scaduto-0001", { updatedAt: Date.now() - 91 * DAY, expiresAt: Date.now() - DAY });
    expect((await turno(t, { handle: "pagina-a", threadId: "scaduto-0001" })).corpo).toEqual({ ok: true, nuovo: false, messages: [] });
  });

  it("un thread legacy senza chiave lo rivendica il primo turno con chiave", async () => {
    const t = setup();
    const g = await conProfilo(t, "u-g", "gabrifila");
    await inserisci(t, g.profileId, "legacy-thread-1");
    // senza chiave si continua, e resta senza chiave
    expect((await turno(t, { handle: "gabrifila", threadId: "legacy-thread-1" })).status).toBe(200);
    expect((await thread(t, "legacy-thread-1"))?.writeKeyHash).toBeUndefined();
    // il primo turno con una chiave lo rivendica
    expect((await turno(t, { handle: "gabrifila", threadId: "legacy-thread-1", writeKeyHash: CHIAVE_1 })).status).toBe(200);
    expect((await thread(t, "legacy-thread-1"))?.writeKeyHash).toBe(CHIAVE_1);
    // da lì in poi vale solo quella
    expect((await turno(t, { handle: "gabrifila", threadId: "legacy-thread-1", writeKeyHash: CHIAVE_2 })).status).toBe(403);
    expect((await turno(t, { handle: "gabrifila", threadId: "legacy-thread-1" })).status).toBe(403);
  });

  it("un threadId di /a continuato con l'handle b viene rifiutato", async () => {
    const t = setup();
    await conProfilo(t, "u-a", "pagina-a");
    await conProfilo(t, "u-b", "pagina-b");
    await turno(t, { handle: "pagina-a", threadId: "thread-di-a", writeKeyHash: CHIAVE_1 });
    await trascrizione(t, { handle: "pagina-a", threadId: "thread-di-a", writeKeyHash: CHIAVE_1 });
    const r = await turno(t, { handle: "pagina-b", threadId: "thread-di-a", writeKeyHash: CHIAVE_1 });
    expect(r.status).toBe(403);
    expect(r.corpo.messaggio).toMatch(/un'altra pagina/);
    expect((await trascrizione(t, { handle: "pagina-b", threadId: "thread-di-a", writeKeyHash: CHIAVE_1 })).status).toBe(403);
    const t2 = await thread(t, "thread-di-a");
    expect(t2?.profileId).toBe((await t.run(ctx => ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", "pagina-a")).first()))?._id);
  });

  it("un thread privato non si continua come pubblico, né il contrario", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "pagina-a");
    await inserisci(t, a.profileId, "privato-0001", { visibility: "proprietario" });
    await inserisci(t, a.profileId, "pubblico-001");
    expect((await turno(t, { handle: "pagina-a", threadId: "privato-0001" })).status).toBe(403);
    expect((await turno(t, { handle: "pagina-a", threadId: "pubblico-001", visibility: "proprietario" })).status).toBe(403);
    expect((await turno(t, { handle: "pagina-a", threadId: "privato-0001", visibility: "proprietario" })).status).toBe(200);
  });

  it("la trascrizione salva i messaggi così come sono, senza istruzioni di sistema, firma ripulita", async () => {
    const t = setup();
    await conProfilo(t, "u-a", "pagina-a");
    const messages = [
      { role: "system", content: "non salvarmi" },
      { role: "user", content: "  Chi c'era al concerto?  " },
      { role: "assistant", content: "", toolCalls: [{ id: "c1", type: "function", function: { name: "query_concerts", arguments: "{}" } }] },
      { role: "tool", toolCallId: "c1", content: "{\"count\":1}" },
      { role: "assistant", content: "Lu." },
    ];
    await trascrizione(t, { handle: "pagina-a", threadId: "thread-000001", writeKeyHash: CHIAVE_1, author: "  Lu\u0000 \n R.  ", messages });
    const salvato = await thread(t, "thread-000001");
    expect(salvato?.messages).toEqual(messages.slice(1));
    expect(salvato?.title).toBe("Chi c'era al concerto?");
    expect(salvato?.author).toBe("Lu R.");
    expect(salvato?.ipHmac).toBe(IP_A);
  });
});

describe("query pubbliche", () => {
  async function scenario() {
    const t = setup();
    const a = await conProfilo(t, "u-a", "pagina-a");
    const b = await conProfilo(t, "u-b", "pagina-b");
    await trascrizione(t, { handle: "pagina-a", threadId: "pubblico-a-1", writeKeyHash: CHIAVE_1, ipHmac: IP_A, author: "Lu" });
    await trascrizione(t, { handle: "pagina-a", threadId: "privato-a-1", visibility: "proprietario", ipHmac: IP_B });
    await trascrizione(t, { handle: "pagina-b", threadId: "pubblico-b-1", writeKeyHash: CHIAVE_2, ipHmac: IP_B });
    return { t, a, b };
  }

  it("listThreads e getThread: solo i pubblici della pagina, senza hash né IP", async () => {
    const { t } = await scenario();
    const lista = await t.query(api.chat.listThreads, { handle: "pagina-a" });
    expect(lista.map(x => x.threadId)).toEqual(["pubblico-a-1"]);
    expect(lista[0]).toEqual({ threadId: "pubblico-a-1", title: "Quanti concerti nel 2025?", author: "Lu", updatedAt: expect.any(Number) });
    expect((await t.query(api.chat.listThreads, { handle: "pagina-b" })).map(x => x.threadId)).toEqual(["pubblico-b-1"]);

    const uno = await t.query(api.chat.getThread, { handle: "pagina-a", threadId: "pubblico-a-1" });
    expect(uno?.messages).toHaveLength(2);
    // il thread privato non si legge da nessuna query pubblica, nemmeno conoscendo l'id
    expect(await t.query(api.chat.getThread, { handle: "pagina-a", threadId: "privato-a-1" })).toBeNull();
    // un thread si legge solo dalla sua pagina
    expect(await t.query(api.chat.getThread, { handle: "pagina-b", threadId: "pubblico-a-1" })).toBeNull();
    expect(await t.query(api.chat.getThread, { handle: "pagina-a", threadId: "../../x" })).toBeNull();

    const tutto = JSON.stringify([lista, uno, await t.query(api.chat.listThreads, { handle: "pagina-b" })]);
    for (const segreto of [CHIAVE_1, CHIAVE_2, IP_A, IP_B, "writeKeyHash", "ipHmac", "profileId"]) expect(tutto).not.toContain(segreto);
  });

  it("i thread privati li legge solo il proprietario, dalla dashboard", async () => {
    const { t, a, b } = await scenario();
    const miei = await a.as.query(api.chat.myThreads, {});
    expect(miei.threads.map(x => x.threadId)).toEqual(["privato-a-1"]);
    expect((await a.as.query(api.chat.myThread, { input: { threadId: "privato-a-1" } })).messages).toHaveLength(2);
    expect((await b.as.query(api.chat.myThreads, {})).threads).toEqual([]);
    for (const [chi, id] of [[b, "privato-a-1"], [a, "pubblico-a-1"], [a, "inesistente-1"]] as const) {
      const e = await chi.as.query(api.chat.myThread, { input: { threadId: id } }).catch(x => x);
      expect(codiceDi(e), id).toBe("not_found");
    }
    // l'Oracolo in scrittura (as: "oracolo") non legge lo storico privato
    expect(codiceDi(await a.as.query(api.chat.myThreads, { as: "oracolo" }).catch(x => x))).toBe("solo_dashboard");
    expect(codiceDi(await t.query(api.chat.myThreads, {}).catch(x => x))).toBe("unauthorized");
  });
});

describe("durata (TTL)", () => {
  it("90 giorni dall'ultimo messaggio; gli scaduti spariscono dalle query e il cron li cancella", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "pagina-a");
    await trascrizione(t, { handle: "pagina-a", threadId: "fresco-00001" });
    const fresco = await thread(t, "fresco-00001");
    expect(fresco!.expiresAt - fresco!.updatedAt).toBe(90 * DAY);
    await inserisci(t, a.profileId, "scaduto-0001", { updatedAt: Date.now() - 91 * DAY, expiresAt: Date.now() - DAY });

    expect((await t.query(api.chat.listThreads, { handle: "pagina-a" })).map(x => x.threadId)).toEqual(["fresco-00001"]);
    expect(await t.query(api.chat.getThread, { handle: "pagina-a", threadId: "scaduto-0001" })).toBeNull();

    await t.mutation(internal.chat.cleanupExpired, {});
    expect(await thread(t, "scaduto-0001")).toBeNull();
    expect(await thread(t, "fresco-00001")).not.toBeNull();
  });

  it("tanti scaduti: il cron li cancella a lotti finché non ne resta nessuno", async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      const a = await conProfilo(t, "u-a", "pagina-a");
      for (let i = 0; i < 205; i++) await inserisci(t, a.profileId, `scaduto-${String(i).padStart(4, "0")}`, { expiresAt: Date.now() - DAY });
      await t.mutation(internal.chat.cleanupExpired, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await t.run(ctx => ctx.db.query("chatThreads").collect())).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("solo per gli e2e locali", () => {
  it("azzeraLimitiPerTest ridà i turni a pagine e IP dei thread salvati; senza AUTH_DEV_OTP=1 rifiuta", async () => {
    const t = setup();
    await conProfilo(t, "u-a", "pagina-a");
    await trascrizione(t, { handle: "pagina-a", threadId: "thread-000001" });
    for (let i = 0; i < 8; i++) await turno(t, { handle: "pagina-a", threadId: `thread-00010${i}` });
    expect((await turno(t, { handle: "pagina-a", threadId: "thread-000200" })).status).toBe(429);

    vi.stubEnv("AUTH_DEV_OTP", "");
    await expect(t.mutation(internal.chat.azzeraLimitiPerTest, {})).rejects.toThrow(/AUTH_DEV_OTP/);
    vi.stubEnv("AUTH_DEV_OTP", "1");
    await t.mutation(internal.chat.azzeraLimitiPerTest, {});
    expect(await resta(t, "chatIpDay", IP_A)).toBe(40);
    expect(await resta(t, "chatGlobalDay")).toBe(200);
    expect((await turno(t, { handle: "pagina-a", threadId: "thread-000200" })).status).toBe(200);
  });

  it("azzeraLimitiPerTest riempie anche il tetto dell'Oracolo in scrittura", async () => {
    vi.stubEnv("AUTH_DEV_OTP", "1");
    const t = setup();
    const a = await conProfilo(t, "u-a", "pagina-a");
    await t.run(ctx => rateLimiter.limit(ctx, "chatPageDay", { key: chiaveScrittura(a.profileId), count: 60 }));
    expect((await turno(t, { handle: "pagina-a", threadId: "privato-0001", visibility: "proprietario" })).status).toBe(429);
    await t.mutation(internal.chat.azzeraLimitiPerTest, {});
    expect((await turno(t, { handle: "pagina-a", threadId: "privato-0001", visibility: "proprietario" })).status).toBe(200);
  });

  it("esaurisciPaginaPerTest ferma la sola pagina chiesta (anche gabrifila) finché azzeraLimitiPerTest non la riapre", async () => {
    const t = setup();
    await conProfilo(t, "u-a", "pagina-a");
    await conProfilo(t, "u-b", "pagina-b");
    await conProfilo(t, "u-g", "gabrifila");
    vi.stubEnv("AUTH_DEV_OTP", "");
    await expect(t.mutation(internal.chat.esaurisciPaginaPerTest, { handle: "pagina-a" })).rejects.toThrow(/AUTH_DEV_OTP/);
    vi.stubEnv("AUTH_DEV_OTP", "1");
    await t.mutation(internal.chat.esaurisciPaginaPerTest, { handle: "pagina-a" });
    await t.mutation(internal.chat.esaurisciPaginaPerTest, { handle: "gabrifila" });
    const fermo = await turno(t, { handle: "pagina-a", threadId: "thread-000001" });
    expect(fermo.status).toBe(429);
    expect(fermo.corpo.messaggio).toMatch(/[Ll]imite/);
    expect((await turno(t, { handle: "gabrifila", threadId: "thread-000002", ipHmac: IP_B })).status).toBe(429);
    expect((await turno(t, { handle: "pagina-b", threadId: "thread-000003" })).status).toBe(200);
    await t.mutation(internal.chat.azzeraLimitiPerTest, {});
    expect((await turno(t, { handle: "pagina-a", threadId: "thread-000001" })).status).toBe(200);
  });

  it("visibilitaPerTest dice se un thread esiste e com'è, solo con la guardia", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "pagina-a");
    await inserisci(t, a.profileId, "privato-0001", { visibility: "proprietario" });
    vi.stubEnv("AUTH_DEV_OTP", "");
    await expect(t.query(internal.chat.visibilitaPerTest, { threadId: "privato-0001" })).rejects.toThrow(/AUTH_DEV_OTP/);
    vi.stubEnv("AUTH_DEV_OTP", "1");
    expect(await t.query(internal.chat.visibilitaPerTest, { threadId: "privato-0001" })).toBe("proprietario");
    expect(await t.query(internal.chat.visibilitaPerTest, { threadId: "inesistente-1" })).toBeNull();
  });
});

describe("indirizzi chiusi all'Oracolo", () => {
  it("una funzione degli indirizzi chiamata con as: \"oracolo\" → solo_dashboard", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "pagina-a");
    const departureId = (await a.as.mutation(api.departures.add, { input: { name: "Casa" } })).id;
    const geo = await a.as.action(api.geo.geocodeDeparture, { as: "oracolo", input: { departureId, address: "Via dei Canarini 7, Genova" } }).catch(x => x);
    expect(codiceDi(geo)).toBe("solo_dashboard");
    const conferma = await a.as.mutation(api.departures.confirmAddress, { as: "oracolo", input: { departureId, indice: 0 } }).catch(x => x);
    expect(codiceDi(conferma)).toBe("solo_dashboard");
    // né la lettura degli indirizzi né l'export (che li contiene)
    expect(codiceDi(await a.as.query(api.departures.addresses, { as: "oracolo" }).catch(x => x))).toBe("solo_dashboard");
    expect(codiceDi(await a.as.query(api.account.esporta, { as: "oracolo" }).catch(x => x))).toBe("solo_dashboard");
    // e l'errore non ripete l'indirizzo
    expect(JSON.stringify(geo.data)).not.toContain("Canarini");
  });
});
