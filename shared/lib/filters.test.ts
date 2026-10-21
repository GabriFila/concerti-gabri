/* I filtri della dashboard sui dati di gabrifila: AND tra dimensioni, OR
   dentro una dimensione, criteri per concerto che restringono i festival ai
   set che corrispondono, fasce di costo e km che scattano solo se ristrette. */

import { describe, expect, it } from "vitest";
import { GABRIFILA_INPUT } from "../../src/data.ts";
import { flatConcerts, isFestival, type Entry } from "../model/concert.ts";
import { buildDataset } from "./dataset.ts";
import { isPlanned, sortKey, todayKey } from "./dates.ts";
import {
  applyFilters, countActive, describeFilters, emptyFilters, isEmptyFilters, mergeToolFilters, type Filters,
} from "./filters.ts";
import { distKm, hasCost } from "./predicates.ts";

const NOW = Date.parse("2026-10-21T12:00:00+02:00");
const TODAY = todayKey(NOW);
const ds = buildDataset(GABRIFILA_INPUT);
const B = ds.bounds;
const F = (over: Partial<Filters> = {}): Filters => ({ ...ds.emptyFilters, ...over });
const run = (over: Partial<Filters>) => applyFilters(ds.entries, F(over), B, TODAY);
const counts = (rows: Entry[]) => ({ events: rows.length, concerts: flatConcerts(rows).length });

describe("applyFilters", () => {
  it("senza filtri restituisce tutte le righe, invariate", () => {
    const rows = run({});
    expect(rows).toHaveLength(84);
    expect(rows.every((r, i) => r === ds.entries[i])).toBe(true);
    expect(flatConcerts(rows)).toHaveLength(91);
  });

  it("stato: già visti e in programma si dividono le righe, oggi a Roma", () => {
    expect(counts(run({ status: "attended" }))).toEqual({ events: 73, concerts: 80 });
    expect(counts(run({ status: "planned" }))).toEqual({ events: 11, concerts: 11 });
    expect(run({ status: "planned" }).every(r => isPlanned(r, TODAY))).toBe(true);
  });

  it("date: estremi inclusi, sul primo giorno dell'evento", () => {
    const y2025 = run({ dateFrom: "2025-01-01", dateTo: "2025-12-31" });
    expect(counts(y2025)).toEqual({ events: 16, concerts: 16 });
    expect(y2025.every(r => sortKey(r) >= 20250101 && sortKey(r) <= 20251231)).toBe(true);
    const day = run({ dateFrom: "2026-11-18", dateTo: "2026-11-18" });
    expect(day.map(r => r.date)).toEqual(["18/11/2026"]);
  });

  it("città e persone: OR dentro la dimensione, AND tra dimensioni", () => {
    const genova = run({ cities: ["Genova"] });
    expect(genova).toHaveLength(18);
    const both = run({ cities: ["Genova", "Milano"] });
    expect(both.length).toBe(genova.length + run({ cities: ["Milano"] }).length);
    const cami = run({ people: ["Cami <3"] });
    expect(counts(cami)).toEqual({ events: 28, concerts: 29 });
    const camiGenova = run({ people: ["Cami <3"], cities: ["Genova"] });
    expect(camiGenova.every(r => r.city === "Genova")).toBe(true);
    expect(camiGenova.length).toBeLessThan(Math.min(cami.length, genova.length));
  });

  it("un festival resta se almeno un set corrisponde, ristretto a quei set", () => {
    const cami = run({ people: ["Cami <3"] });
    const miami = cami.find(r => isFestival(r) && r.name === "MI AMI 2026");
    expect(miami && isFestival(miami) ? miami.concerts.length : 0).toBe(2);
    // la riga originale non si tocca
    const orig = ds.entries.find(r => isFestival(r) && r.name === "MI AMI 2026");
    expect(orig && isFestival(orig) ? orig.concerts.length : 0).toBe(6);
    // nessun set con Marco D al MI AMI 2023: il festival sparisce
    expect(run({ people: ["Marco D"] }).some(r => isFestival(r) && r.name === "MI AMI 2023")).toBe(false);
  });

  it("da solo: i set senza compagni, anche dentro un festival con compagnia", () => {
    const solo = run({ solo: true });
    expect(counts(solo)).toEqual({ events: 11, concerts: 12 });
    expect(flatConcerts(solo).every(c => !c.with || c.with.length === 0)).toBe(true);
  });

  it("vicinanza e canzoni note filtrano per set e ignorano i valori assenti", () => {
    expect(counts(run({ vicinanze: [6] }))).toEqual({ events: 7, concerts: 7 });
    expect(flatConcerts(run({ vicinanze: [6] })).every(c => c.vicinanza === 6)).toBe(true);
    expect(counts(run({ canzoni: [1, 2] }))).toEqual({ events: 21, concerts: 25 });
  });

  it("prezzo: pagati, regali, accrediti e sconosciuti sono insiemi disgiunti", () => {
    const paid = run({ price: "paid" }), gift = run({ price: "gift" });
    const accr = run({ price: "accredito" }), unknown = run({ price: "unknown" });
    expect([paid.length, gift.length, accr.length, unknown.length]).toEqual([68, 8, 2, 6]);
    expect(paid.length + gift.length + accr.length + unknown.length).toBe(84);
  });

  it("fascia di costo: vale solo se ristretta, e allora ammette solo i prezzi nella fascia", () => {
    // fascia piena = nessun filtro: regali e sconosciuti restano
    expect(run({ costMin: B.costMin, costMax: B.costMax })).toHaveLength(84);
    const cheap = run({ costMin: 0, costMax: 50 });
    expect(cheap).toHaveLength(41);
    expect(cheap.every(r => hasCost(r) && r.cost <= 50)).toBe(true);
  });

  it("fascia di km: come il costo, solo eventi con distanza nota", () => {
    expect(run({ kmMin: B.kmMin, kmMax: B.kmMax })).toHaveLength(84);
    const near = run({ kmMin: 0, kmMax: 20 });
    expect(near).toHaveLength(64);
    expect(near.every(r => { const k = distKm(r); return k !== null && k <= 20; })).toBe(true);
  });

  it("il giorno di oggi arriva da fuori: a mezzanotte di Roma il concerto passa tra i visti", () => {
    const before = applyFilters(ds.entries, F({ status: "planned" }), B, todayKey(Date.parse("2026-11-18T22:59:00Z")));
    const after = applyFilters(ds.entries, F({ status: "planned" }), B, todayKey(Date.parse("2026-11-18T23:00:00Z")));
    expect(before.length - after.length).toBe(1);
  });
});

