/* I 12 KPI di "I dati" e gli aggregati delle card, sui dati statici di
   gabrifila, all'istante del piano (PIANO §7, traguardo 1):
   now = 2026-10-21T12:00+02:00. I valori attesi sono quelli che la build di
   `main` mostra a quell'ora: se cambiano qui, la parità con main è rotta. */

import { describe, expect, it } from "vitest";
import { GABRIFILA_INPUT } from "../seed/gabrifila.ts";
import { counter, multiCounter, rankCutoff, ranked } from "./aggregate.ts";
import { buildDataset } from "./dataset.ts";
import { isPlanned, todayKey } from "./dates.ts";
import { computeKpis, perYearSince, type Kpi, type KpiId } from "./kpis.ts";
import { computePortrait } from "./portrait.ts";
import { TREND_SPECS, maWindow, movingAverage } from "./trend.ts";

const NOW = Date.parse("2026-10-21T12:00:00+02:00");
const TODAY = todayKey(NOW);
const ds = buildDataset(GABRIFILA_INPUT);
const kpis = computeKpis(ds.entries, NOW);
const byId = Object.fromEntries(kpis.map(k => [k.id, k])) as Record<KpiId, Kpi>;
/** Come la card mostra il numero: valore, più la stellina del voto. */
const shown = (k: Kpi) => String(k.value) + (k.star ? "★" : "");

describe("computeKpis: i 12 KPI al 2026-10-21T12:00+02:00", () => {
  it("ha le 12 card nell'ordine della pagina", () => {
    expect(kpis.map(k => k.id)).toEqual([
      "concerti", "programma", "media", "voto", "speso", "spesaMedia",
      "citta", "artisti", "compagni", "solo", "cieca", "km",
    ]);
  });

  it.each([
    ["concerti", "80", "sino ad oggi"],
    ["programma", "11", "prossimo 18/11/2026"],
    ["media", "15.6", "dal 2022 a oggi"],
    ["voto", "3,4★", "80 concerti votati"],
    ["speso", "€3375", "68 biglietti"],
    ["spesaMedia", "€50", "68 biglietti"],
    ["citta", "13", "53% a Milano"],
    ["artisti", "50", "Emma Nolde 10x"],
    ["compagni", "44", "#1 Cami <3"],
    ["solo", "11", "14% del totale"],
    ["cieca", "25", "32% dei concerti"],
    ["km", "7278", "andata e ritorno"],
  ] as [KpiId, string, string][])("%s = %s (%s)", (id, value, hint) => {
    expect(shown(byId[id])).toBe(value);
    expect(byId[id].hint).toBe(hint);
  });

  it("le etichette delle card restano quelle di main", () => {
    expect(kpis.map(k => k.lbl)).toEqual([
      "Concerti", "In programma", "media per anno", "Voto medio", "Speso in totale", "Spesa media",
      "Città", "Artisti diversi", "Compagni", "Concerti da solo", "Alla cieca", "Km di viaggi",
    ]);
  });

  it("i pallini seguono le righe dietro il numero (passato / in programma)", () => {
    const sides = (k: Kpi) => ({
      past: k.src.some(r => !isPlanned(r, TODAY)),
      planned: k.src.some(r => isPlanned(r, TODAY)),
    });
    expect(sides(byId.concerti)).toEqual({ past: true, planned: false });
    expect(sides(byId.programma)).toEqual({ past: false, planned: true });
    // i soldi contano anche i biglietti già comprati per date future: due pallini
    expect(sides(byId.speso)).toEqual({ past: true, planned: true });
    expect(sides(byId.spesaMedia)).toEqual({ past: true, planned: true });
    expect(sides(byId.km)).toEqual({ past: true, planned: false });
    // il numero e le righe dietro coincidono dove il KPI è un conteggio
    expect(byId.concerti.src).toHaveLength(80);
    expect(byId.programma.src).toHaveLength(11);
    expect(byId.solo.src).toHaveLength(11);
    expect(byId.cieca.src).toHaveLength(25);
    expect(byId.speso.src).toHaveLength(68);
  });

  it("su un insieme vuoto non esplode e mostra trattini e zeri", () => {
    const empty = Object.fromEntries(computeKpis([], NOW).map(k => [k.id, k])) as Record<KpiId, Kpi>;
    expect(empty.concerti.value).toBe(0);
    expect(empty.voto.value).toBe("—");
    expect(empty.voto.star).toBe(false);
    expect(empty.speso.value).toBe("€0");
    expect(empty.km.value).toBe("0");
    expect(empty.programma.hint).toBeUndefined();
  });

  it("la media per anno è a tempo continuo dal 1° gennaio 2022 (Roma)", () => {
    const attended = ds.flat.filter(c => !isPlanned(c, TODAY));
    expect(perYearSince(attended, NOW)).toBeCloseTo(15.614, 3);
    // a inizio 2022 non c'è ancora tempo trascorso: niente divisione per zero
    expect(perYearSince(attended, Date.parse("2021-12-31T22:00:00Z"))).toBe(0);
  });

  it("con il giorno successivo all'ultimo concerto in programma cambiano solo i conteggi giusti", () => {
    // 19/11/2026 a Roma: il concerto del 18/11/2026 è passato
    const later = Object.fromEntries(
      computeKpis(ds.entries, Date.parse("2026-11-19T00:30:00+01:00")).map(k => [k.id, k]),
    ) as Record<KpiId, Kpi>;
    expect(later.concerti.value).toBe(81);
    expect(later.programma.value).toBe(10);
    expect(later.programma.hint).toBe("prossimo 30/11/2026");
  });
});

