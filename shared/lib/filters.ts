/* ──────────────────────────────────────────────────────────────
   Filtri della dashboard: dimensioni sensate sul dataset, AND tra
   dimensioni, OR dentro una dimensione.

   Gli estremi (costo e km massimi) e il vocabolario (città, persone, livelli
   presenti) vengono dal dataset del profilo, mai da costanti di modulo; il
   giorno di oggi arriva come parametro.
   ────────────────────────────────────────────────────────────── */

import { isFestival, type Entry } from "../model/concert.ts";
import { CN_LABELS, VIC_LABELS } from "../model/scale.ts";
import { isoKey, isPlanned, sortKey } from "./dates.ts";
import { distKm, hasCN, hasCost, hasVic, isAccredito, isGift, type PerConcert } from "./predicates.ts";

/** Lo stato dei filtri attivi. */
export interface Filters {
  dateFrom: string; dateTo: string;
  cities: string[]; people: string[];
  vicinanze: number[]; canzoni: number[];
  status: string; price: string; solo: boolean;
  costMin: number; costMax: number; kmMin: number; kmMax: number;
}

/** Gli estremi dei due cursori (costo e km): dipendono dal dataset. */
export interface FilterBounds { costMin: number; costMax: number; kmMin: number; kmMax: number }

/** Quello che serve per tradurre l'input dello strumento `set_filters`. */
export interface FilterVocab {
  bounds: FilterBounds;
  emptyFilters: Filters;
  cities: string[];
  people: string[];
  vic: number[];
  cn: number[];
}

export const emptyFilters = (b: FilterBounds): Filters => ({
  dateFrom: "", dateTo: "", cities: [], people: [], vicinanze: [], canzoni: [],
  status: "all", price: "all", solo: false,
  costMin: b.costMin, costMax: b.costMax, kmMin: b.kmMin, kmMax: b.kmMax,
});

export const isDefaultDate = (f: Filters) => !f.dateFrom && !f.dateTo;
export const isDefaultCost = (f: Filters, b: FilterBounds) => f.costMin === b.costMin && f.costMax === b.costMax;
export const isDefaultKm = (f: Filters, b: FilterBounds) => f.kmMin === b.kmMin && f.kmMax === b.kmMax;
/** true se i due estremi coincidono (i dataset si ricostruiscono a ogni aggiornamento dal vivo). */
export const sameBounds = (a: FilterBounds, b: FilterBounds) =>
  a.costMin === b.costMin && a.costMax === b.costMax && a.kmMin === b.kmMin && a.kmMax === b.kmMax;

/* Dal vivo (Convex) gli estremi possono cambiare: un concerto nuovo più caro
   o più lontano alza il tetto. Una fascia che era "tutto" (agli estremi
   vecchi) resta "tutto" con gli estremi nuovi; una fascia ristretta a mano
   resta com'è. Senza, il tetto vecchio diventerebbe un filtro attivo e
   nasconderebbe regali e prezzi sconosciuti. */
export function rebaseFilters(f: Filters, old: FilterBounds, b: FilterBounds): Filters {
  const next = { ...f };
  if (isDefaultCost(f, old)) Object.assign(next, { costMin: b.costMin, costMax: b.costMax });
  if (isDefaultKm(f, old)) Object.assign(next, { kmMin: b.kmMin, kmMax: b.kmMax });
  return next;
}

export const isEmptyFilters = (f: Filters, b: FilterBounds) =>
  isDefaultDate(f) && f.cities.length === 0 && f.people.length === 0 && f.vicinanze.length === 0 && f.canzoni.length === 0 &&
  f.status === "all" && f.price === "all" && !f.solo && isDefaultCost(f, b) && isDefaultKm(f, b);
export const countActive = (f: Filters, b: FilterBounds) =>
  (f.dateFrom ? 1 : 0) + (f.dateTo ? 1 : 0) + f.cities.length + f.people.length + f.vicinanze.length + f.canzoni.length +
  (f.status !== "all" ? 1 : 0) + (f.price !== "all" ? 1 : 0) + (f.solo ? 1 : 0) + (isDefaultCost(f, b) ? 0 : 1) + (isDefaultKm(f, b) ? 0 : 1);

/* Recap testuale dei filtri attivi: lo usa l'Oracolo per confermare cosa
   mostra la pagina. */
export function describeFilters(f: Filters, b: FilterBounds): string {
  const parts: string[] = [];
  if (f.status === "attended") parts.push("solo già visti");
  if (f.status === "planned") parts.push("solo in programma");
  if (f.dateFrom) parts.push("dal " + f.dateFrom);
  if (f.dateTo) parts.push("fino al " + f.dateTo);
  if (f.cities.length) parts.push("città: " + f.cities.join(", "));
  if (f.people.length) parts.push("con: " + f.people.join(", "));
  if (f.solo) parts.push("da solo");
  if (f.vicinanze.length) parts.push("vicinanza: " + f.vicinanze.map(v => VIC_LABELS[v] || v).join(", "));
  if (f.canzoni.length) parts.push("canzoni note: " + f.canzoni.map(v => CN_LABELS[v] || v).join(", "));
  if (f.price === "paid") parts.push("solo con prezzo");
  if (f.price === "gift") parts.push("solo regalati");
  if (f.price === "accredito") parts.push("solo con accredito");
  if (f.price === "unknown") parts.push("solo senza prezzo");
  if (!isDefaultCost(f, b)) parts.push("costo €" + f.costMin + "–€" + f.costMax);
  if (!isDefaultKm(f, b)) parts.push("viaggio " + f.kmMin + "–" + f.kmMax + " km");
  return parts.length ? parts.join("; ") : "nessun filtro attivo";
}