describe("stato dei filtri", () => {
  it("emptyFilters dipende dagli estremi del dataset", () => {
    expect(emptyFilters({ costMin: 0, costMax: 150, kmMin: 0, kmMax: 980 })).toEqual(ds.emptyFilters);
    expect(isEmptyFilters(ds.emptyFilters, B)).toBe(true);
    expect(countActive(ds.emptyFilters, B)).toBe(0);
  });

  it("countActive conta ogni valore scelto e ogni fascia ristretta", () => {
    const f = F({ cities: ["Genova", "Milano"], people: ["Cami <3"], status: "attended", costMax: 100, kmMin: 10 });
    expect(countActive(f, B)).toBe(6);
    expect(isEmptyFilters(f, B)).toBe(false);
  });

  it("describeFilters riassume in italiano", () => {
    expect(describeFilters(ds.emptyFilters, B)).toBe("nessun filtro attivo");
    expect(describeFilters(F({ status: "planned", cities: ["Genova"], vicinanze: [6], canzoni: [4], costMax: 100 }), B))
      .toBe("solo in programma; città: Genova; vicinanza: Transenna; canzoni note: Molte; costo €0–€100");
  });
});

describe("mergeToolFilters (strumento set_filters dell'Oracolo)", () => {
  it("scarta città, persone e livelli che il profilo non ha", () => {
    const next = mergeToolFilters(ds.emptyFilters, {
      cities: ["Genova", "Atlantide"], people: ["Cami <3", "Nessuno"], vicinanze: [6, 9], canzoniNote: [4, 0],
    }, ds);
    expect(next.cities).toEqual(["Genova"]);
    expect(next.people).toEqual(["Cami <3"]);
    expect(next.vicinanze).toEqual([6]);
    expect(next.canzoni).toEqual([4]);
  });

  it("taglia costo e km agli estremi e scambia un intervallo rovesciato", () => {
    const next = mergeToolFilters(ds.emptyFilters, { costMin: 500, costMax: -3, kmMin: 2000, kmMax: 40.4 }, ds);
    expect([next.costMin, next.costMax]).toEqual([0, 150]);
    expect([next.kmMin, next.kmMax]).toEqual([40, 980]);
  });

  it("replace riparte da zero, altrimenti si somma ai filtri correnti", () => {
    const cur = F({ cities: ["Genova"] });
    expect(mergeToolFilters(cur, { status: "planned" }, ds)).toMatchObject({ cities: ["Genova"], status: "planned" });
    expect(mergeToolFilters(cur, { replace: true, status: "planned" }, ds)).toMatchObject({ cities: [], status: "planned" });
  });

  it("le date non valide si ignorano, la stringa vuota azzera", () => {
    const cur = F({ dateFrom: "2024-01-01" });
    expect(mergeToolFilters(cur, { dateFrom: "01/01/2025" }, ds).dateFrom).toBe("2024-01-01");
    expect(mergeToolFilters(cur, { dateFrom: "" }, ds).dateFrom).toBe("");
    expect(mergeToolFilters(cur, { dateTo: "2025-12-31" }, ds).dateTo).toBe("2025-12-31");
  });
});
