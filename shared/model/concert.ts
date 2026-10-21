/* ──────────────────────────────────────────────────────────────
   Il modello dei dati: concerto vs evento.

   Una riga dei dati (`Entry`) è un EVENTO (un biglietto, un viaggio, una
   serata o un weekend di festival). Una riga normale è un evento con un
   concerto implicito, descritto in linea (`Concert`). Un festival invece
   elenca i suoi concerti in `concerts`: ognuno ha artista, compagni, voto,
   vicinanza e canzoni note suoi (`FestivalConcert`), mentre biglietto
   (`cost`/`gift`/`giftFrom`/`accredito`), viaggio (`from`/`km`), `comments`,
   `date`, `venue` e `city` restano sull'evento.

   Puro e isomorfo: niente React, DOM o segreti. I tipi sono generici sui
   nomi (persone, "regalato da", partenze) così il dataset statico di
   `gabrifila` può restringerli a unioni letterali e far fallire il build
   su un refuso, mentre il resto dell'app ragiona su `string`.
   ────────────────────────────────────────────────────────────── */

export type Voto = 1 | 2 | 3 | 4 | 5;
/** Quanto sono vicino al palco: PIÙ ALTO = PIÙ VICINO (6 Transenna … 1 Anello alto). */
export type Vicinanza = 1 | 2 | 3 | 4 | 5 | 6;
/** Quota della scaletta già conosciuta (1 Nessuna … 5 Tutte); "na" = non ricordo. */
export type CanzoniNote = 1 | 2 | 3 | 4 | 5 | "na";

// I fatti di un concerto, indipendenti da biglietto, viaggio e luogo.
export interface ConcertFacts<P extends string = string> {
  artist: string;
  with: P[];
  voto?: Voto;
  vicinanza?: Vicinanza; // assente = non ancora definita (eventi futuri)
  canzoniNote?: CanzoniNote; // assente = non ancora definita; "na" = non ricordo
}

// I fatti di un evento: un biglietto, un viaggio, un luogo e una data.
export interface EventInfo<G extends string = string, D extends string = string> {
  y: number;
  date: string; // "gg/mm/aaaa"; più giorni: "30–31/03/2017"
  venue: string;
  city: string;
  cost?: number | "na"; // euro, il biglietto; "na" = pagato ma prezzo dimenticato
  gift?: boolean;
  giftFrom?: G; // chi l'ha regalato (chiave dei "regalato da"), solo con gift: true
  accredito?: boolean; // lista ospiti/accredito stampa: ingresso gratuito, non un regalo
  from?: D; // partenza del viaggio (chiave delle partenze)
  km?: number; // km di sola andata, precalcolati fuori dall'app (mai derivati qui)
  comments?: string; // ricordo libero della serata (di tutto il festival, non di un set)
}

// L'unità: un concerto che è anche il proprio evento.
export interface Concert<P extends string = string, G extends string = string, D extends string = string>
  extends ConcertFacts<P>, EventInfo<G, D> {}

// Un concerto dentro un festival, col suo giorno se l'evento dura più giorni.
export interface FestivalConcert<P extends string = string> extends ConcertFacts<P> {
  date?: string; // "gg/mm/aaaa"
}

// L'unico tipo di evento con più concerti: la tupla ne impone almeno due.
export interface Festival<P extends string = string, G extends string = string, D extends string = string>
  extends EventInfo<G, D> {
  name: string; // es. "MI AMI 2026"
  concerts: [FestivalConcert<P>, FestivalConcert<P>, ...FestivalConcert<P>[]]; // in ordine di lineup
}

// Una riga dei dati: un concerto singolo oppure un festival.
export type Entry<P extends string = string, G extends string = string, D extends string = string> =
  | Concert<P, G, D>
  | Festival<P, G, D>;

export const isFestival = (e: Entry): e is Festival => "concerts" in e;

/* Un concerto "appiattito" fuori dalla sua riga: fatti del concerto più il
   contesto dell'evento (luogo, data). Biglietto e viaggio ci sono solo se il
   concerto È il proprio evento: un concerto di festival non ha prezzo né km
   suoi. `ev` punta alla riga di appartenenza per tutto ciò che è dell'evento
   (dedup, soldi, viaggi, `comments`). */
export interface FlatConcert extends ConcertFacts {
  y: number;
  date: string; // il giorno del concerto se noto, altrimenti quello della riga
  venue: string;
  city: string;
  cost?: number | "na";
  gift?: boolean;
  giftFrom?: string;
  accredito?: boolean;
  from?: string;
  km?: number;
  ev: Entry;
}

export const concertsOf = (e: Entry): FlatConcert[] =>
  isFestival(e)
    ? e.concerts.map(c => ({ y: e.y, date: c.date || e.date, artist: c.artist, venue: e.venue, city: e.city, with: c.with, voto: c.voto, vicinanza: c.vicinanza, canzoniNote: c.canzoniNote, ev: e }))
    : [{ y: e.y, date: e.date, artist: e.artist, venue: e.venue, city: e.city, with: e.with, voto: e.voto, vicinanza: e.vicinanza, canzoniNote: e.canzoniNote, cost: e.cost, gift: e.gift, giftFrom: e.giftFrom, accredito: e.accredito, from: e.from, km: e.km, ev: e }];

export const flatConcerts = (data: Entry[]): FlatConcert[] => data.flatMap(concertsOf);

/** Chi ha regalato un biglietto: nome, sito e logo facoltativi. */
export interface GifterInfo {
  label: string;
  url?: string;
  logo?: string;
}

/** Coordinate [lng, lat]. */
export type LngLat = [number, number];
