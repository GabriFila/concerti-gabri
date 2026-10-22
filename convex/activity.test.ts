import { describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CANARINO } from "../e2e/helpers/canarino.ts";
import { codiceDi } from "./lib/errors.ts";
import { conProfilo, setup, venue, type T } from "./test.setup";

async function base(t: T) {
  const a = await conProfilo(t, "u-a", "utente-a");
  await venue(t, "Fabrique", "Milano", 9.25, 45.45);
  await a.as.mutation(api.people.add, { input: { name: "Lu" } });
  const add = (artist: string) => a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/01/2026", artist, venue: "Fabrique", city: "Milano", with: ["Lu"] } });
  const ultima = async () => (await a.as.query(api.activity.list, {})).voci[0];
  const elenco = async () => (await a.as.query(api.entries.list, {})).concerts;
  const undo = async (id: string) => a.as.mutation(api.activity.undo, { input: { activityId: id } });
  return { a, add, ultima, elenco, undo };
}

const codice = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return codiceDi(e);
  }
};

describe("registro e Annulla", () => {
  it("annulla una creazione", async () => {
    const t = setup();
    const { add, ultima, elenco, undo } = await base(t);
    await add("A");
    await undo((await ultima()).id);
    expect(await elenco()).toEqual([]);
  });

  it("annulla una modifica, e annullare l'annullamento la rifà", async () => {
    const t = setup();
    const { a, add, ultima, elenco, undo } = await base(t);
    const { id } = await add("A");
    await a.as.mutation(api.entries.update, { input: { id, patch: { artist: "B", voto: 4 } } });
    await undo((await ultima()).id);
    expect((await elenco())[0]).toMatchObject({ artist: "A" });
    expect((await elenco())[0].voto).toBeUndefined();
    await undo((await ultima()).id);
    expect((await elenco())[0]).toMatchObject({ artist: "B", voto: 4 });
  });

  it("annulla una cancellazione (il concerto torna con i suoi compagni)", async () => {
    const t = setup();
    const { a, add, ultima, elenco, undo } = await base(t);
    const { id } = await add("A");
    await a.as.mutation(api.entries.remove, { input: { id, confirm: true } });
    await undo((await ultima()).id);
    expect(await elenco()).toMatchObject([{ artist: "A", with: ["Lu"] }]);
  });

  it("annulla un lotto (unione di persone) per batchId", async () => {
    const t = setup();
    const { a, add, ultima, elenco, undo } = await base(t);
    await add("A");
    const { id: marco } = await a.as.mutation(api.people.add, { input: { name: "Marco R." } });
    const lu = (await a.as.query(api.people.list, {})).people.find(p => p.name === "Lu")!.id;
    await a.as.mutation(api.people.merge, { input: { from: lu, into: marco } });
    expect((await elenco())[0].with).toEqual(["Marco R."]);
    await undo((await ultima()).id);
    expect((await elenco())[0].with).toEqual(["Lu"]);
    expect((await a.as.query(api.people.list, {})).people.map(p => p.name).sort()).toEqual(["Lu", "Marco R."]);
  });

  it("conflitto: modificato dopo → annulla prima le modifiche successive", async () => {
    const t = setup();
    const { a, add, elenco, undo } = await base(t);
    const { id } = await add("A");
    const creazione = (await a.as.query(api.activity.list, {})).voci[0].id;
    await a.as.mutation(api.entries.update, { input: { id, patch: { artist: "B" } } });
    expect(await codice(undo(creazione))).toBe("conflitto");
    expect((await elenco())[0].artist).toBe("B");
  });

  it("i campi km vengono ignorati nel confronto", async () => {
    const t = setup();
    const { a, add, ultima, elenco, undo } = await base(t);
    const { id } = await add("A");
    await a.as.mutation(api.entries.update, { input: { id, patch: { artist: "B" } } });
    const modifica = (await ultima()).id;
    // un ricalcolo di sistema tocca solo i km
    await t.run(async ctx => ctx.db.patch(id as never, { km: 123, kmSource: "calcolato" } as never));
    expect(await codice(undo(modifica))).toBe("ok");
    expect((await elenco())[0].artist).toBe("A");
  });

  it("una voce già annullata non si annulla due volte", async () => {
    const t = setup();
    const { add, ultima, undo } = await base(t);
    await add("A");
    const v = (await ultima()).id;
    await undo(v);
    expect(await codice(undo(v))).toBe("conflitto");
  });

  it("le voci di sistema (indirizzo aggiornato, km ricalcolati) non si annullano", async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      const { a, undo } = await base(t);
      const { id: casa } = await a.as.mutation(api.departures.add, { input: { name: "Casa" } });
      // un concerto da Casa senza indirizzo: km in attesa, poi calcolati dal ricalcolo di sistema
      await a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/01/2026", artist: "A", venue: "Fabrique", city: "Milano", from: "Casa" } });
      await t.mutation(internal.departures.saveDraft, { profileId: a.profileId, departureId: casa as Id<"departures">, candidates: [{ label: "x", lng: CANARINO.lng, lat: CANARINO.lat }] });
      await a.as.mutation(api.departures.confirmAddress, { input: { departureId: casa, indice: 0 } });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const voci = (await a.as.query(api.activity.list, {})).voci;
      const indirizzo = voci.find(v => v.riassunto.startsWith("indirizzo di Casa"))!;
      const km = voci.find(v => v.riassunto.startsWith("km ricalcolati"))!;
      for (const v of [indirizzo, km]) {
        expect(v).toMatchObject({ via: "sistema", annullabile: false });
        expect(await codice(undo(v.id))).toBe("conflitto");
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Annulla rispetta le regole delle funzioni", () => {
  const voceDi = async (a: Awaited<ReturnType<typeof base>>["a"], tabella: string, op: string) =>
    (await a.as.query(api.activity.list, { input: { limite: 100 } })).voci.find(v => v.tabella === tabella && v.op === op)!;

  it("annullare la creazione di una persona, partenza o \"regalato da\" usati da un concerto è rifiutato (in_uso)", async () => {
    const t = setup();
    const { a, elenco, undo } = await base(t);
    await a.as.mutation(api.departures.add, { input: { name: "Casa" } });
    await a.as.mutation(api.gifters.add, { input: { label: "Amici" } });
    await a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/01/2026", artist: "A", venue: "Fabrique", city: "Milano", with: ["Lu"], from: "Casa", gift: true, giftFrom: "Amici" } });
    for (const tabella of ["people", "departures", "gifters"]) {
      expect(await codice(undo((await voceDi(a, tabella, "create")).id)), tabella).toBe("in_uso");
    }
    expect((await elenco())[0]).toMatchObject({ with: ["Lu"], from: "Casa", giftFrom: "Amici" });
    // senza concerti che li usano, la creazione si annulla
    const [e] = await elenco();
    await a.as.mutation(api.entries.remove, { input: { id: e.id, confirm: true } });
    for (const tabella of ["people", "departures", "gifters"]) {
      expect(await codice(undo((await voceDi(a, tabella, "create")).id)), tabella).toBe("ok");
    }
  });

  it("l'handle si ripristina solo se è ancora libero, con gli alias: mai due profili con lo stesso handle", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    const b = await conProfilo(t, "u-b", "utente-b");
    const ultima = async () => (await a.as.query(api.activity.list, {})).voci[0].id;
    await a.as.mutation(api.profiles.update, { input: { handle: "alice2" } });
    const primo = await ultima();
    await a.as.mutation(api.profiles.update, { input: { handle: "utente-a" } });
    await a.as.mutation(api.activity.undo, { input: { activityId: await ultima() } });
    // A è di nuovo alice2 e utente-a resta suo (alias): B non lo prende
    expect(await t.query(api.profiles.handleAvailable, { handle: "utente-a" })).toMatchObject({ disponibile: false });
    expect(await codice(b.as.mutation(api.profiles.update, { input: { handle: "utente-a" } }))).toBe("handle_non_disponibile");
    expect(await t.query(api.pages.byHandle, { handle: "utente-a" })).toEqual({ redirect: "alice2" });
    // annullare il primo cambio riporta A a utente-a (il suo alias), e alice2 diventa l'alias
    await a.as.mutation(api.activity.undo, { input: { activityId: primo } });
    expect(await t.query(api.pages.byHandle, { handle: "alice2" })).toEqual({ redirect: "utente-a" });
    const handles = await t.run(async ctx => (await ctx.db.query("profiles").collect()).map(p => p.handle).sort());
    expect(handles).toEqual(["utente-a", "utente-b"]);
  });

  it("se l'handle di prima è stato preso da un altro profilo, Annulla risponde conflitto", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    await conProfilo(t, "u-b", "utente-b");
    await a.as.mutation(api.profiles.update, { input: { handle: "alice2" } });
    const voce = (await a.as.query(api.activity.list, {})).voci[0].id;
    // l'alias sparisce (es. dopo un'eliminazione) e B prende utente-a
    await t.run(async ctx => {
      for (const al of await ctx.db.query("handleAliases").collect()) await ctx.db.delete(al._id);
      const pb = (await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", "utente-b")).first())!;
      await ctx.db.patch(pb._id, { handle: "utente-a" });
    });
    expect(await codice(a.as.mutation(api.activity.undo, { input: { activityId: voce } }))).toBe("conflitto");
    const handles = await t.run(async ctx => (await ctx.db.query("profiles").collect()).map(p => p.handle).sort());
    expect(handles).toEqual(["alice2", "utente-a"]);
  });

  it("i nomi restano unici anche annullando (rinomina e cancellazione)", async () => {
    const t = setup();
    const { a, undo } = await base(t);
    const lu = (await a.as.query(api.people.list, {})).people.find(p => p.name === "Lu")!.id;
    await a.as.mutation(api.people.rename, { input: { id: lu, name: "Lu2" } });
    const rinomina = (await voceDi(a, "people", "update")).id;
    await a.as.mutation(api.people.add, { input: { name: "Lu" } });
    expect(await codice(undo(rinomina))).toBe("conflitto");
    // cancellazione: un nuovo "Marco R." nel frattempo blocca il ripristino del vecchio
    const { id: marco } = await a.as.mutation(api.people.add, { input: { name: "Marco R." } });
    await a.as.mutation(api.people.remove, { input: { id: marco, confirm: true } });
    const cancellazione = (await voceDi(a, "people", "delete")).id;
    await a.as.mutation(api.people.add, { input: { name: "marco r." } });
    expect(await codice(undo(cancellazione))).toBe("conflitto");
    expect((await a.as.query(api.people.list, {})).people.map(p => p.name).sort()).toEqual(["Lu", "Lu2", "marco r."]);
  });

  it("una partenza cancellata e ripristinata torna SENZA indirizzo, con le sue coppie km", async () => {
    const t = setup();
    const { a, elenco, undo } = await base(t);
    const { id: casa } = await a.as.mutation(api.departures.add, { input: { name: "Casa" } });
    await t.mutation(internal.departures.saveDraft, { profileId: a.profileId, departureId: casa as Id<"departures">, candidates: [{ label: "x", lng: CANARINO.lng, lat: CANARINO.lat }] });
    await a.as.mutation(api.departures.confirmAddress, { input: { departureId: casa, indice: 0 } });
    const add = () => a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/01/2026", artist: "A", venue: "Fabrique", city: "Milano", from: "Casa" } });
    const { id } = await add();
    const km = (await elenco())[0].km;
    expect(km).toBeGreaterThan(0);
    await a.as.mutation(api.entries.remove, { input: { id, confirm: true } });
    await a.as.mutation(api.departures.remove, { input: { id: casa, confirm: true } });
    expect(await undo((await voceDi(a, "departures", "delete")).id)).toMatchObject({ ok: true });
    const [ripristinata] = (await a.as.query(api.departures.list, {})).departures;
    expect(ripristinata).toMatchObject({ name: "Casa", stato: "mancante" });
    expect(await t.run(async ctx => (await ctx.db.query("departureSecrets").collect()).length)).toBe(0);
    // la coppia (Casa, Fabrique) è rimasta: stesso km, nessuna estrazione nuova
    await add();
    expect((await elenco())[0]).toMatchObject({ from: "Casa", km });
    expect((await elenco())[0].kmPending).toBeUndefined();
  });
});

describe("Annulla e ricalcoli di sistema (T5)", () => {
  it("un ricalcolo dei km dopo una modifica non crea conflitto: Annulla riporta i campi e tiene il km nuovo della coppia", async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      const { a, ultima, elenco, undo } = await base(t);
      const { id: casa } = await a.as.mutation(api.departures.add, { input: { name: "Casa" } });
      const conferma = async (lng: number, lat: number) => {
        await t.mutation(internal.departures.saveDraft, { profileId: a.profileId, departureId: casa as Id<"departures">, candidates: [{ label: "x", lng, lat }] });
        await a.as.mutation(api.departures.confirmAddress, { input: { departureId: casa, indice: 0 } });
        await t.finishAllScheduledFunctions(vi.runAllTimers);
      };
      await conferma(9.19, 45.46);
      const { id } = await a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/01/2026", artist: "A", venue: "Fabrique", city: "Milano", from: "Casa" } });
      await a.as.mutation(api.entries.update, { input: { id, patch: { artist: "B", voto: 5 } } });
      const modifica = (await ultima()).id;
      // correzione dell'indirizzo: nuova estrazione e riscrittura dei km (attività di sistema, nello stesso lotto)
      await conferma(8.95, 44.41);
      const kmNuovo = (await elenco())[0].km;
      const voci = (await a.as.query(api.activity.list, {})).voci;
      expect(voci.find(v => v.riassunto.startsWith("km ricalcolati"))).toMatchObject({ via: "sistema", annullabile: false });
      expect(await undo(modifica)).toMatchObject({ ok: true });
      expect((await elenco())[0]).toMatchObject({ artist: "A", km: kmNuovo });
      expect((await elenco())[0].voto).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("anche un concerto aggiunto in attesa e poi calcolato si annulla senza conflitto", async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      const { a, elenco, undo } = await base(t);
      const { id: casa } = await a.as.mutation(api.departures.add, { input: { name: "Casa" } });
      await a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/01/2026", artist: "A", venue: "Fabrique", city: "Milano", from: "Casa" } });
      const aggiunta = (await a.as.query(api.activity.list, {})).voci[0].id;
      expect((await elenco())[0].kmPending).toBe(true);
      await t.mutation(internal.departures.saveDraft, { profileId: a.profileId, departureId: casa as Id<"departures">, candidates: [{ label: "x", lng: 9.19, lat: 45.46 }] });
      await a.as.mutation(api.departures.confirmAddress, { input: { departureId: casa, indice: 0 } });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect((await elenco())[0].km).toBeGreaterThan(0);
      expect(await undo(aggiunta)).toMatchObject({ ok: true });
      expect(await elenco()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
