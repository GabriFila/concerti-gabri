/* Le aperture (DECISIONI «Aperture»): il collegamento per nome e data,
   gli errori dei riferimenti, la serata imposta dall'headliner e propagata,
   niente km suoi, la cancellazione dell'headliner (aperture scollegate con
   i km della stessa coppia) e Annulla che le ricollega; l'import CSV con e
   senza la colonna `apertura_di`. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { codiceDi } from "./lib/errors.ts";
import { conProfilo, setup, venue, type T } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00+02:00"));
});
afterEach(() => vi.useRealTimers());

const errore = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return { code: codiceDi(e), ...((e as { data?: { messaggio?: string; campo?: string } }).data ?? {}) };
  }
  throw new Error("doveva fallire");
};

type As = Awaited<ReturnType<typeof conProfilo>>["as"];

/** Un profilo con due venue e la partenza «Casa» con l'indirizzo (quindi i km si calcolano). */
async function profilo(t: T) {
  const a = await conProfilo(t, "u-a", "utente-a");
  await venue(t, "Fiera Milano Live", "Rho", 9.08, 45.52);
  await venue(t, "Fabrique", "Milano", 9.25, 45.45);
  const { id: casa } = await a.as.mutation(api.departures.add, { input: { name: "Casa" } });
  const departureId = casa as Id<"departures">;
  await t.mutation(internal.departures.saveDraft, { profileId: a.profileId, departureId, candidates: [{ label: "Canarini 7, Genova", lng: 9.19, lat: 45.46 }] });
  await a.as.mutation(api.departures.confirmAddress, { input: { departureId, indice: 0 } });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return a;
}

const add = (as: As, input: Record<string, unknown>) =>
  as.mutation(api.entries.add, { input: { kind: "concert", venue: "Fiera Milano Live", city: "Rho", with: [], ...input } as never });
const doc = (t: T, id: string) => t.run(async ctx => (await ctx.db.get(id as Id<"entries">)) as Doc<"entries"> | null);
const tutte = (t: T) => t.run(async ctx => await ctx.db.query("entries").collect());

