/* #persone (T5): aggiungi, rinomina, unisci (con batchId, annullabile come
   lotto) e cancella, bloccato se la persona è usata, con l'elenco dei
   concerti. */

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { codiceDi } from "./lib/errors.ts";
import { conProfilo, setup, venue, type T } from "./test.setup";

const errDi = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { data: Record<string, unknown> }).data;
  }
};
const codice = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return codiceDi(e);
  }
};

async function base(t: T) {
  const a = await conProfilo(t, "u-a", "utente-a");
  await venue(t, "Fabrique", "Milano", 9.25, 45.45);
  const add = (name: string) => a.as.mutation(api.people.add, { input: { name } });
  const persone = async () => (await a.as.query(api.people.list, {})).people;
  const concerti = async () => (await a.as.query(api.entries.list, {})).concerts;
  return { a, add, persone, concerti };
}

describe("persone", () => {
  it("aggiungi e rinomina; i concerti seguono la persona; nomi unici senza maiuscole e accenti", async () => {
    const t = setup();
    const { a, add, persone, concerti } = await base(t);
    const { id } = await add("Marco R.");
    await a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/01/2026", artist: "A", venue: "Fabrique", city: "Milano", with: ["Marco R."] } });
    await a.as.mutation(api.people.rename, { input: { id, name: "Marchino" } });
    expect((await concerti())[0].with).toEqual(["Marchino"]);
    expect(await codice(add("marchino"))).toBe("conflitto");
    expect(await persone()).toEqual([{ id, name: "Marchino", concerti: 1 }]);
  });

  it("unisci: i concerti (anche dei festival) passano all'altra, senza doppioni, in un solo lotto", async () => {
    const t = setup();
    const { a, add, persone, concerti } = await base(t);
    const { id: lu } = await add("Lu");
    const { id: lucia } = await add("Lucia");
    await a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/01/2026", artist: "A", venue: "Fabrique", city: "Milano", with: ["Lu", "Lucia"] } });
    await a.as.mutation(api.entries.add, {
      input: { kind: "festival", name: "Fest", date: "02/02/2026", venue: "Fabrique", city: "Milano", concerts: [{ artist: "X", with: ["Lu"] }, { artist: "Y", with: [] }] },
    });
    await a.as.mutation(api.people.merge, { input: { from: lu, into: lucia } });
    const [c, f] = await concerti();
    expect(c.with).toEqual(["Lucia"]);
    expect("concerts" in f && f.concerts![0].with).toEqual(["Lucia"]);
    expect((await persone()).map(p => p.name)).toEqual(["Lucia"]);
    const voci = (await a.as.query(api.activity.list, {})).voci.filter(v => v.lotto);
    expect(voci.length).toBe(3); // due concerti + la persona tolta
    expect(new Set(voci.map(v => v.lotto)).size).toBe(1);
    // Annulla del lotto: tutto come prima
    await a.as.mutation(api.activity.undo, { input: { activityId: voci[0].id } });
    expect((await persone()).map(p => p.name).sort()).toEqual(["Lu", "Lucia"]);
    expect((await concerti())[0].with).toEqual(["Lu", "Lucia"]);
  });

  it("unire una persona con sé stessa è un errore", async () => {
    const t = setup();
    const { a, add } = await base(t);
    const { id } = await add("Lu");
    expect(await codice(a.as.mutation(api.people.merge, { input: { from: id, into: id } }))).toBe("input_non_valido");
  });

  it("cancellare una persona usata è bloccato, con l'elenco dei concerti; non usata si cancella", async () => {
    const t = setup();
    const { a, add, persone } = await base(t);
    const { id } = await add("Lu");
    const { id: libero } = await add("Nessuno");
    await a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/01/2026", artist: "Emma Nolde", venue: "Fabrique", city: "Milano", with: ["Lu"] } });
    const err = await errDi(a.as.mutation(api.people.remove, { input: { id, confirm: true } }));
    expect(err).toMatchObject({ code: "in_uso", concerti: ["01/01/2026 · Emma Nolde"] });
    // la conferma è obbligatoria
    expect(await codice(a.as.mutation(api.people.remove, { input: { id: libero } as never }))).toBe("input_non_valido");
    await a.as.mutation(api.people.remove, { input: { id: libero, confirm: true } });
    expect((await persone()).map(p => p.name)).toEqual(["Lu"]);
  });
});
