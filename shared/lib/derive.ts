/* ──────────────────────────────────────────────────────────────
   Le costanti che erano cucite su Gabri diventano regole sui dati del
   profilo (PIANO §1.33). Per `gabrifila` danno gli stessi valori di prima:

   | prima                    | regola                                                    |
   |--------------------------|-----------------------------------------------------------|
   | "dal 2022"               | primo anno dell'ultima serie ininterrotta di anni con     |
   |                          | concerti visti                                            |
   | "% a Milano"             | la città più frequente tra gli eventi visti               |
   | anni 2017…2026           | dal primo anno dei dati a max(anno corrente, ultimo anno) |
   | centro mappa di riserva  | baricentro delle venue                                    |

   Si calcolano sulle righe NON filtrate del profilo: i filtri cambiano i
   numeri, non il punto di partenza né la città di riferimento. Un profilo
   vuoto (o con soli concerti in programma) dà null, mai NaN.
   ────────────────────────────────────────────────────────────── */

import { flatConcerts, type Entry, type LngLat } from "../model/concert.ts";
import { counter, ranked } from "./aggregate.ts";
import { isPlanned, romeClock } from "./dates.ts";

/** Primo anno dell'ultima serie di anni consecutivi con almeno un concerto visto; null se non ce ne sono. */
export function serieDa(entries: Entry[], today: number): number | null {
  const anni = [...new Set(flatConcerts(entries).filter(c => !isPlanned(c, today)).map(c => c.y))].sort((a, b) => a - b);
  if (!anni.length) return null;
  let da = anni[anni.length - 1];
  while (anni.includes(da - 1)) da--;
  return da;
}

/** La città più frequente tra gli eventi visti (a parità, la prima in ordine alfabetico); null se nessuno. */
export function cittaPrincipale(entries: Entry[], today: number): string | null {
  const visti = entries.filter(d => !isPlanned(d, today));
  const top = ranked(counter(visti, "city")).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it"))[0];
  return top ? top[0] : null;
}

/** L'anno civile di `now` a Roma. */
export const annoCorrente = (now: number): number => romeClock(now).y;

/** Gli anni dell'asse dei grafici per anno: da `primo` a max(anno corrente, ultimo anno con dati). */
export function anniAsse(primo: number | null, ultimi: number[], now: number): number[] {
  const corrente = annoCorrente(now);
  const da = primo ?? corrente;
  const a = Math.max(corrente, da, ...ultimi);
  const out: number[] = [];
  for (let y = da; y <= a; y++) out.push(y);
  return out;
}

/** Il primo anno con dati del profilo (concerti visti o in programma); null se vuoto. */
export const primoAnno = (entries: Entry[]): number | null =>
  entries.length ? Math.min(...entries.map(d => d.y)) : null;

/** Centro di riserva della mappa: il baricentro delle venue; null se non ce n'è nessuna. */
export function baricentro(coords: Record<string, LngLat>): LngLat | null {
  const punti = Object.values(coords);
  if (!punti.length) return null;
  const s = punti.reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0]);
  return [s[0] / punti.length, s[1] / punti.length];
}
