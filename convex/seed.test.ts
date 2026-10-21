/* Il seed conserva i dati di oggi (PIANO §5.6): KPI e aggregati identici tra
   i dati statici e pages.byHandle, km identici riga per riga, coppie km
   coerenti, idempotenza. */

import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { buildDataset } from "../shared/lib/dataset.ts";
import { computeKpis } from "../shared/lib/kpis.ts";
import { pageToDataset, type PaginaPubblica } from "../shared/lib/pageToDataset.ts";
import { flatConcerts } from "../shared/model/concert.ts";
import { ALLDATA, GABRIFILA_INPUT } from "../shared/seed/gabrifila.ts";
import { setup } from "./test.setup";

const NOW = Date.parse("2026-10-21T12:00:00+02:00");

async function seminato() {
  const t = setup();
  const r = await t.mutation(internal.seed.ensure, {});
  const page = (await t.query(api.pages.byHandle, { handle: "gabrifila" })) as PaginaPubblica;
  return { t, r, page };
}

describe("seed:ensure", () => {
  it("porta 84 righe (91 concerti, 2 festival), 49 persone, 1 regalato da, 2 partenze legacy", async () => {
    const { r, page } = await seminato();
    expect(r).toMatchObject({ entries: 84, people: 49, gifters: 1, departures: 2, wishlist: 13 });
    expect(page.entries.length).toBe(84);
    expect(page.entries.filter(e => e.kind === "festival").length).toBe(2);
    expect(flatConcerts(pageToDataset(page).entries).length).toBe(91);
    expect(page.departures.map(d => d.name).sort()).toEqual(["Genova", "Milano"]);
    expect(page.gifters[0]).toMatchObject({ label: "Wiseair", url: "https://wiseair.vision", logoUrl: "https://wiseair.vision/favicon.svg" });
    expect(page.profile).toMatchObject({ handle: "gabrifila", displayName: "Gabri", forma: "m" });
  });

  it("KPI e aggregati identici tra i dati statici e pages.byHandle", async () => {
    const { page } = await seminato();
    const daConvex = pageToDataset(page);
    // numeri, etichette e suggerimenti; delle righe sorgente contano le date (i pallini)
    const vista = (ks: ReturnType<typeof computeKpis>) => ks.map(k => ({ ...k, src: k.src.map(r => r.date) }));
    expect(vista(computeKpis(daConvex.entries, NOW))).toEqual(vista(computeKpis(ALLDATA, NOW)));
    const a = buildDataset(daConvex);
    const b = buildDataset(GABRIFILA_INPUT);
    for (const k of ["cities", "people", "vic", "cn", "dateLo", "dateHi", "costMax", "kmMax", "vocab", "wishlist"] as const) {
      expect(a[k], k).toEqual(b[k]);
    }
    expect(a.venueCoords).toEqual(Object.fromEntries(Object.entries(b.venueCoords).filter(([n]) => ALLDATA.some(e => e.venue === n))));
  });

  it("km identici riga per riga", async () => {
    const { page } = await seminato();
    const daConvex = pageToDataset(page).entries;
    expect(daConvex.length).toBe(ALLDATA.length);
    daConvex.forEach((e, i) => {
      expect(e.date, `riga ${i}`).toBe(ALLDATA[i].date);
      expect(e.km, `riga ${i}`).toBe(ALLDATA[i].km);
      expect(!!e.from, `riga ${i}`).toBe(!!ALLDATA[i].from);
    });
    expect(page.entries.every(e => (e.km === undefined) === !e.departureId || e.kmPending)).toBe(true);
  });

  it("coppie km coerenti: una per (partenza, venue), mai valori diversi nei dati di oggi", async () => {
    const { t, page } = await seminato();
    const valori = new Map<string, Set<number>>();
    for (const e of ALLDATA) {
      if (!e.from || typeof e.km !== "number") continue;
      const k = `${e.from}|${e.venue}|${e.city}`;
      if (!valori.has(k)) valori.set(k, new Set());
      valori.get(k)!.add(e.km);
    }
    expect([...valori.entries()].filter(([, s]) => s.size > 1).map(([k]) => k)).toEqual([]);
    const coppie = await t.run(async ctx => await ctx.db.query("kmPairs").collect());
    expect(coppie.length).toBe(valori.size);
    expect(coppie.every(c => c.source === "legacy")).toBe(true);
    // ogni concerto ha il km della sua coppia
    for (const e of page.entries.filter(x => x.departureId && x.km !== undefined)) {
      const c = coppie.find(x => x.departureId === e.departureId && x.venueId === e.venueId);
      expect(c?.km).toBe(e.km);
    }
  });

  it("è idempotente", async () => {
    const { t, page } = await seminato();
    const r2 = await t.mutation(internal.seed.ensure, {});
    expect(r2).toMatchObject({ entries: 0, people: 0, venues: 0, cities: 0, gifters: 0, departures: 0, wishlist: 0 });
    const page2 = await t.query(api.pages.byHandle, { handle: "gabrifila" });
    expect(page2).toEqual(page);
  });
});
