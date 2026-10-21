/* ──────────────────────────────────────────────────────────────
   Il dataset di un profilo: le righe più tutto ciò che se ne deriva una
   volta sola (concerti appiattiti, estremi dei filtri, vocabolari).

   Sostituisce le derivazioni a livello di modulo che App.tsx faceva da
   ALLDATA (FLAT_ALL, COST_MAX/KM_MAX, EMPTY_FILTERS, ALL_CITIES, …): ogni
   componente le legge da qui, attraverso ProfileContext, così una pagina
   non può mai mostrare estremi o nomi di un altro profilo.
   ────────────────────────────────────────────────────────────── */

import { flatConcerts, type Entry, type FlatConcert, type GifterInfo, type LngLat } from "../model/concert.ts";
import { CN_ORDER, VIC_ORDER } from "../model/scale.ts";
import { keyToISO, sortKey } from "./dates.ts";
import { distKm, hasCost } from "./predicates.ts";
import { emptyFilters, type FilterBounds, type FilterVocab, type Filters } from "./filters.ts";

export interface DatasetInput {
  entries: Entry[];
  /** Chi ha regalato i biglietti, per chiave (`giftFrom`). */
  gifters?: Record<string, GifterInfo>;
  /** Nome pubblico delle partenze, per chiave (`from`): es. { m: "Milano" }. */
  departures?: Record<string, string>;
  venueCoords?: Record<string, LngLat>;
  cityCoords?: Record<string, LngLat>;
  wishlist?: string[];
}

export interface Dataset extends FilterVocab {
  entries: Entry[];
  /** Ogni concerto, set dei festival compresi (ex FLAT_ALL). */
  flat: FlatConcert[];
  gifters: Record<string, GifterInfo>;
  departures: Record<string, string>;
  venueCoords: Record<string, LngLat>;
  cityCoords: Record<string, LngLat>;
  wishlist: string[];
  /** Città delle righe, ordine italiano (filtri). */
  cities: string[];
  /** Compagni dei concerti, ordine italiano (filtri). */
  people: string[];
  /** Livelli di vicinanza presenti, in ordine di lettura (6 → 1). */
  vic: number[];
  /** Livelli di canzoni note presenti (1 → 5). */
  cn: number[];
  /** Estremi per i selettori di data, "AAAA-MM-GG". */
  dateLo: string;
  dateHi: string;
  /** Tetto del cursore del costo (ex COST_MAX): il prezzo più alto arrotondato alla decina. */
  costMax: number;
  /** Tetto del cursore dei km (ex KM_MAX): il viaggio più lungo arrotondato alla decina. */
  kmMax: number;
  bounds: FilterBounds;
  emptyFilters: Filters;
  /** Vocabolari degli strumenti dell'Oracolo (ordine per code unit, come gli enum di sempre). */
  vocab: { cities: string[]; companions: string[] };
}

const byIt = (a: string, b: string) => a.localeCompare(b, "it");
const ceil10 = (n: number) => Math.ceil(n / 10) * 10;

export function buildDataset(input: DatasetInput): Dataset {
  const entries = input.entries;
  const flat = flatConcerts(entries);
  const keys = entries.map(sortKey);
  const prices = entries.filter(hasCost).map(d => d.cost);
  const trips = entries.map(d => distKm(d)).filter((k): k is number => k !== null);
  const costMax = prices.length ? ceil10(Math.max(...prices)) : 0;
  const kmMax = trips.length ? ceil10(Math.max(...trips)) : 0;
  const bounds: FilterBounds = { costMin: 0, costMax, kmMin: 0, kmMax };
  const citySet = [...new Set(entries.map(d => d.city))];
  const peopleSet = [...new Set(flat.flatMap(c => c.with || []))];
  return {
    entries,
    flat,
    gifters: input.gifters ?? {},
    departures: input.departures ?? {},
    venueCoords: input.venueCoords ?? {},
    cityCoords: input.cityCoords ?? {},
    wishlist: input.wishlist ?? [],
    cities: [...citySet].sort(byIt),
    people: [...peopleSet].sort(byIt),
    vic: VIC_ORDER.filter(v => flat.some(c => c.vicinanza === v)),
    cn: CN_ORDER.filter(v => flat.some(c => c.canzoniNote === v)),
    dateLo: keys.length ? keyToISO(Math.min(...keys)) : "",
    dateHi: keys.length ? keyToISO(Math.max(...keys)) : "",
    costMax,
    kmMax,
    bounds,
    emptyFilters: emptyFilters(bounds),
    vocab: { cities: [...citySet].sort(), companions: [...peopleSet].sort() },
  };
}
