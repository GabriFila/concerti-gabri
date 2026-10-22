/* Import (PIANO traguardo 7): niente scritture se anche una sola riga non
   va; conferma sopra le 10 righe; un solo batchId; un lotto parziale si
   ferma con "importate N di M" e si annulla per batchId; funziona durante
   l'onboarding (onboardingStep: agente). */

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { codiceDi } from "./lib/errors.ts";
import { LOTTO_IMPORT } from "./importer.ts";
import { rateLimiter } from "./rateLimits.ts";
import { conProfilo, setup, venue, type T } from "./test.setup";
import { versoCsv } from "../shared/import.ts";
import { entryInput, type EntryInput } from "../shared/schema/entry.ts";

const CANARINO = "Via dei Canarini 7, Genova";

const concerto = (i: number, extra: Record<string, unknown> = {}): EntryInput =>
  entryInput.parse({ kind: "concert", date: `${String((i % 28) + 1).padStart(2, "0")}/03/2025`, artist: `Artista ${i}`, venue: "Fabrique", city: "Milano", ...extra });

async function profilo(extra: Record<string, unknown> = {}) {
  const t = setup();
  await venue(t, "Fabrique", "Milano", 9.25, 45.45);
  const a = await conProfilo(t, "u-a", "utente-a", extra);
  await a.as.mutation(api.departures.add, { input: { name: "Casa" } });
  return { t, a };
}

async function stato(t: T, profileId: string) {
  return await t.run(async ctx => {
    const di = async (tab: "entries" | "people" | "gifters" | "activity") =>
      (await ctx.db.query(tab).collect()).filter(d => (d as { profileId: string }).profileId === profileId);
    return { entries: await di("entries"), people: await di("people"), gifters: await di("gifters"), activity: await di("activity") };
  });
}

const errore = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return { code: codiceDi(e), data: (e as { data?: Record<string, unknown> }).data ?? {} };
  }
};