describe("aperture: collegamento e serata", () => {
  it("si collega per nome e data: data, venue e partenza dell'headliner, niente km suoi; list e get lo mostrano", async () => {
    const t = setup();
    const a = await profilo(t);
    const { id: h } = await add(a.as, { artist: "Lewis Capaldi", date: "17/06/2026", from: "Casa", cost: 105.84 });
    const { id: o } = await add(a.as, { artist: "Temper City", date: "2026-06-17", from: "Casa", cost: 0, aperturaDi: "lewis capaldi" });
    const [hd, od] = [await doc(t, h), await doc(t, o)];
    expect(hd!.km).toBeGreaterThan(0);
    expect(od).toMatchObject({ aperturaDiId: h, date: hd!.date, venueId: hd!.venueId, departureId: hd!.departureId, cost: 0 });
    expect(od).not.toHaveProperty("km");
    expect(od).not.toHaveProperty("kmPending");
    const riga = (await a.as.query(api.entries.list, {})).concerts.find(e => e.id === o)!;
    expect(riga).toMatchObject({ aperturaDi: "Lewis Capaldi", aperturaDiId: h, from: "Casa" });
    expect(await a.as.query(api.entries.get, { input: { id: o } })).toMatchObject({ aperturaDi: "Lewis Capaldi" });
    // senza partenza nell'input la prende dall'headliner; la pagina pubblica ha l'id
    const { id: o2 } = await add(a.as, { artist: "Angelica Bove", date: "17/06/2026", aperturaDi: "Lewis Capaldi" });
    expect((await doc(t, o2))!.departureId).toBe(hd!.departureId);
    const pagina = (await t.query(api.pages.byHandle, { handle: "utente-a" })) as { entries: { _id: string; aperturaDiId?: string }[] };
    expect(pagina.entries.filter(e => e.aperturaDiId === h).map(e => e._id).sort()).toEqual([o, o2].sort());
  });

  it("errori dei riferimenti: sconosciuto (con i validi), festival, apertura di un'apertura, ambiguo, venue o partenza diverse", async () => {
    const t = setup();
    const a = await profilo(t);
    await add(a.as, { artist: "Lewis Capaldi", date: "17/06/2026", from: "Casa" });
    await add(a.as, { artist: "Temper City", date: "17/06/2026", aperturaDi: "Lewis Capaldi" });
    const sconosciuto = await errore(add(a.as, { artist: "X", date: "17/06/2026", aperturaDi: "Nessuno" }));
    expect(sconosciuto).toMatchObject({ code: "nome_sconosciuto", campo: "aperturaDi" });
    expect(sconosciuto.messaggio).toContain("Headliner validi in quella data: Lewis Capaldi");
    expect(sconosciuto.messaggio).not.toContain("Nessuno");
    // un'altra data: nessun headliner valido
    expect((await errore(add(a.as, { artist: "X", date: "18/06/2026", aperturaDi: "Lewis Capaldi" }))).messaggio).toContain("nessuno");
    // un'apertura non è un headliner
    expect(await errore(add(a.as, { artist: "X", date: "17/06/2026", aperturaDi: "Temper City" }))).toMatchObject({ code: "input_non_valido", campo: "aperturaDi" });
    // un festival non ha aperture
    await a.as.mutation(api.entries.add, {
      input: { kind: "festival", name: "MI AMI", date: "23/05/2026", venue: "Fabrique", city: "Milano", concerts: [{ artist: "Rares", with: [] }, { artist: "Patagarri", with: [] }] } as never,
    });
    expect((await errore(add(a.as, { artist: "X", date: "23/05/2026", venue: "Fabrique", city: "Milano", aperturaDi: "MI AMI" }))).messaggio).toMatch(/festival/);
    // venue e partenza devono essere quelle dell'headliner
    expect(await errore(add(a.as, { artist: "X", date: "17/06/2026", venue: "Fabrique", city: "Milano", aperturaDi: "Lewis Capaldi" }))).toMatchObject({ code: "input_non_valido", campo: "venue" });
    await a.as.mutation(api.departures.add, { input: { name: "Ufficio" } });
    expect(await errore(add(a.as, { artist: "X", date: "17/06/2026", from: "Ufficio", aperturaDi: "Lewis Capaldi" }))).toMatchObject({ code: "input_non_valido", campo: "from" });
    // stesso artista due volte nella stessa data: decide la venue
    await add(a.as, { artist: "Doppio", date: "01/07/2026" });
    await add(a.as, { artist: "Doppio", date: "01/07/2026", venue: "Fabrique", city: "Milano" });
    const { id } = await add(a.as, { artist: "Y", date: "01/07/2026", venue: "Fabrique", city: "Milano", aperturaDi: "Doppio" });
    const scelto = (await doc(t, id))!;
    expect((await doc(t, scelto.aperturaDiId!))!.venueId).toBe(scelto.venueId);
  });

  it("l'headliner che cambia serata si porta dietro le aperture (un lotto, un Annulla); un headliner con aperture non diventa un'apertura", async () => {
    const t = setup();
    const a = await profilo(t);
    const { id: h } = await add(a.as, { artist: "Lewis Capaldi", date: "17/06/2026", from: "Casa" });
    const { id: o } = await add(a.as, { artist: "Temper City", date: "17/06/2026", aperturaDi: "Lewis Capaldi" });
    await a.as.mutation(api.entries.update, { input: { id: h, patch: { date: "18/06/2026", venue: "Fabrique", city: "Milano" } } as never });
    const [hd, od] = [await doc(t, h), await doc(t, o)];
    expect(od).toMatchObject({ date: "18/06/2026", sortKey: hd!.sortKey, venueId: hd!.venueId, departureId: hd!.departureId });
    expect(od).not.toHaveProperty("km");
    // un'apertura non cambia la sua serata da sola
    expect(await errore(a.as.mutation(api.entries.update, { input: { id: o, patch: { date: "19/06/2026" } } as never }))).toMatchObject({ campo: "date" });
    // ma i campi suoi sì, anche riscrivendo uguali data e venue (come fa il modulo)
    await a.as.mutation(api.entries.update, { input: { id: o, patch: { date: "18/06/2026", venue: "Fabrique", city: "Milano", from: "Casa", voto: 4, cost: 0 } } as never });
    expect((await doc(t, o))!.voto).toBe(4);
    // headliner con aperture: non può essere un'apertura
    await add(a.as, { artist: "Altro", date: "18/06/2026", venue: "Fabrique", city: "Milano" });
    expect(await errore(a.as.mutation(api.entries.update, { input: { id: h, patch: { aperturaDi: "Altro" } } as never }))).toMatchObject({ campo: "aperturaDi" });

    // Annulla del cambio di serata: un solo lotto riporta indietro headliner e apertura
    const voci = (await a.as.query(api.activity.list, {})).voci as { id: string; riassunto: string; lotto?: string }[];
    const cambio = voci.find(v => v.riassunto.startsWith("modificato: Lewis Capaldi"))!;
    expect(cambio.lotto).toBeTruthy();
    expect(voci.filter(v => v.lotto === cambio.lotto)).toHaveLength(2);
    // prima si annulla la modifica successiva dell'apertura (voto), poi il cambio di serata
    const voto = voci.find(v => v.riassunto.startsWith("modificato: Temper City"))!;
    await a.as.mutation(api.activity.undo, { input: { activityId: voto.id } });
    await a.as.mutation(api.activity.undo, { input: { activityId: cambio.id } });
    const [h2, o2] = [await doc(t, h), await doc(t, o)];
    expect(h2!.date).toBe("17/06/2026");
    expect(o2).toMatchObject({ date: "17/06/2026", venueId: h2!.venueId, aperturaDiId: h });
  });

  it("null scollega: l'apertura resta con la sua serata e prende i km della coppia", async () => {
    const t = setup();
    const a = await profilo(t);
    const { id: h } = await add(a.as, { artist: "Lewis Capaldi", date: "17/06/2026", from: "Casa" });
    const { id: o } = await add(a.as, { artist: "Temper City", date: "17/06/2026", aperturaDi: "Lewis Capaldi" });
    await a.as.mutation(api.entries.update, { input: { id: o, patch: { aperturaDi: null } } as never });
    const [hd, od] = [await doc(t, h), await doc(t, o)];
    expect(od).not.toHaveProperty("aperturaDiId");
    expect(od).toMatchObject({ date: hd!.date, venueId: hd!.venueId, km: hd!.km });
    // e si ricollega
    await a.as.mutation(api.entries.update, { input: { id: o, patch: { aperturaDi: "Lewis Capaldi" } } as never });
    expect(await doc(t, o)).toMatchObject({ aperturaDiId: h });
    expect(await doc(t, o)).not.toHaveProperty("km");
  });
});

