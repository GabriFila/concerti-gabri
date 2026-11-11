/* ──────────────────────────────────────────────────────────────
   I tour visti (sec-tour): l'elenco dei tour di cui il proprietario ha
   visto almeno una data. Un tour è la coppia (artista, tour): "Tour 2025"
   di due artisti sono due tour. Di solito si vede una data per tour, ma se
   sono di più il tour resta una voce sola con tutte le sue date.
   Puro e isomorfo: lavora sui concerti appiattiti (anche quelli dei
   festival, che hanno il loro tour).
   ────────────────────────────────────────────────────────────── */

import { chiaveNome } from "./nomi.ts";
import { sortKey } from "./dates.ts";
import { concertsOf, isFestival, type Entry, type FlatConcert } from "../model/concert.ts";

/** Una data vista di un tour. */
export interface DataDelTour {
  date: string;
  venue: string;
  city: string;
  /** Il nome del festival, se la data era un set di un festival. */
  festival?: string;
}

export interface TourVisto {
  tour: string;
  artist: string;
  /** Dalla più recente. */
  date: DataDelTour[];
}

/** Un concerto (anche di un festival) di questa riga ha un tour. */
export const haTour = (e: Entry): boolean => concertsOf(e).some(c => !!c.tour?.trim());

/** I tour visti, dal più recente (per l'ultima data vista); le date di ogni tour dalla più recente. */
export function touriVisti(concerti: readonly FlatConcert[]): TourVisto[] {
  const perChiave = new Map<string, { t: TourVisto; k: number[] }>();
  for (const c of concerti) {
    const tour = c.tour?.trim();
    if (!tour) continue;
    const chiave = `${chiaveNome(c.artist)}\u0000${chiaveNome(tour)}`;
    let x = perChiave.get(chiave);
    if (!x) {
      x = { t: { tour, artist: c.artist, date: [] }, k: [] };
      perChiave.set(chiave, x);
    }
    x.t.date.push({ date: c.date, venue: c.venue, city: c.city, ...(isFestival(c.ev) ? { festival: c.ev.name } : {}) });
    x.k.push(sortKey({ date: c.date }));
  }
  const tutti = [...perChiave.values()].map(({ t, k }) => {
    const ordine = t.date.map((d, i) => ({ d, k: k[i] })).sort((a, b) => b.k - a.k);
    return { t: { ...t, date: ordine.map(o => o.d) }, ultima: ordine[0].k };
  });
  return tutti
    .sort((a, b) => b.ultima - a.ultima || a.t.artist.localeCompare(b.t.artist, "it") || a.t.tour.localeCompare(b.t.tour, "it"))
    .map(x => x.t);
}
