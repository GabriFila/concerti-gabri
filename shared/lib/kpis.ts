/* ──────────────────────────────────────────────────────────────
   Le 12 card KPI di "I dati" (sezione sec-kpis), calcolate da righe già
   filtrate e da `now`. Ogni KPI sceglie la sua unità: concerti (un festival
   ne conta uno per set) o eventi/biglietti (un festival conta una volta).

   `src` sono le righe da cui esce il numero: da lì i due pallini in basso a
   destra della card (ambra = dentro ci sono concerti già visti, teal = ce ne
   sono in programma), così un pallino sparisce da sé quando i filtri lasciano
   vuoto quel lato.
   ────────────────────────────────────────────────────────────── */

import { concertsOf, type Entry } from "../model/concert.ts";
import { isPlanned, romeMidnight, sortKey, todayKey } from "./dates.ts";
import { counter, ranked, sum } from "./aggregate.ts";
import { etichetta, type Forma } from "../labels.ts";
import { cittaPrincipale, serieDa } from "./derive.ts";
import { eur0, voto1 } from "./format.ts";
import { distKm, hasCN, hasCost, hasFrom, hasVoto } from "./predicates.ts";

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

export type KpiId =
  | "concerti" | "programma" | "media" | "voto" | "speso" | "spesaMedia"
  | "citta" | "artisti" | "compagni" | "solo" | "cieca" | "km";

export interface Kpi {
  id: KpiId;
  /** Etichetta della card. */
  lbl: string;
  /** Il numero come va mostrato ("15.6", "€3375", "7278", 80…). */
  value: string | number;
  /** true = dopo il numero va la stellina (solo "Voto medio" con almeno un voto). */
  star?: boolean;
  hint?: string;
  /** Nome dell'icona (Icon). */
  ic: string;
  /** Colore del numero: "amber" o "planned". */
  accent?: "amber" | "planned";
  /** Le righe da cui esce il numero (per i pallini passato/in programma). */
  src: { date: string }[];
}

/** Concerti visti all'anno dal 1° gennaio di `since` (la regola di serieDa,
    shared/lib/derive.ts): tempo continuo, così un anno appena iniziato non
    pesa come uno intero. Stessa formula del Ritratto. Senza anno: 0. */
export function perYearSince(attendedConcerts: { y: number }[], now: number, since: number | null): number {
  if (since === null) return 0;
  const elapsed = (now - romeMidnight(since, 1, 1)) / YEAR_MS;
  const n = attendedConcerts.filter(c => c.y >= since).length;
  return elapsed > 0 ? n / elapsed : 0;
}

/** Quello che i KPI prendono dal profilo e non dalle righe filtrate. */
export interface KpiProfilo {
  /** Anno della "media per anno" (regola: serieDa sulle righe del profilo). Assente = dalle righe passate. */
  since?: number | null;
  /** Città del suggerimento della card "Città" (regola: cittaPrincipale). Assente = dalle righe passate. */
  homeCity?: string | null;
  /** Forma grammaticale delle etichette (default m, i testi di sempre). */
  forma?: Forma;
}

/** Il KpiProfilo di un profilo: `since` e `homeCity` dalle sue righe INTERE.
    Chi passa a computeKpis righe filtrate (anno, filtri della pagina) passa
    anche questo: i filtri cambiano i numeri, non il punto di partenza. */
export const kpiProfilo = (tutte: Entry[], today: number, forma?: Forma): KpiProfilo => ({
  since: serieDa(tutte, today),
  homeCity: cittaPrincipale(tutte, today),
  ...(forma ? { forma } : {}),
});