describe("aperture: cancellazione dell'headliner e Annulla", () => {
  it("le aperture restano scollegate con i km della stessa coppia, nello stesso lotto; Annulla le ricollega", async () => {
    const t = setup();
    const a = await profilo(t);
    const { id: h } = await add(a.as, { artist: "Lewis Capaldi", date: "17/06/2026", from: "Casa", cost: 105.84 });
    const { id: o1 } = await add(a.as, { artist: "Temper City", date: "17/06/2026", aperturaDi: "Lewis Capaldi", cost: 0 });
    const { id: o2 } = await add(a.as, { artist: "Angelica Bove", date: "17/06/2026", aperturaDi: "Lewis Capaldi" });
    const kmSerata = (await doc(t, h))!.km;
    const r = await a.as.mutation(api.entries.remove, { input: { id: h, confirm: true } });
    expect(r).toMatchObject({ ok: true, aperture_scollegate: 2 });
    for (const o of [o1, o2]) {
      const d = (await doc(t, o))!;
      expect(d).not.toHaveProperty("aperturaDiId");
      // stessa coppia (partenza, venue): stesso km, nessuna estrazione nuova
      expect(d).toMatchObject({ date: "17/06/2026", km: kmSerata, kmSource: "calcolato" });
    }
    // un solo lotto: la cancellazione e le due aperture scollegate
    const voci = (await a.as.query(api.activity.list, {})).voci as { id: string; riassunto: string; lotto?: string }[];
    const canc = voci.find(v => v.riassunto.startsWith("cancellato: Lewis Capaldi"))!;
    expect(voci.filter(v => v.lotto && v.lotto === canc.lotto)).toHaveLength(3);

    await a.as.mutation(api.activity.undo, { input: { activityId: canc.id } });
    const righe = await tutte(t);
    const nuovo = righe.find(e => e.artist === "Lewis Capaldi")!;
    expect(nuovo._id).not.toBe(h);
    expect(nuovo.km).toBe(kmSerata);
    for (const o of [o1, o2]) {
      const d = (await doc(t, o))!;
      expect(d.aperturaDiId).toBe(nuovo._id);
      expect(d).not.toHaveProperty("km");
      expect(d.venueId).toBe(nuovo.venueId);
    }
    expect(righe).toHaveLength(3);
  });

  it("Annulla dell'aggiunta di un headliner che ha aperture: in_uso", async () => {
    const t = setup();
    const a = await profilo(t);
    await add(a.as, { artist: "Lewis Capaldi", date: "17/06/2026" });
    await add(a.as, { artist: "Temper City", date: "17/06/2026", aperturaDi: "Lewis Capaldi" });
    const voci = (await a.as.query(api.activity.list, {})).voci as { id: string; riassunto: string }[];
    const creato = voci.find(v => v.riassunto.startsWith("aggiunto: Lewis Capaldi"))!;
    expect(await errore(a.as.mutation(api.activity.undo, { input: { activityId: creato.id } }))).toMatchObject({ code: "in_uso" });
  });
});