describe("aggregati delle card", () => {
  const p = computePortrait(ds.entries, NOW);

  it("il Ritratto coincide coi KPI (stessi aiuti, stesse righe)", () => {
    expect(p.total).toBe(80);
    expect(p.artists).toBe(50);
    expect(p.km).toBe(7278);
    expect(p.perYear.toFixed(1)).toBe("15.6");
    expect(p.companions).toBe(44);
    expect(p.solo).toBe(11);
    expect(p.avgVoto).toBeCloseTo(3.375, 3);
    expect(p.plannedCount).toBe(11);
    expect(p.plannedConcerts).toBe(11);
    expect(p.upcoming[0].date).toBe("18/11/2026");
  });

  it("i migliori: almeno tre 5★, al massimo sei, dal più recente a parità di voto", () => {
    expect(p.topBest.length).toBeGreaterThanOrEqual(3);
    expect(p.topBest.length).toBeLessThanOrEqual(6);
    expect(p.topBest.every(c => c.voto === 5)).toBe(true);
    expect(p.topBest.map(c => c.artist)).toEqual([
      "Caparezza", "Florence + The Machine", "Mumford & Sons", "Ed Sheeran", "World of Hans Zimmer",
    ]);
  });

  it("con chi: persone viste almeno due volte, a gradini interi, al massimo cinque", () => {
    expect(p.mates).toEqual([["Cami <3", 24], ["Espi", 9], ["Marco D", 8], ["Ludo", 6], ["Camilla C", 5]]);
  });

  it("artisti più visti: classifica per set visti", () => {
    const attended = ds.flat.filter(c => !isPlanned(c, TODAY));
    const top = ranked(counter(attended, "artist"));
    expect(top[0]).toEqual(["Emma Nolde", 10]);
    // la somma della classifica è il numero di concerti visti
    expect(top.reduce((s, [, n]) => s + n, 0)).toBe(80);
  });

  it("compagni: multiCounter conta ogni persona di ogni set", () => {
    const attended = ds.flat.filter(c => !isPlanned(c, TODAY));
    const m = multiCounter(attended, "with");
    expect(m["Cami <3"]).toBe(24);
    expect(Object.keys(m)).toHaveLength(44);
  });

  it("rankCutoff mostra un gradino tutto o niente, sotto il tetto", () => {
    const rows: [string, number][] = [["a", 5], ["b", 4], ["c", 4], ["d", 3], ["e", 3], ["f", 3], ["g", 1]];
    expect(rankCutoff(rows, 3, 6).map(r => r[0])).toEqual(["a", "b", "c"]);
    expect(rankCutoff(rows, 4, 6).map(r => r[0])).toEqual(["a", "b", "c", "d", "e", "f"]);
    // il gradino da tre sfonderebbe il tetto di 5: si scarta intero
    expect(rankCutoff(rows, 4, 5).map(r => r[0])).toEqual(["a", "b", "c"]);
    // il primo gradino si mostra sempre, anche oltre il tetto
    expect(rankCutoff([["x", 2], ["y", 2], ["z", 2]] as [string, number][], 1, 1)).toHaveLength(3);
  });

  it("andamento: punti per concerto (voto) e per biglietto (costo), media mobile nella scala", () => {
    const voto = TREND_SPECS.find(s => s.k === "voto")!;
    const cost = TREND_SPECS.find(s => s.k === "cost")!;
    const vp = voto.points(ds.entries, TODAY);
    const cp = cost.points(ds.entries, TODAY);
    expect(vp).toHaveLength(80); // un punto per concerto votato
    expect(cp).toHaveLength(68); // un punto per biglietto con prezzo
    expect(cp.filter(x => x.planned).length).toBeGreaterThan(0);
    const ma = movingAverage(vp);
    expect(ma).toHaveLength(vp.length);
    expect(ma.every(([, v]) => v >= 1 && v <= 5)).toBe(true);
    expect(maWindow(80) % 2).toBe(1);
    expect(movingAverage(vp.slice(0, 3))).toEqual([]);
  });
});
