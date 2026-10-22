/* migrations:importChatThreads (PIANO T9): import idempotente, threadId,
   titolo e autore conservati, un thread senza chiave resta rivendicabile.
   Gli input arrivano da `converti` dello script, come in --apply. */

import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import { codiceDi } from "./lib/errors.ts";
import { setup, type T } from "./test.setup";
import { converti, sha256Hex } from "../scripts/migra-storico-chat.mjs";

const NOW = Date.parse("2026-10-21T20:00:00Z");
const GIORNO = 86_400_000;
const IP = "203.0.113.77";
const CHIAVE = "chiave-segreta-del-browser-123";
const ID_1 = "thread-1729512345678-abcdef";
const ID_2 = "6f1c2a9e-1b2c-4d5e-8f90-123456789abc";

const messaggi = (domanda: string, risposta: string) => [
  { role: "user", content: domanda },
  { role: "assistant", content: "", toolCalls: [{ id: "call_1", type: "function", function: { name: "query_concerts", arguments: "{}" } }] },
  { role: "tool", content: "{\"count\":12}", toolCallId: "call_1" },
  { role: "assistant", content: risposta },
];

type Thread = { threadId: string; title: string; author?: string; writeKeyHash?: string; messages: unknown[]; updatedAt: number; expiresAt: number };

/** Una conversazione di Upstash convertita dallo script. */
async function daUpstash(threadId: string, o: { updatedAt: string; chiave?: string; autore?: string; titolo?: string; risposta?: string }): Promise<Thread> {
  const grezzo = JSON.stringify({ threadId, ip: IP, updatedAt: o.updatedAt, messages: messaggi(`Domanda di ${threadId}`, o.risposta ?? "Risposta") });
  const r = await converti({ posizione: 1, threadId, score: 0, grezzo, pttl: 60 * GIORNO, titolo: o.titolo, chiave: o.chiave, autore: o.autore }, NOW);
  if (!r.thread) throw new Error("conversione non riuscita");
  return r.thread;
}

async function seminato() {
  const t = setup();
  const { profileId } = await t.mutation(internal.seed.ensure, {});
  return { t, profileId };
}

const threads = (t: T) => t.run(async ctx => await ctx.db.query("chatThreads").collect());

