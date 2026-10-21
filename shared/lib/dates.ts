/* ──────────────────────────────────────────────────────────────
   Date dei concerti e "oggi".

   Le date dei dati sono stringhe "gg/mm/aaaa" (o "30–31/03/2017" per più
   giorni: vale il primo). Il confronto passa da una chiave intera AAAAMMGG.

   "Oggi" non si legge mai dall'orologio qui dentro: chi chiama passa `now`
   (catturato una volta nel loader di root e serializzato verso il client) e
   il giorno si calcola sempre nel fuso Europe/Rome, sia sul server (Vercel
   gira in UTC) sia nel browser. Così SSR e idratazione vedono lo stesso
   confine passato/in programma anche tra mezzanotte e le due.
   ────────────────────────────────────────────────────────────── */

export const TIME_ZONE = "Europe/Rome";

const DATE_RE = /(\d{1,2})(?:–\d{1,2})?\/(\d{2})\/(\d{4})/;

/** AAAAMMGG del (primo) giorno della data, 0 se non si legge. */
export const sortKey = (d: { date: string }): number => {
  const m = d.date.match(DATE_RE);
  return m ? (+m[3]) * 10000 + (+m[2]) * 100 + (+m[1]) : 0;
};

/** Giorno della settimana, 0 = lunedì … 6 = domenica (più giorni: il primo, come sortKey). */
export const weekdayOf = (d: { date: string }): number => {
  const m = d.date.match(DATE_RE);
  // Date.UTC: il giorno della settimana di una data di calendario non dipende dal fuso
  return m ? (new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])).getUTCDay() + 6) % 7 : 0;
};

/** Mese 0..11. */
export const monthOf = (d: { date: string }): number => parseInt(d.date.split("/")[1], 10) - 1;

/** AAAAMMGG → "AAAA-MM-GG" (per gli input data nativi). */
export const keyToISO = (k: number): string => {
  const s = String(k).padStart(8, "0");
  return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8);
};

/** "AAAA-MM-GG" (da un input data nativo) → AAAAMMGG, null se non valido. */
export const isoKey = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]) : null;
};

let romeParts: Intl.DateTimeFormat | null = null;
const romeFormatter = () =>
  (romeParts ??= new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }));

/** Ora civile di Roma all'istante `ts`, campo per campo. */
export function romeClock(ts: number): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const p: Record<string, number> = {};
  for (const part of romeFormatter().formatToParts(ts)) {
    if (part.type !== "literal") p[part.type] = +part.value;
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour === 24 ? 0 : p.hour, mi: p.minute, s: p.second };
}

/** Il giorno di calendario di `now` a Roma, come AAAAMMGG. */
export function todayKey(now: number): number {
  const c = romeClock(now);
  return c.y * 10000 + c.m * 100 + c.d;
}

/** In programma = oggi o dopo (un concerto di oggi conta ancora come in programma). */
export const isPlanned = (d: { date: string }, today: number): boolean => sortKey(d) >= today;

// scarto tra l'ora civile di Roma e UTC all'istante ts, in millisecondi
function romeOffset(ts: number): number {
  const c = romeClock(ts);
  return Date.UTC(c.y, c.m - 1, c.d, c.h, c.mi, c.s) - Math.floor(ts / 1000) * 1000;
}

/** L'istante della mezzanotte di Roma del giorno indicato (mese 1..12). */
export function romeMidnight(y: number, m: number, d: number): number {
  const utc = Date.UTC(y, m - 1, d);
  const first = utc - romeOffset(utc);
  const second = utc - romeOffset(first); // corregge un cambio d'ora tra le due stime
  return second;
}