/* Applica l'input dello strumento `set_filters` (già validato dallo schema)
   allo stato dei filtri. */
export function mergeToolFilters(cur: Filters, input: any, v: FilterVocab): Filters {
  const b = v.bounds;
  const next: Filters = { ...(input.replace ? v.emptyFilters : cur) };
  const iso = (s: string) => s === "" || isoKey(s) != null ? s : undefined; // "" azzera, date non valide ignorate
  if (input.status !== undefined) next.status = input.status;
  if (input.dateFrom !== undefined && iso(input.dateFrom) !== undefined) next.dateFrom = input.dateFrom;
  if (input.dateTo !== undefined && iso(input.dateTo) !== undefined) next.dateTo = input.dateTo;
  if (input.cities !== undefined) next.cities = input.cities.filter((c: string) => v.cities.includes(c));
  if (input.people !== undefined) next.people = input.people.filter((p: string) => v.people.includes(p));
  if (input.solo !== undefined) next.solo = !!input.solo;
  if (input.vicinanze !== undefined) next.vicinanze = input.vicinanze.map(Number).filter((x: number) => v.vic.includes(x));
  if (input.canzoniNote !== undefined) next.canzoni = input.canzoniNote.map(Number).filter((x: number) => v.cn.includes(x));
  if (input.price !== undefined) next.price = input.price;
  const clampCost = (x: number) => Math.min(b.costMax, Math.max(b.costMin, Math.round(x)));
  if (input.costMin !== undefined) next.costMin = clampCost(input.costMin);
  if (input.costMax !== undefined) next.costMax = clampCost(input.costMax);
  if (next.costMin > next.costMax) [next.costMin, next.costMax] = [next.costMax, next.costMin];
  const clampKm = (x: number) => Math.min(b.kmMax, Math.max(b.kmMin, Math.round(x)));
  if (input.kmMin !== undefined) next.kmMin = clampKm(input.kmMin);
  if (input.kmMax !== undefined) next.kmMax = clampKm(input.kmMax);
  if (next.kmMin > next.kmMax) [next.kmMin, next.kmMax] = [next.kmMax, next.kmMin];
  return next;
}

// Criteri per concerto, su tutto ciò che ha with/vicinanza/canzoniNote
// (un concerto singolo o un set di un festival).
export const concertMatches = (f: Filters, c: PerConcert): boolean => {
  if (f.people.length && !(c.with || []).some(p => f.people.includes(p))) return false;
  if (f.solo && (c.with && c.with.length)) return false;
  if (f.vicinanze.length && !(hasVic(c) && f.vicinanze.includes(c.vicinanza))) return false;
  if (f.canzoni.length && !(hasCN(c) && f.canzoni.includes(c.canzoniNote))) return false;
  return true;
};
export const hasConcertFilters = (f: Filters): boolean => f.people.length > 0 || f.solo || f.vicinanze.length > 0 || f.canzoni.length > 0;

export function applyFilters(data: Entry[], f: Filters, b: FilterBounds, today: number): Entry[] {
  const from = isoKey(f.dateFrom), to = isoKey(f.dateTo);
  const out: Entry[] = [];
  for (const d of data) {
    // criteri dell'evento: la riga passa o cade intera
    const dk = sortKey(d);
    if (from != null && dk < from) continue;
    if (to != null && dk > to) continue;
    if (f.cities.length && !f.cities.includes(d.city)) continue;
    if (f.status === "attended" && isPlanned(d, today)) continue;
    if (f.status === "planned" && !isPlanned(d, today)) continue;
    if (f.price === "paid" && !hasCost(d)) continue;
    if (f.price === "gift" && !isGift(d)) continue;
    if (f.price === "accredito" && !isAccredito(d)) continue;
    if (f.price === "unknown" && (hasCost(d) || isGift(d) || isAccredito(d))) continue;
    // fascia di costo: vincola solo gli eventi con prezzo noto; regali/accrediti/
    // sconosciuti passano, salvo fascia ristretta: allora solo i prezzi nella fascia
    if (!isDefaultCost(f, b)) {
      if (!hasCost(d)) continue;
      if (d.cost < f.costMin || d.cost > f.costMax) continue;
    }
    // fascia di km: come il costo, scatta solo se ristretta, e allora ammette
    // solo gli eventi con distanza nota
    if (!isDefaultKm(f, b)) {
      const k = distKm(d);
      if (k === null || k < f.kmMin || k > f.kmMax) continue;
    }
    // criteri per concerto: un festival resta se almeno un set corrisponde, ed
    // è ristretto ai set che corrispondono, così ogni card vede solo quelli
    if (isFestival(d)) {
      const keep = hasConcertFilters(f) ? d.concerts.filter(s => concertMatches(f, s)) : d.concerts;
      if (!keep.length) continue;
      out.push(keep.length === d.concerts.length ? d : { ...d, concerts: keep } as Entry);
    } else {
      if (hasConcertFilters(f) && !concertMatches(f, d)) continue;
      out.push(d);
    }
  }
  return out;
}