describe("migrations:importChatThreads", () => {
  it("importa su gabrifila, pubbliche, con threadId, titolo e autore conservati; chiave hashata; niente IP", async () => {
    const { t, profileId } = await seminato();
    const a = await daUpstash(ID_1, { updatedAt: "2026-10-01T10:00:00.000Z", chiave: CHIAVE, autore: "Marta", titolo: "Quanti concerti nel 2025?" });
    const b = await daUpstash(ID_2, { updatedAt: "2026-10-05T10:00:00.000Z" });
    expect(await t.mutation(internal.migrations.importChatThreads, { threads: [a, b] })).toEqual({ inserite: 2, aggiornate: 0, invariate: 0, conflitti: 0 });

    const docs = await threads(t);
    expect(docs.length).toBe(2);
    const uno = docs.find(d => d.threadId === ID_1)!;
    expect(uno).toMatchObject({
      profileId, visibility: "pubblica", threadId: ID_1, title: "Quanti concerti nel 2025?", author: "Marta",
      writeKeyHash: await sha256Hex(CHIAVE), messages: a.messages, updatedAt: Date.parse("2026-10-01T10:00:00Z"), expiresAt: NOW + 60 * GIORNO,
    });
    const due = docs.find(d => d.threadId === ID_2)!;
    expect(due).toMatchObject({ profileId, visibility: "pubblica", title: `Domanda di ${ID_2}` });
    expect(due.author).toBeUndefined();
    for (const d of docs) {
      expect(d.ipHmac).toBeUndefined();
      expect(JSON.stringify(d)).not.toContain(IP);
      expect(JSON.stringify(d)).not.toContain(CHIAVE);
    }
  });

  it("è idempotente: rilanciata con gli stessi dati non cambia niente", async () => {
    const { t } = await seminato();
    const input = [
      await daUpstash(ID_1, { updatedAt: "2026-10-01T10:00:00.000Z", chiave: CHIAVE }),
      await daUpstash(ID_2, { updatedAt: "2026-10-05T10:00:00.000Z" }),
    ];
    await t.mutation(internal.migrations.importChatThreads, { threads: input });
    const prima = await threads(t);
    expect(await t.mutation(internal.migrations.importChatThreads, { threads: input })).toEqual({ inserite: 0, aggiornate: 0, invariate: 2, conflitti: 0 });
    expect(await threads(t)).toEqual(prima);
  });

  it("un thread senza chiave resta rivendicabile; una rivendicazione in Convex non si perde", async () => {
    const { t } = await seminato();
    const vecchio = await daUpstash(ID_2, { updatedAt: "2026-10-05T10:00:00.000Z" });
    await t.mutation(internal.migrations.importChatThreads, { threads: [vecchio] });
    const [doc] = await threads(t);
    expect(doc.writeKeyHash).toBeUndefined();

    // il primo turno con una chiave lo rivendica (traguardo 6): qui lo si simula
    const hash = await sha256Hex("chiave-del-primo-turno");
    await t.run(async ctx => await ctx.db.patch(doc._id, { writeKeyHash: hash }));
    // rilancio allo switch con una versione più recente da Netlify, ancora senza chiave
    const nuovo = await daUpstash(ID_2, { updatedAt: "2026-10-20T10:00:00.000Z", risposta: "Risposta nuova" });
    expect(await t.mutation(internal.migrations.importChatThreads, { threads: [nuovo] })).toMatchObject({ aggiornate: 1 });
    const [dopo] = await threads(t);
    expect(dopo.writeKeyHash).toBe(hash);
    expect(dopo.messages).toEqual(nuovo.messages);
  });

  it("più recente su Upstash → aggiornata; continuata su Convex → invariata", async () => {
    const { t } = await seminato();
    await t.mutation(internal.migrations.importChatThreads, { threads: [await daUpstash(ID_1, { updatedAt: "2026-10-01T10:00:00.000Z" })] });

    const daNetlify = await daUpstash(ID_1, { updatedAt: "2026-10-10T10:00:00.000Z", chiave: CHIAVE, autore: "Marta", risposta: "Seconda risposta" });
    expect(await t.mutation(internal.migrations.importChatThreads, { threads: [daNetlify] })).toMatchObject({ aggiornate: 1 });
    expect((await threads(t))[0]).toMatchObject({ updatedAt: daNetlify.updatedAt, messages: daNetlify.messages, author: "Marta", writeKeyHash: await sha256Hex(CHIAVE) });

    // continuata sul sito nuovo dopo la migrazione: Convex è più recente e vince
    const [doc] = await threads(t);
    const continuata = [...doc.messages, { role: "user", content: "E nel 2026?" }];
    await t.run(async ctx => await ctx.db.patch(doc._id, { messages: continuata, updatedAt: Date.parse("2026-10-15T10:00:00Z") }));
    expect(await t.mutation(internal.migrations.importChatThreads, { threads: [daNetlify] })).toEqual({ inserite: 0, aggiornate: 0, invariate: 1, conflitti: 0 });
    expect((await threads(t))[0].messages).toEqual(continuata);
  });

  it("non tocca mai un thread di un altro profilo o privato", async () => {
    const { t } = await seminato();
    const altro = await t.run(async ctx => await ctx.db.insert("profiles", {
      handle: "altra", displayName: "Altra", forma: "f", status: "active", onboardingStep: "fatto",
      theme: { preset: "predefinito" }, layout: { ordine: [], nascoste: [], titoli: {} }, extra: {}, createdAt: NOW,
    }));
    const doc = { threadId: ID_1, title: "Sua", messages: [{ role: "user", content: "mia" }], updatedAt: 1, expiresAt: NOW + GIORNO };
    await t.run(async ctx => {
      await ctx.db.insert("chatThreads", { ...doc, profileId: altro, visibility: "pubblica" });
      const gabrifila = (await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", "gabrifila")).first())!;
      await ctx.db.insert("chatThreads", { ...doc, threadId: ID_2, profileId: gabrifila._id, visibility: "proprietario" });
    });
    const prima = await threads(t);
    const input = [
      await daUpstash(ID_1, { updatedAt: "2026-10-01T10:00:00.000Z" }),
      await daUpstash(ID_2, { updatedAt: "2026-10-01T10:00:00.000Z" }),
    ];
    expect(await t.mutation(internal.migrations.importChatThreads, { threads: input })).toEqual({ inserite: 0, aggiornate: 0, invariate: 0, conflitti: 2 });
    expect(await threads(t)).toEqual(prima);
  });

  it("gabrifila rinominato: le conversazioni vanno al profilo dell'alias", async () => {
    const { t, profileId } = await seminato();
    await t.run(async ctx => {
      await ctx.db.patch(profileId, { handle: "gabri" });
      await ctx.db.insert("handleAliases", { handle: "gabrifila", profileId, createdAt: NOW });
    });
    await t.mutation(internal.migrations.importChatThreads, { threads: [await daUpstash(ID_1, { updatedAt: "2026-10-01T10:00:00.000Z" })] });
    expect((await threads(t))[0].profileId).toBe(profileId);
  });

  it("senza il profilo gabrifila si ferma", async () => {
    const t = setup();
    await expect(t.mutation(internal.migrations.importChatThreads, { threads: [await daUpstash(ID_1, { updatedAt: "2026-10-01T10:00:00.000Z" })] }))
      .rejects.toThrow(/gabrifila/);
    expect(await threads(t)).toEqual([]);
  });

  it("rifiuta l'intero lotto se un input non è valido, senza ripeterne i valori", async () => {
    const { t } = await seminato();
    const buono = await daUpstash(ID_2, { updatedAt: "2026-10-01T10:00:00.000Z" });
    const base = await daUpstash(ID_1, { updatedAt: "2026-10-01T10:00:00.000Z" });
    for (const cattivo of [
      { ...base, writeKeyHash: CHIAVE }, // la chiave in chiaro al posto dell'hash
      { ...base, ip: IP }, // l'IP non entra mai
      { ...base, profileId: "k" + "x".repeat(31) },
      { ...base, visibility: "proprietario" },
      { ...base, threadId: "preview" },
      { ...base, messages: [] },
    ]) {
      try {
        await t.mutation(internal.migrations.importChatThreads, { threads: [buono, cattivo] });
        throw new Error("doveva fallire");
      } catch (e) {
        expect(codiceDi(e)).toBe("input_non_valido");
        const testo = JSON.stringify((e as { data?: unknown }).data) + String((e as Error).message);
        expect(testo).not.toContain(CHIAVE);
        expect(testo).not.toContain(IP);
        expect(testo).not.toContain("Domanda di");
      }
    }
    expect(await threads(t)).toEqual([]);
  });
});