export function computeKpis(entries: Entry[], now: number, profilo: KpiProfilo = {}): Kpi[] {
  const today = todayKey(now);
  const since = profilo.since !== undefined ? profilo.since : serieDa(entries, today);
  const homeCity = profilo.homeCity !== undefined ? profilo.homeCity : cittaPrincipale(entries, today);
  const forma = profilo.forma ?? "m";
  const planned = (d: { date: string }) => isPlanned(d, today);
  // eventi (biglietti/viaggi) contro concerti (set visti): ogni KPI sceglie la sua unità
  const ATTENDED = entries.filter(d => !planned(d));
  const PLANNED = entries.filter(planned);
  const CONC = entries.flatMap(concertsOf);
  const ATT_C = CONC.filter(c => !planned(c));
  const PL_C = CONC.filter(planned);
  const total = ATT_C.length; // concerti visti (un festival ne conta uno per set)
  const artists = new Set(ATT_C.map(c => c.artist)).size;
  const cities = new Set(ATTENDED.map(d => d.city)).size;
  const companions = new Set(ATT_C.flatMap(c => c.with || [])).size;
  const evTotal = ATTENDED.length;
  const home = evTotal ? Math.round(ATTENDED.filter(d => d.city === homeCity).length / evTotal * 100) : 0;
  const dataSince = since === null ? [] : ATT_C.filter(c => c.y >= since);
  const avgSince = perYearSince(ATT_C, now, since).toFixed(1);
  // compagno più frequente sui concerti visti (per set: chi c'era davvero accanto)
  const topMate = ranked(counter(ATT_C.flatMap(c => c.with || []), x => x))[0] || ["—", 0];
  // artista più visto, per set
  const topArtist = ranked(counter(ATT_C, "artist"))[0] || ["—", 0];
  // concerti da solo (un set di festival conta anche se prima c'era compagnia)
  const soloC = ATT_C.filter(c => !(c.with && c.with.length));
  const solo = soloC.length;
  // voto: per concerto, media sui set votati (visti)
  const voted = ATT_C.filter(hasVoto);
  const avgVoto = voted.length ? sum(voted.map(c => c.voto)) / voted.length : 0;
  // soldi: per biglietto (evento), solo eventi con prezzo noto
  const priced = entries.filter(hasCost);
  const totalSpent = sum(priced.map(d => d.cost));
  const avgSpent = priced.length ? totalSpent / priced.length : 0;
  // km: andata e ritorno, per evento, solo visti con partenza nota
  const tripRows = ATTENDED.filter(d => distKm(d) !== null);
  const totalKm = sum(tripRows.map(d => distKm(d) as number)) * 2;
  // viaggi con la partenza ma senza km: aspettano l'indirizzo (PIANO §1.37)
  const kmPending = ATTENDED.filter(d => hasFrom(d) && d.kmPending && distKm(d) === null).length;
  const nextPlanned = [...PLANNED].sort((a, b) => sortKey(a) - sortKey(b))[0];
  // alla cieca: concerti visti conoscendo nessuna o poche canzoni; la percentuale
  // è sui concerti visti con un valore vero di canzoni note
  const cnKnown = ATT_C.filter(hasCN).length;
  const ciecaC = ATT_C.filter(c => hasCN(c) && c.canzoniNote <= 2);
  const cieca = ciecaC.length;
  return [
    { id: "concerti", value: total, lbl: "Concerti", hint: "sino ad oggi", ic: "ticket", accent: "amber", src: ATT_C },
    { id: "programma", value: PL_C.length, lbl: "In programma", ic: "calendar", accent: "planned", hint: nextPlanned ? "prossimo " + nextPlanned.date : undefined, src: PL_C },
    { id: "media", value: avgSince, lbl: "media per anno", hint: since === null ? undefined : "dal " + since + " a oggi", ic: "repeat", src: dataSince },
    { id: "voto", value: voted.length ? voto1(avgVoto) : "—", star: voted.length > 0, lbl: "Voto medio", hint: voted.length + " concerti votati", ic: "star", src: voted },
    { id: "speso", value: eur0(totalSpent), lbl: "Speso in totale", hint: priced.length + " biglietti", ic: "coins", src: priced },
    { id: "spesaMedia", value: eur0(avgSpent), lbl: "Spesa media", hint: priced.length + " biglietti", ic: "wallet", src: priced },
    { id: "citta", value: cities, lbl: "Città", hint: homeCity === null ? undefined : home + "% a " + homeCity, ic: "pin", src: ATTENDED },
    { id: "artisti", value: artists, lbl: "Artisti diversi", hint: topArtist[1] ? topArtist[0] + " " + topArtist[1] + "x" : undefined, ic: "mic", src: ATT_C },
    { id: "compagni", value: companions, lbl: "Compagni", ic: "users", hint: "#1 " + topMate[0], src: ATT_C },
    { id: "solo", value: solo, lbl: etichetta("kpiSolo", forma), ic: "user", hint: (total ? Math.round(solo / total * 100) : 0) + "% del totale", src: soloC },
    { id: "cieca", value: cieca, lbl: "Alla cieca", ic: "eyeclosed", hint: cnKnown ? Math.round(cieca / cnKnown * 100) + "% dei concerti" : undefined, src: ciecaC },
    { id: "km", value: Math.round(totalKm).toLocaleString("it-IT"), lbl: "Km di viaggi", hint: "andata e ritorno" + (kmPending ? ` (${kmPending} ${kmPending === 1 ? "viaggio" : "viaggi"} in attesa)` : ""), ic: "map", src: tripRows },
  ];
}
