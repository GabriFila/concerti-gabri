/* I numeri del Ritratto ("Sul palco"), calcolati una volta sulle righe NON
   filtrate con gli stessi aiuti dei KPI, così le due viste coincidono per
   costruzione. */

import { flatConcerts, type Entry, type FlatConcert } from "../model/concert.ts";
import { isPlanned, sortKey, todayKey } from "./dates.ts";
import { counter, rankCutoff, ranked, sum } from "./aggregate.ts";
import { distKm, hasVoto } from "./predicates.ts";
import { perYearSince } from "./kpis.ts";

export interface Portrait {
  total: number;
  artists: number;
  perYear: number;
  km: number;
  companions: number;
  solo: number;
  avgVoto: number;
  /** I migliori: i 5★ se sono almeno tre, altrimenti i 4★ e più; al massimo 6. */
  topBest: (FlatConcert & { voto: number })[];
  /** Con chi (≥2 volte, gradini interi, al massimo 5). */
  mates: [string, number][];
  /** Eventi in programma, dal più vicino. */
  upcoming: Entry[];
  plannedCount: number;
  plannedConcerts: number;
}

export function computePortrait(entries: Entry[], now: number): Portrait {
  const today = todayKey(now);
  const planned = (d: { date: string }) => isPlanned(d, today);
  const flat = flatConcerts(entries);
  const attEv = entries.filter(d => !planned(d));
  const attC = flat.filter(c => !planned(c));
  const rated = attC.filter(hasVoto).sort((a, b) => b.voto - a.voto || sortKey(b) - sortKey(a));
  const five = rated.filter(c => c.voto >= 5);
  const topBest = (five.length >= 3 ? five : rated.filter(c => c.voto >= 4)).slice(0, 6);
  // stesso taglio della card dei compagni (persone viste ≥2 volte, gradini interi), con un tetto più basso
  const mates = rankCutoff(ranked(counter(attC.flatMap(c => c.with || []), x => x)).filter(([, n]) => n >= 2), 5, 5).slice(0, 5);
  const upcoming = [...entries.filter(planned)].sort((a, b) => sortKey(a) - sortKey(b));
  const voted = attC.filter(hasVoto);
  return {
    total: attC.length,
    artists: new Set(attC.map(c => c.artist)).size,
    perYear: perYearSince(attC, now),
    km: Math.round(sum(attEv.map(distKm).filter((k): k is number => k !== null)) * 2),
    companions: new Set(attC.flatMap(c => c.with || [])).size,
    solo: attC.filter(c => !(c.with && c.with.length)).length,
    avgVoto: voted.length ? sum(voted.map(c => c.voto)) / voted.length : 0,
    topBest,
    mates,
    upcoming,
    plannedCount: upcoming.length,
    plannedConcerts: flat.filter(planned).length,
  };
}
