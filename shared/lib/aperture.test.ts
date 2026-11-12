/* Le aperture del seed (Kiwanuka per Nutini, Bove e Temper City per Capaldi):
   venue e viaggi contano la serata una volta, soldi e concerti restano per
   riga; il filtro «Includi aperture». */

import { describe, expect, it } from "vitest";
import { GABRIFILA_INPUT } from "../seed/gabrifila.ts";
import { flatConcerts, headlinerDi, isFestival, serateOf, type Concert, type Entry } from "../model/concert.ts";
import { counter, sum } from "./aggregate.ts";
import { buildDataset } from "./dataset.ts";
import { todayKey } from "./dates.ts";
import { applyFilters, countActive, describeFilters, isEmptyFilters } from "./filters.ts";
import { computeKpis } from "./kpis.ts";
import { distKm, hasCost } from "./predicates.ts";

const NOW = Date.parse("2026-10-21T12:00:00+02:00");
const TODAY = todayKey(NOW);
const ds = buildDataset(GABRIFILA_INPUT);
const fiera = (rows: Entry[]) => rows.filter(e => e.venue === "Fiera Milano Live");

describe("aperture del seed", () => {
  it("ogni apertura trova il suo headliner (stessa data e venue)", () => {
    const aperture = ds.flat.filter(c => c.headliner);
    expect(aperture.map(c => `${c.artist} → ${c.headliner!.artist}`).sort()).toEqual([
      "Angelica Bove → Lewis Capaldi", "Michael Kiwanuka → Paolo Nutini", "Temper City → Lewis Capaldi",
    ]);
    for (const c of aperture) expect([c.date, c.venue]).toEqual([c.headliner!.date, c.headliner!.venue]);
  });

  it("venue: Fiera Milano Live è una serata sola, La Prima Estate pure", () => {
    expect(fiera(ds.entries)).toHaveLength(3);
    expect(fiera(serateOf(ds.entries))).toHaveLength(1);
    const visite = counter(serateOf(ds.entries), "venue");
    expect(visite["Fiera Milano Live"]).toBe(1);
    expect(visite["La Prima Estate"]).toBe(1);
  });

  it("km: i 13 km della serata di Capaldi contano una volta", () => {
    const km = (rows: Entry[]) => sum(rows.map(distKm).filter((k): k is number => k !== null));
    expect(km(fiera(serateOf(ds.entries)))).toBe(13);
    // le aperture non hanno km propri: anche sommando le righe la serata conta una volta
    expect(km(fiera(ds.entries))).toBe(13);
    expect(ds.entries.filter(e => !isFestival(e) && e.aperturaDi).every(e => e.km === undefined)).toBe(true);
  });

  it("soldi invariati: ogni riga tiene il suo biglietto, aperture comprese (0 €)", () => {
    expect(fiera(ds.entries).filter(hasCost).map(e => e.cost).sort()).toEqual([0, 0, 105.84]);
    const k = Object.fromEntries(computeKpis(ds.entries, NOW).map(x => [x.id, x]));
    expect(k.speso.value).toBe("€3375");
    expect(k.speso.hint).toBe("68 biglietti");
  });

  it("artisti visti: un'apertura conta come concerto e come artista", () => {
    const artisti = new Set(flatConcerts(ds.entries).map(c => c.artist));
    expect(artisti.has("Temper City")).toBe(true);
    expect(artisti.has("Michael Kiwanuka")).toBe(true);
    expect(fiera(ds.entries).flatMap(e => flatConcerts([e]))).toHaveLength(3);
  });
});

describe("serateOf con i filtri", () => {
  const h: Concert = { y: 2025, date: "01/03/2025", artist: "Headliner", venue: "V", city: "C", with: ["A"], from: "casa", km: 50 };
  const o: Concert = { y: 2025, date: "01/03/2025", artist: "Apre", venue: "V", city: "C", with: ["B"], from: "casa", aperturaDi: "headliner" };
  const piccolo = buildDataset({ entries: [h, o] });

  it("un'apertura senza il suo headliner nelle righe filtrate porta la serata dell'headliner", () => {
    const soloB = applyFilters(piccolo.entries, { ...piccolo.emptyFilters, people: ["B"] }, piccolo.bounds, TODAY);
    expect(soloB).toEqual([o]);
    expect(headlinerDi(o)).toBe(h);
    expect(serateOf(soloB)).toEqual([h]);
    expect(computeKpis(soloB, NOW).find(k => k.id === "km")!.value).toBe("100");
  });

  it("la fascia di km guarda il viaggio della serata", () => {
    const dentro = applyFilters(piccolo.entries, { ...piccolo.emptyFilters, kmMin: 40, kmMax: 50 }, piccolo.bounds, TODAY);
    expect(dentro).toHaveLength(2);
  });
});

describe("filtro «Includi aperture»", () => {
  it("è attivo di default; spento toglie le aperture e conta come filtro", () => {
    const f = ds.emptyFilters;
    expect(f.aperture).toBe(true);
    expect(isEmptyFilters(f, ds.bounds)).toBe(true);
    const senza = { ...f, aperture: false };
    expect(applyFilters(ds.entries, senza, ds.bounds, TODAY)).toHaveLength(ds.entries.length - 3);
    expect(isEmptyFilters(senza, ds.bounds)).toBe(false);
    expect(countActive(senza, ds.bounds)).toBe(1);
    expect(describeFilters(senza, ds.bounds)).toBe("senza aperture");
  });
});
