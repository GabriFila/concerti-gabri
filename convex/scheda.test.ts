/* entries.salvaScheda: il Salva della scheda dell'Oracolo (propose_concert).
   Un solo lotto con i nomi nuovi (persone, "regalato da", partenza solo
   col nome), autore "Oracolo", km subito; un Annulla toglie tutto; niente
   scritto quando qualcosa non va (venue fuori catalogo, partenza che sembra
   un indirizzo); solo l'Oracolo (dashboard e agenti → solo_oracolo); gli
   id altrui → not_found; gli errori non ripetono i valori. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { codiceDi } from "./lib/errors.ts";
import { conProfilo, setup, venue, type T } from "./test.setup";

/* Un punto pubblico qualunque (piazza del Duomo a Milano), MAI le coordinate di casa di nessuno. */
const PUNTO_MILANO: [number, number] = [9.1919, 45.4642];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type Client = Awaited<ReturnType<typeof conProfilo>>["as"];

const salva = (as: Client, proposta: Record<string, unknown>) => as.mutation(api.entries.salvaScheda, { as: "oracolo", input: { proposta } });

async function errore(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return { code: codiceDi(e), data: (e as { data?: Record<string, unknown> }).data ?? {}, testo: JSON.stringify((e as { data?: unknown }).data) + String((e as Error).message) };
  }
  throw new Error("doveva fallire");
}

/** Quante righe ha il profilo, per tabella. */
const conta = (t: T, profileId: Id<"profiles">) =>
  t.run(async ctx => {
    const out: Record<string, number> = {};
    for (const tab of ["entries", "people", "gifters", "departures", "activity"] as const) {
      out[tab] = (await ctx.db.query(tab).collect()).filter(d => (d as { profileId?: string }).profileId === profileId).length;
    }
    return out;
  });

async function proprietario(t: T, user = "u-a", handle = "utente-a") {
  const a = await conProfilo(t, user, handle);
  return a;
}

