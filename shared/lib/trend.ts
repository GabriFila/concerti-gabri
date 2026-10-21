/* ──────────────────────────────────────────────────────────────
   "Come cambia nel tempo": una proprietà punto per punto lungo l'asse del
   tempo, con la media mobile sopra. L'unità segue la proprietà come ovunque:
   voto, vicinanza e canzoni note sono per CONCERTO, costo e km per
   BIGLIETTO/evento.
   ────────────────────────────────────────────────────────────── */

import { concertsOf, type Entry, type FlatConcert } from "../model/concert.ts";
import { CN_LABELS, VIC_LABELS } from "../model/scale.ts";
import { isPlanned, sortKey } from "./dates.ts";
import { eur0, eur2, km0, voto1 } from "./format.ts";
import { distKm, hasCN, hasCost, hasVic, hasVoto } from "./predicates.ts";

/* Un punto sul grafico: un concerto (voto/vicinanza/canzoni note) o un
   biglietto (costo/km). */
export interface TrendPoint {
  t: number;        // giorno dell'evento, timestamp a mezzanotte locale
  v: number;        // valore della proprietà scelta
  planned: boolean; // in programma (non ancora avvenuto)
}

// data → timestamp a mezzanotte LOCALE: l'asse del tempo di ECharts ragiona in
// ora locale, così i punti cadono sul giorno giusto ovunque nel mondo. Serve
// solo al grafico, che gira nel browser.
export const dateTs = (d: { date: string }): number | null => {
  const k = sortKey(d);
  return k ? new Date(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100).getTime() : null;
};
const byTime = (a: TrendPoint, b: TrendPoint) => a.t - b.t;

/* Da dove parte la finestra iniziale del grafico: il 2022 è l'anno in cui i
   concerti diventano continui, stesso taglio della "media per anno". */
export const trendFrom = (): number => new Date(2022, 0, 1).getTime();

// punti per concerto: `pick` dà il valore o null se il concerto non ce l'ha
export const concertPoints = (data: Entry[], pick: (c: FlatConcert) => number | null, today: number): TrendPoint[] =>
  data.flatMap(concertsOf).flatMap(c => {
    const v = pick(c), t = dateTs(c);
    return v === null || t === null ? [] : [{ t, v, planned: isPlanned(c, today) }];
  }).sort(byTime);
// punti per evento (biglietto/viaggio): un festival è una riga sola
export const eventPoints = (data: Entry[], pick: (e: Entry) => number | null, today: number): TrendPoint[] =>
  data.flatMap(e => {
    const v = pick(e), t = dateTs(e);
    return v === null || t === null ? [] : [{ t, v, planned: isPlanned(e, today) }];
  }).sort(byTime);

/* La linea grigia: una media mobile centrata sui W concerti attorno a ogni
   punto (resta nella scala dei dati). W cresce col dataset e resta dispari;
   agli estremi la finestra si accorcia invece di inventare valori. */
export const maWindow = (n: number): number => Math.max(5, Math.round(n / 10) | 1);
export const movingAverage = (points: TrendPoint[]): [number, number][] => {
  if (points.length < 4) return [];
  const half = Math.floor(maWindow(points.length) / 2);
  return points.map((p, i) => {
    const lo = Math.max(0, i - half), hi = Math.min(points.length - 1, i + half);
    let s = 0; for (let j = lo; j <= hi; j++) s += points[j].v;
    return [p.t, s / (hi - lo + 1)];
  });
};

export interface TrendSpec {
  k: string; tab: string;            // chiave ed etichetta del selettore
  label: string;                     // nome esteso (tooltip, aria, testo vuoto)
  unit: string;                      // "concerti" | "biglietti": cosa è un punto
  points: (data: Entry[], today: number) => TrendPoint[];
  yMin?: number; yMax?: number; yInterval?: number;
  yFormat: (v: number) => string;    // etichetta di un tick
  valueFormat: (v: number) => string; // valore in legenda
}
// arrotondamento al livello più vicino: le scale ordinali non hanno etichetta
// per i valori intermedi della media mobile
const ordFmt = (labels: Record<number, string>) => (v: number) => labels[Math.round(v)] || "";
export const TREND_SPECS: TrendSpec[] = [
  { k: "voto", tab: "Voto", label: "voto", unit: "concerti",
    points: (d, today) => concertPoints(d, c => hasVoto(c) ? c.voto : null, today),
    yMin: 1, yMax: 5, yInterval: 1, yFormat: v => v + "★", valueFormat: v => voto1(v) + "★" },
  { k: "vicinanza", tab: "Vicinanza", label: "vicinanza", unit: "concerti",
    points: (d, today) => concertPoints(d, c => hasVic(c) ? c.vicinanza : null, today),
    yMin: 1, yMax: 6, yInterval: 1, yFormat: ordFmt(VIC_LABELS), valueFormat: ordFmt(VIC_LABELS) },
  { k: "canzoni", tab: "Canzoni note", label: "canzoni note", unit: "concerti",
    points: (d, today) => concertPoints(d, c => hasCN(c) ? c.canzoniNote : null, today),
    yMin: 1, yMax: 5, yInterval: 1, yFormat: ordFmt(CN_LABELS), valueFormat: ordFmt(CN_LABELS) },
  { k: "cost", tab: "Costo", label: "costo del biglietto", unit: "biglietti",
    points: (d, today) => eventPoints(d, e => hasCost(e) ? e.cost : null, today),
    yMin: 0, yFormat: eur0, valueFormat: eur2 },
  { k: "km", tab: "Viaggio", label: "km di viaggio", unit: "biglietti",
    points: (d, today) => eventPoints(d, e => distKm(e), today),
    yMin: 0, yFormat: km0, valueFormat: km0 },
];