describe("aperture: import CSV", () => {
  const INTESTAZIONE_VECCHIA = "tipo,data,data_concerto,artista,festival,venue,citta,con,voto,vicinanza,canzoni_note,costo,regalo,regalato_da,accredito,partenza,commento,tour";

  it("un CSV di prima (senza apertura_di) importa ancora", async () => {
    const t = setup();
    const a = await profilo(t);
    const csv = `${INTESTAZIONE_VECCHIA}\nconcerto,17/06/2026,,Lewis Capaldi,,Fiera Milano Live,Rho,,,,,105.84,,,,Casa,,\n`;
    const r = await a.as.action(api.importer.apply, { input: { formato: "csv", contenuto: csv } });
    expect(r).toMatchObject({ importate: 1 });
  });

  it("apertura_di: l'headliner nello stesso file (anche dopo) o già salvato; le aperture si scrivono dopo e si collegano", async () => {
    const t = setup();
    const a = await profilo(t);
    await add(a.as, { artist: "Paolo Nutini", date: "22/06/2024", venue: "Fabrique", city: "Milano", from: "Casa" });
    const csv = [
      `${INTESTAZIONE_VECCHIA},apertura_di`,
      "concerto,17/06/2026,,Temper City,,Fiera Milano Live,Rho,,3,5,1,0,,,,Casa,,,Lewis Capaldi",
      "concerto,17/06/2026,,Lewis Capaldi,,Fiera Milano Live,Rho,,3,4,3,105.84,,,,Casa,,,",
      "concerto,22/06/2024,,Michael Kiwanuka,,Fabrique,Milano,,4,5,2,0,,,,Casa,,,Paolo Nutini",
    ].join("\n");
    const anteprima = await a.as.query(api.importer.preview, { input: { formato: "csv", contenuto: csv } });
    expect(anteprima.errori).toEqual([]);
    await a.as.action(api.importer.apply, { input: { formato: "csv", contenuto: csv } });
    const righe = await tutte(t);
    const per = (artista: string) => righe.find(e => e.artist === artista)!;
    expect(per("Temper City").aperturaDiId).toBe(per("Lewis Capaldi")._id);
    expect(per("Michael Kiwanuka").aperturaDiId).toBe(per("Paolo Nutini")._id);
    expect(per("Temper City")).not.toHaveProperty("km");
    // un headliner sconosciuto è un errore di riga, nell'anteprima e nell'import
    const sbagliato = `${INTESTAZIONE_VECCHIA},apertura_di\nconcerto,01/01/2026,,X,,Fabrique,Milano,,,,,,,,,,,,Nessuno\n`;
    const p = await a.as.query(api.importer.preview, { input: { formato: "csv", contenuto: sbagliato } });
    expect(p.errori).toEqual([expect.objectContaining({ riga: 2, campo: "apertura_di" })]);
    expect(await errore(a.as.action(api.importer.apply, { input: { formato: "csv", contenuto: sbagliato } }))).toMatchObject({ code: "input_non_valido" });
  });
});
