import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { haversineKm, J_MAX, J_MIN } from "./lib/km.ts";
import { codiceDi } from "./lib/errors.ts";
import { setup, type T } from "./test.setup";

/* Punti pubblici qualunque, MAI le coordinate di casa di nessuno: piazza del
   Duomo a Milano e, per le uscite, il canarino di e2e/helpers/canarino.ts. */
const PUNTO_MILANO: [number, number] = [9.1919, 45.4642];

const codice = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return codiceDi(e);
  }
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** gabrifila dal seed, legata a un utente, con un concerto in attesa su "Milano". */
async function gabri(t: T) {
  await t.mutation(internal.seed.ensure, {});
  const { pid, milano } = await t.run(async ctx => {
    const p = (await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", "gabrifila")).first())!;
    await ctx.db.patch(p._id, { authUserId: "u-gabri" });
    const d = (await ctx.db.query("departures").withIndex("by_profile", q => q.eq("profileId", p._id)).collect()).find(x => x.name === "Milano")!;
    return { pid: p._id, milano: d._id };
  });
  const as = t.withIdentity({ subject: "u-gabri", sessionId: "s" });
  return { as, pid, milano };
}

async function confermaCandidato(t: T, as: ReturnType<T["withIdentity"]>, profileId: Id<"profiles">, departureId: Id<"departures">, lng: number, lat: number, label = "Canarini 7, Genova") {
  await t.mutation(internal.departures.saveDraft, { profileId, departureId, candidates: [{ label, lng, lat }] });
  const r = await as.mutation(api.departures.confirmAddress, { input: { departureId, indice: 0 } });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return r;
}

const kmMilano = (t: T, pid: Id<"profiles">, milano: Id<"departures">) =>
  t.run(async ctx => (await ctx.db.query("entries").withIndex("by_profile_departure", q => q.eq("profileId", pid).eq("departureId", milano)).collect()).map(e => ({ id: e._id, km: e.km, source: e.kmSource, pending: e.kmPending, venueId: e.venueId })));

describe("partenze e km", () => {
  it("il primo indirizzo non ricalcola i km legacy; calcola solo quelli in attesa", async () => {
    const t = setup();
    const { as, pid, milano } = await gabri(t);
    // un concerto nuovo da Milano verso una venue senza coppia: in attesa
    await as.mutation(api.entries.add, { input: { kind: "concert", date: "01/12/2026", artist: "Nuovo", venue: "Stadio Olimpico", city: "Roma", from: "Milano" } });
    const prima = await kmMilano(t, pid, milano);
    expect(prima.filter(e => e.pending).length).toBe(1);
    const r = await confermaCandidato(t, as, pid, milano, ...PUNTO_MILANO);
    expect(r).toMatchObject({ ok: true, correzione: false });
    const dopo = await kmMilano(t, pid, milano);
    for (const e of prima.filter(x => !x.pending)) expect(dopo.find(x => x.id === e.id)).toMatchObject({ km: e.km, source: "legacy" });
    const nuovo = dopo.find(x => prima.find(p => p.id === x.id)?.pending)!;
    expect(nuovo.pending).toBeUndefined();
    expect(nuovo.source).toBe("calcolato");
    expect(nuovo.km).toBeGreaterThan(500); // Milano → Roma
  });

  it("la correzione ricalcola tutte le coppie nel range della ricetta (una al giorno)", async () => {
    const t = setup();
    const { as, pid, milano } = await gabri(t);
    await confermaCandidato(t, as, pid, milano, ...PUNTO_MILANO);
    const casa: [number, number] = [9.2, 45.48];
    const r = await confermaCandidato(t, as, pid, milano, ...casa);
    expect(r).toMatchObject({ correzione: true });
    const venues = new Map((await t.run(async ctx => (await ctx.db.query("venues").collect()).map(v => ({ id: v._id as string, lng: v.lng, lat: v.lat })))).map(v => [v.id, [v.lng, v.lat] as [number, number]]));
    const dopo = await kmMilano(t, pid, milano);
    expect(dopo.length).toBeGreaterThan(10);
    for (const e of dopo) {
      const d = haversineKm(casa, venues.get(e.venueId)!);
      const f = d * (1.2 + 0.25 * Math.exp(-d / 20));
      expect(e.source).toBe("calcolato");
      expect(e.km!).toBeGreaterThanOrEqual(Math.round(f * J_MIN) - 1);
      expect(e.km!).toBeLessThanOrEqual(Math.round(f * J_MAX) + 1);
    }
    // seconda correzione nello stesso giorno: rifiutata
    await t.mutation(internal.departures.saveDraft, { profileId: pid, departureId: milano, candidates: [{ label: "x", lng: 9, lat: 45 }] });
    expect(await codice(as.mutation(api.departures.confirmAddress, { input: { departureId: milano, indice: 0 } }))).toBe("limite_superato");
  });

  it("riconfermare lo stesso punto non è una correzione: nessuna nuova estrazione, nessun limite consumato", async () => {
    const t = setup();
    const { as, pid, milano } = await gabri(t);
    await confermaCandidato(t, as, pid, milano, ...PUNTO_MILANO);
    // una correzione vera ricalcola tutte le coppie (da qui i km sono "calcolato")
    await confermaCandidato(t, as, pid, milano, 9.2, 45.48);
    const prima = await kmMilano(t, pid, milano);
    const coppie = async () => t.run(async ctx => (await ctx.db.query("kmPairs").withIndex("by_departure", q => q.eq("departureId", milano)).collect()).map(c => [c.venueId, c.km, c.drawnAt]));
    const coppiePrima = await coppie();
    // lo stesso punto (a meno di 50 m), più volte e con un'etichetta diversa
    for (const [lng, lat, label] of [[9.2, 45.48, "Canarini 7, Genova"], [9.2003, 45.4801, "Via dei Canarini 7, 16100 Genova"]] as const) {
      const r = await confermaCandidato(t, as, pid, milano, lng, lat, label);
      expect(r).toMatchObject({ ok: true, correzione: false, stessoPunto: true });
    }
    expect(await kmMilano(t, pid, milano)).toEqual(prima);
    expect(await coppie()).toEqual(coppiePrima);
  });

  it("le coordinate non escono mai (agenti, pagina pubblica, registro)", async () => {
    const t = setup();
    const { as, pid, milano } = await gabri(t);
    await confermaCandidato(t, as, pid, milano, 8.9345678, 44.4123456);
    const uscite = JSON.stringify([
      await as.query(api.departures.list, {}),
      await t.query(api.pages.byHandle, { handle: "gabrifila" }),
      await as.query(api.activity.list, {}),
      await as.query(api.entries.list, {}),
    ]);
    for (const s of ["8.9345", "44.4123", "Canarini"]) expect(uscite).not.toContain(s);
    expect(JSON.stringify(await as.query(api.departures.list, {}))).toContain("impostato");
  });
});
