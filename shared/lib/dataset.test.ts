/* buildDataset(): le derivazioni che App.tsx faceva una volta a livello di
   modulo da ALLDATA (COST_MAX, KM_MAX, EMPTY_FILTERS, ALL_CITIES…), ora per
   profilo. Per gabrifila devono dare gli stessi valori di main. */

import { describe, expect, it } from "vitest";
import { GABRIFILA_INPUT } from "../../src/data.ts";
import { buildDataset } from "./dataset.ts";

const ds = buildDataset(GABRIFILA_INPUT);

describe("buildDataset su gabrifila", () => {
  it("COST_MAX 150 e KM_MAX 980 (il massimo arrotondato alla decina)", () => {
    expect(ds.costMax).toBe(150);
    expect(ds.kmMax).toBe(980);
    expect(ds.bounds).toEqual({ costMin: 0, costMax: 150, kmMin: 0, kmMax: 980 });
  });

  it("righe e concerti appiattiti", () => {
    expect(ds.entries).toHaveLength(84);
    expect(ds.flat).toHaveLength(91);
  });

  it("i filtri vuoti partono dagli estremi del dataset", () => {
    expect(ds.emptyFilters).toEqual({
      dateFrom: "", dateTo: "", cities: [], people: [], vicinanze: [], canzoni: [],
      status: "all", price: "all", solo: false,
      costMin: 0, costMax: 150, kmMin: 0, kmMax: 980,
    });
  });

  it("estremi delle date per i selettori nativi", () => {
    expect(ds.dateLo).toBe("2017-03-30");
    expect(ds.dateHi).toBe("2027-06-23");
  });

  it("livelli presenti: vicinanza in ordine di lettura (Transenna prima), canzoni note a salire", () => {
    expect(ds.vic).toEqual([6, 5, 4, 3, 2, 1]);
    expect(ds.cn).toEqual([1, 2, 3, 4, 5]);
  });

  it("vocabolari: città e persone senza doppioni, in ordine italiano per i filtri", () => {
    expect(ds.cities).toHaveLength(14);
    expect(ds.people).toHaveLength(49);
    expect(new Set(ds.cities).size).toBe(ds.cities.length);
    expect([...ds.cities].sort((a, b) => a.localeCompare(b, "it"))).toEqual(ds.cities);
    expect(ds.cities).toContain("Milano");
    expect(ds.people).toContain("Cami <3");
  });

  it("vocabolari dell'Oracolo: stessi nomi, ordine per code unit (come gli enum di sempre)", () => {
    expect([...ds.vocab.cities].sort()).toEqual(ds.vocab.cities);
    expect([...ds.vocab.companions].sort()).toEqual(ds.vocab.companions);
    expect(new Set(ds.vocab.cities)).toEqual(new Set(ds.cities));
    expect(new Set(ds.vocab.companions)).toEqual(new Set(ds.people));
  });

  it("porta con sé regali, partenze, coordinate e wishlist del profilo", () => {
    expect(ds.departures).toEqual({ m: "Milano", g: "Genova" });
    expect(Object.keys(ds.gifters).length).toBeGreaterThan(0);
    expect(ds.wishlist.length).toBeGreaterThan(0);
    expect(Object.keys(ds.venueCoords).length).toBeGreaterThan(0);
  });

  it("ogni venue e città dei dati ha coordinate (altrimenti la mappa la salta in silenzio)", () => {
    const missing = ds.entries.filter(e => !ds.venueCoords[e.venue] && !ds.cityCoords[e.city]).map(e => `${e.venue} (${e.city})`);
    expect(missing).toEqual([]);
  });
});

describe("buildDataset su un profilo vuoto", () => {
  it("non esplode: estremi a zero, vocabolari vuoti", () => {
    const empty = buildDataset({ entries: [] });
    expect(empty.costMax).toBe(0);
    expect(empty.kmMax).toBe(0);
    expect(empty.flat).toEqual([]);
    expect(empty.cities).toEqual([]);
    expect(empty.vic).toEqual([]);
    expect(empty.dateLo).toBe("");
    expect(empty.emptyFilters.costMax).toBe(0);
  });
});