describe("entries.salvaScheda", () => {
  it("aggiunta con persona, \"regalato da\" e partenza nuovi: un lotto, autore Oracolo, «dall'Oracolo»; un Annulla toglie tutto", async () => {
    const t = setup();
    const a = await proprietario(t);
    await venue(t, "Fabrique", "Milano", 9.25, 45.45);
    const prima = await conta(t, a.profileId);
    const r = await salva(a.as, {
      artist: "Verdena", date: "2025-10-18", venue: "Fabrique", city: "Milano",
      with: ["Marco R.", "marco r."], giftFrom: "Mamma", from: "Ufficio", voto: 5, canzoniNote: "4",
    });
    expect(r).toMatchObject({
      azione: "aggiunto",
      creati: { persone: ["Marco R."], partenza: "Ufficio", regalatoDa: "Mamma" },
      dopo: { kind: "concert", artist: "Verdena", date: "18/10/2025", venue: "Fabrique", city: "Milano", with: ["Marco R."], gift: true, giftFrom: "Mamma", from: "Ufficio", voto: 5, canzoniNote: 4, kmPending: true },
    });
    expect(r.prima).toBeUndefined();
    const voci = (await a.as.query(api.activity.list, {})).voci;
    expect(voci).toHaveLength(4);
    expect(new Set(voci.map(v => v.lotto)).size).toBe(1);
    expect(voci[0].lotto).toBeTruthy();
    expect(voci.every(v => v.autore === "Oracolo" && v.via === "oracolo")).toBe(true);
    expect(voci.map(v => v.riassunto).sort()).toEqual([
      "\"regalato da\" aggiunto dall'Oracolo: Mamma",
      "aggiunto: Verdena (18/10/2025)",
      "partenza aggiunta dall'Oracolo: Ufficio",
      "persona aggiunta dall'Oracolo: Marco R.",
    ]);
    expect(voci.find(v => v.id === r.activityId)?.riassunto).toBe("aggiunto: Verdena (18/10/2025)");
    // la partenza nuova non ha indirizzo
    expect((await a.as.query(api.departures.list, {})).departures).toEqual([expect.objectContaining({ name: "Ufficio", stato: "mancante" })]);

    // Annulla (dalla dashboard, come il bottone della scheda): via concerto, persona, "regalato da" e partenza
    await a.as.mutation(api.activity.undo, { input: { activityId: r.activityId } });
    const dopo = await conta(t, a.profileId);
    expect({ ...dopo, activity: 0 }).toEqual({ ...prima, activity: 0 });
    expect((await a.as.query(api.activity.list, {})).voci.filter(v => v.annullata)).toHaveLength(4);
  });

  it("km subito se la partenza ha l'indirizzo (calcolato), in attesa se no", async () => {
    const t = setup();
    const a = await proprietario(t);
    await venue(t, "Fabrique", "Milano", 9.25, 45.45);
    const { id: casa } = await a.as.mutation(api.departures.add, { input: { name: "Casa" } });
    await t.mutation(internal.departures.saveDraft, { profileId: a.profileId, departureId: casa as Id<"departures">, candidates: [{ label: "Piazza del Duomo, Milano", lng: PUNTO_MILANO[0], lat: PUNTO_MILANO[1] }] });
    await a.as.mutation(api.departures.confirmAddress, { input: { departureId: casa, indice: 0 } });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const r = await salva(a.as, { artist: "Verdena", date: "2025-10-18", venue: "Fabrique", city: "Milano", from: "Casa" });
    expect(r.dopo.km).toBeGreaterThan(0);
    expect(r.dopo.kmPending).toBeUndefined();
    const doc = await t.run(async ctx => await ctx.db.get(r.id as Id<"entries">));
    expect(doc).toMatchObject({ kmSource: "calcolato" });
    // nel risultato solo il nome della partenza e i km: niente coordinate né indirizzo
    expect(JSON.stringify(r)).not.toMatch(/9\.19|45\.46|Duomo|"(lat|lng|address|indirizzo)"/);

    const senza = await salva(a.as, { artist: "Verdena", date: "2025-10-19", venue: "Fabrique", city: "Milano", from: "Seconda casa" });
    expect(senza.dopo).toMatchObject({ kmPending: true });
    expect(senza.dopo.km).toBeUndefined();
  });

  it("modifica: prima e dopo, un lotto con la persona nuova; Annulla rimette il voto e toglie la persona", async () => {
    const t = setup();
    const a = await proprietario(t);
    await venue(t, "Fabrique", "Milano", 9.25, 45.45);
    const { id } = await a.as.mutation(api.entries.add, { input: { kind: "concert", date: "18/10/2025", artist: "Verdena", venue: "Fabrique", city: "Milano", with: [], voto: 5 } });
    const r = await salva(a.as, { id, voto: 4, with: ["Lu"], remove: ["voto", "canzoniNote"] });
    expect(r).toMatchObject({ azione: "modificato", id, prima: { voto: 5, with: [] }, dopo: { voto: 4, with: ["Lu"] }, creati: { persone: ["Lu"] } });
    const voci = (await a.as.query(api.activity.list, {})).voci.filter(v => v.lotto);
    expect(voci.map(v => v.riassunto).sort()).toEqual(["modificato: Verdena (18/10/2025)", "persona aggiunta dall'Oracolo: Lu"]);
    expect(new Set(voci.map(v => v.lotto)).size).toBe(1);
    expect(voci.every(v => v.autore === "Oracolo")).toBe(true);

    await a.as.mutation(api.activity.undo, { input: { activityId: r.activityId } });
    expect(await a.as.query(api.entries.get, { input: { id } })).toMatchObject({ voto: 5, with: [] });
    expect((await a.as.query(api.people.list, {})).people).toEqual([]);
  });

  it("modifica di un festival: la lineup si unisce per artista, remove_concerts toglie", async () => {
    const t = setup();
    const a = await proprietario(t);
    await venue(t, "Fabrique", "Milano", 9.25, 45.45);
    const { id } = await a.as.mutation(api.entries.add, {
      input: { kind: "festival", name: "MI AMI", date: "30–31/05/2025", venue: "Fabrique", city: "Milano", concerts: [{ artist: "Verdena", with: [], voto: 3 }, { artist: "Calcutta", with: [] }] },
    });
    const r = await salva(a.as, { id, concerts: [{ artist: "verdena", voto: 5 }, { artist: "Afterhours", with: ["Lu"] }], remove_concerts: ["Calcutta"] });
    expect(r.dopo.concerts).toEqual([
      expect.objectContaining({ artist: "Verdena", voto: 5 }),
      expect.objectContaining({ artist: "Afterhours", with: ["Lu"] }),
    ]);
    expect(r.creati.persone).toEqual(["Lu"]);
    // un festival non ha voto suo
    const e = await errore(salva(a.as, { id, voto: 4 }));
    expect(e).toMatchObject({ code: "input_non_valido", data: { campo: "voto" } });
  });

  it("venue fuori catalogo: nome_sconosciuto sul campo venue e niente scritto (nemmeno le persone)", async () => {
    const t = setup();
    const a = await proprietario(t);
    const prima = await conta(t, a.profileId);
    const e = await errore(salva(a.as, { artist: "Verdena", date: "2025-10-18", venue: "Locale Ignoto", city: "Milano", with: ["Nuovo"], from: "Ufficio" }));
    expect(e).toMatchObject({ code: "nome_sconosciuto", data: { campo: "venue" } });
    expect(await conta(t, a.profileId)).toEqual(prima);
  });

  it("una partenza nuova che sembra un indirizzo: input_non_valido sul campo from e niente scritto", async () => {
    const t = setup();
    const a = await proprietario(t);
    await venue(t, "Fabrique", "Milano", 9.25, 45.45);
    const prima = await conta(t, a.profileId);
    const CANARINO = "Via dei Canarini 7";
    const e = await errore(salva(a.as, { artist: "Verdena", date: "2025-10-18", venue: "Fabrique", city: "Milano", with: ["Nuovo"], from: CANARINO }));
    expect(e).toMatchObject({ code: "input_non_valido", data: { campo: "from" } });
    expect(e.testo).not.toContain("Canarini");
    expect(await conta(t, a.profileId)).toEqual(prima);
  });

  it("scheda incompleta o con valori sbagliati: input_non_valido col campo, senza ripetere i valori", async () => {
    const t = setup();
    const a = await proprietario(t);
    await venue(t, "Fabrique", "Milano", 9.25, 45.45);
    const vuota = await errore(salva(a.as, {}));
    expect(vuota).toMatchObject({ code: "input_non_valido" });
    const data = await errore(salva(a.as, { artist: "X", date: "Via dei Canarini 7", venue: "Fabrique", city: "Milano" }));
    expect(data).toMatchObject({ code: "input_non_valido", data: { campo: "date" } });
    expect(data.testo).not.toContain("Canarini");
    // un voto fuori scala non passa nemmeno dallo schema della proposta
    expect((await errore(salva(a.as, { artist: "X", date: "2025-01-01", venue: "Fabrique", city: "Milano", voto: 7 }))).code).toBe("input_non_valido");
    expect((await a.as.query(api.entries.list, {})).concerts).toEqual([]);
  });

  it("solo l'Oracolo: la dashboard (senza as) → solo_oracolo; l'id di un altro profilo → not_found", async () => {
    const t = setup();
    const a = await proprietario(t);
    const b = await proprietario(t, "u-b", "utente-b");
    await venue(t, "Fabrique", "Milano", 9.25, 45.45);
    const proposta = { artist: "X", date: "2025-01-01", venue: "Fabrique", city: "Milano" };
    expect((await errore(a.as.mutation(api.entries.salvaScheda, { input: { proposta } }))).code).toBe("solo_oracolo");
    const { id } = await a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/01/2025", artist: "X", venue: "Fabrique", city: "Milano", with: [] } });
    expect((await errore(salva(b.as, { id, voto: 3 }))).code).toBe("not_found");
    expect(await a.as.query(api.entries.get, { input: { id } })).not.toHaveProperty("voto");
  });
});