describe("importer", () => {
  it("una riga non valida (o un riferimento sconosciuto) blocca tutto: nessuna scrittura, errori senza valori", async () => {
    const { t, a } = await profilo();
    const prima = await stato(t, a.profileId);
    const buono = versoCsv([concerto(1, { with: ["Lu"] })]);
    const casi = [
      `${buono}\nconcerto,${CANARINO},,X,,Fabrique,Milano,,,,,,,,,,`,
      versoCsv([concerto(1), concerto(2, { venue: CANARINO })]),
      versoCsv([concerto(1), concerto(2, { from: CANARINO })]),
    ];
    for (const contenuto of casi) {
      const e = await errore(a.as.action(api.importer.apply, { input: { formato: "csv", contenuto } }));
      expect(e?.code).toBe("input_non_valido");
      expect(JSON.stringify(e)).not.toContain("Canarini");
      expect((e?.data.righe as string[]).length).toBeGreaterThan(0);
    }
    // l'elenco delle partenze valide c'è (sono nomi del proprietario)
    const p = await errore(a.as.action(api.importer.apply, { input: { formato: "csv", contenuto: casi[2] } }));
    expect((p?.data.righe as string[])[0]).toContain("Casa");
    expect(await stato(t, a.profileId)).toEqual(prima);
  });

  it("anteprima: conta righe e voci, elenca errori e nomi nuovi, non scrive", async () => {
    const { t, a } = await profilo();
    const prima = await stato(t, a.profileId);
    const contenuto = versoCsv([concerto(1, { with: ["Lu", "Cami"], giftFrom: "Amici", gift: true }), concerto(2, { venue: "Nuova venue" })]);
    const p = await a.as.query(api.importer.preview, { input: { formato: "csv", contenuto } });
    expect(p).toMatchObject({ righe: 2, voci: 2, concerti: 2, nuovePersone: ["Lu", "Cami"], nuoviRegali: ["Amici"], serveConferma: false, sogliaConferma: 10 });
    expect(p.errori).toEqual([expect.objectContaining({ riga: 3, campo: "venue" })]);
    expect(await stato(t, a.profileId)).toEqual(prima);
  });

  it("un import riuscito: persone e \"regalato da\" nuovi, un solo batchId, Annulla toglie tutto", async () => {
    const { t, a } = await profilo();
    const prima = await stato(t, a.profileId);
    const voci = [concerto(1, { with: ["Lu"], from: "Casa" }), concerto(2, { with: ["Lu", "Cami"], giftFrom: "Amici", gift: true })];
    const r = await a.as.action(api.importer.apply, { input: { formato: "json", contenuto: JSON.stringify(voci) } });
    expect(r).toMatchObject({ importate: 2, totale: 2, personeAggiunte: 2, regaliAggiunti: 1 });
    const dopo = await stato(t, a.profileId);
    expect(dopo.entries).toHaveLength(2);
    // senza indirizzo della partenza il km resta in attesa
    expect(dopo.entries.find(e => e.departureId)?.kmPending).toBe(true);
    expect(dopo.people.map(p => p.name).sort()).toEqual(["Cami", "Lu"]);
    const nuove = dopo.activity.filter(x => !prima.activity.some(y => y._id === x._id));
    expect(new Set(nuove.map(x => x.batchId))).toEqual(new Set([r.batchId]));
    await a.as.mutation(api.activity.undo, { input: { activityId: nuove[0]._id } });
    const annullato = await stato(t, a.profileId);
    expect(annullato.entries).toEqual([]);
    expect(annullato.people).toEqual([]);
    expect(annullato.gifters).toEqual([]);
  });

  it("sopra le 10 righe serve confirm: true", async () => {
    const { t, a } = await profilo();
    const contenuto = versoCsv(Array.from({ length: 11 }, (_, i) => concerto(i)));
    const e = await errore(a.as.action(api.importer.apply, { input: { formato: "csv", contenuto } }));
    expect(e).toMatchObject({ code: "input_non_valido", data: { campo: "confirm" } });
    expect((await stato(t, a.profileId)).entries).toEqual([]);
    expect(await a.as.action(api.importer.apply, { input: { formato: "csv", contenuto, confirm: true } })).toMatchObject({ importate: 11, totale: 11 });
    const dieci = versoCsv(Array.from({ length: 10 }, (_, i) => concerto(100 + i)));
    expect(await a.as.action(api.importer.apply, { input: { formato: "csv", contenuto: dieci } })).toMatchObject({ importate: 10 });
  });

  it("un lotto che fallisce a metà: \"importate N di M, annullabili\", e Annulla toglie il lotto parziale", async () => {
    const { t, a } = await profilo();
    const { chiave } = await a.as.mutation(api.agents.createApiKey, { input: { nome: "Import" } });
    // agentWrites: resta un solo gettone, quindi passa solo il primo lotto
    await t.run(async ctx => {
      await rateLimiter.limit(ctx, "agentWrites", { key: a.profileId, count: 199 });
    });
    const totale = LOTTO_IMPORT + 5;
    const contenuto = JSON.stringify(Array.from({ length: totale }, (_, i) => concerto(i)));
    const r = await t.action(api.importer.apply, { agentToken: chiave, input: { formato: "json", contenuto, confirm: true } });
    expect(r).toMatchObject({ importate: LOTTO_IMPORT, totale, parziale: true, errore: { code: "limite_superato" } });
    expect((r as { messaggio: string }).messaggio).toContain(`importate ${LOTTO_IMPORT} di ${totale}, annullabili`);
    const dopo = await stato(t, a.profileId);
    expect(dopo.entries).toHaveLength(LOTTO_IMPORT);
    const voce = dopo.activity.find(x => x.batchId === r.batchId)!;
    expect(voce.actor).toEqual({ via: "apikey", label: "API key · Import" });
    await a.as.mutation(api.activity.undo, { input: { activityId: voce._id } });
    expect((await stato(t, a.profileId)).entries).toEqual([]);
  });

  it("durante l'onboarding (profilo active, onboardingStep agente) l'import funziona", async () => {
    const { t, a } = await profilo({ onboardingStep: "agente" });
    const r = await a.as.action(api.importer.apply, { input: { formato: "csv", contenuto: versoCsv([concerto(1, { with: ["Lu"] })]) } });
    expect(r).toMatchObject({ importate: 1 });
    expect((await stato(t, a.profileId)).entries).toHaveLength(1);
    // un profilo ancora al passo 1 no: prima il profilo
    const t2 = setup();
    const b = await conProfilo(t2, "u-b", "utente-b", { status: "onboarding", handle: undefined, onboardingStep: "partenze" });
    expect((await errore(b.as.action(api.importer.apply, { input: { formato: "json", contenuto: "[]" } })))?.code).toBe("no_profile");
  });
});
