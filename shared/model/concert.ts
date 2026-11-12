/* ──────────────────────────────────────────────────────────────
   Il modello dei dati: concerto vs evento.

   Una riga dei dati (`Entry`) è un EVENTO (un biglietto, un viaggio, una
   serata o un weekend di festival). Una riga normale è un evento con un
   concerto implicito, descritto in linea (`Concert`). Un festival invece
   elenca i suoi concerti in `concerts`: ognuno ha artista, compagni, voto,
   vicinanza e canzoni note suoi (`FestivalConcert`), mentre biglietto
   (`cost`/`gift`/`giftFrom`/`accredito`), viaggio (`from`/`km`), `comments`,
   `date`, `venue` e `city` restano sull'evento.

   Un'APERTURA (opening act) è un concerto normale, con la sua riga, il suo
   biglietto e i suoi fatti, che dice di chi apre (`aperturaDi`: l'artista
   dell'headliner della stessa data e venue). La serata e il viaggio sono
   dell'headliner: le statistiche per venue e viaggio contano la serata una
   volta (`serateOf`), quelle per concerto contano l'apertura come concerto.

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
  tour?: string; // il tour di cui faceva parte la serata (assente = fuori tour o non detto)
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
  kmPending?: boolean; // partenza senza indirizzo: i km arrivano quando c'è (PIANO §1.37)
  comments?: string; // ricordo libero della serata (di tutto il festival, non di un set)
  foto?: FotoEvento[]; // le foto della serata, nell'ordine scelto (di tutto il festival, come il commento)
}

/** Una foto di un evento: JPEG senza metadati (convex/foto.ts), con la sua miniatura. */
export interface FotoEvento {
  url: string;
  miniatura: string;
  larghezza: number;
  altezza: number;
}

// L'unità: un concerto che è anche il proprio evento.
export interface Concert<P extends string = string, G extends string = string, D extends string = string>
  extends ConcertFacts<P>, EventInfo<G, D> {
  /** Apertura: l'artista dell'headliner della stessa serata (stessa data e venue). Nel DB è un id. */
  aperturaDi?: string;
}

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

/* ── aperture e serate ────────────────────────────────────────── */

const chiave = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const chiaveSerata = (date: string, venue: string, city: string, artist: string) => [date, venue, city, artist].map(chiave).join("\u0000");

/* L'headliner di ogni apertura, per oggetto: i dati filtrati (applyFilters,
   le righe di un anno…) sono sottoinsiemi delle stesse righe, quindi
   un'apertura ritrova il suo headliner anche quando i filtri lo lasciano
   fuori. Lo riempie `collegaAperture` (buildDataset, flatConcerts, serateOf). */
const HEADLINER = new WeakMap<Concert, Concert>();

/**
 * Collega ogni apertura di `data` al suo headliner: il concerto (non festival,
 * non a sua volta un'apertura) della stessa data e venue con l'artista di
 * `aperturaDi`. Idempotente; un'apertura senza headliner nei dati resta sola.
 */
export function collegaAperture(data: readonly Entry[]): void {
  let indice: Map<string, Concert> | undefined;
  for (const e of data) {
    if (isFestival(e) || !e.aperturaDi || HEADLINER.has(e)) continue;
    if (!indice) {
      indice = new Map();
      for (const h of data) if (!isFestival(h) && !h.aperturaDi) indice.set(chiaveSerata(h.date, h.venue, h.city, h.artist), h);
    }
    const h = indice.get(chiaveSerata(e.date, e.venue, e.city, e.aperturaDi));
    if (h) HEADLINER.set(e, h);
  }
}

/** L'headliner di un'apertura (già collegata), o undefined. */
export const headlinerDi = (e: Entry): Concert | undefined => (isFestival(e) ? undefined : HEADLINER.get(e));

/** La riga che porta venue e viaggio della serata: l'headliner per un'apertura, la riga stessa altrimenti. */
export const serataDi = (e: Entry): Entry => headlinerDi(e) ?? e;

/**
 * Le serate delle righe, una volta sola e nell'ordine in cui compaiono: le
 * statistiche per venue e per viaggio (visite, mappa, km) contano queste,
 * così un'apertura non è una visita né un viaggio in più. Un'apertura il cui
 * headliner è fuori dalle righe (filtri) porta comunque la sua serata.
 */
export function serateOf(data: readonly Entry[]): Entry[] {
  collegaAperture(data);
  const viste = new Set<Entry>();
  const out: Entry[] = [];
  for (const e of data) {
    const s = serataDi(e);
    if (viste.has(s)) continue;
    viste.add(s);
    out.push(s);
  }
  return out;
}

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
  /** Solo per un'apertura: la riga dell'headliner (chip «apertura di …», filtri, serata). */
  headliner?: Concert;
}

export const concertsOf = (e: Entry): FlatConcert[] =>
  isFestival(e)
    ? e.concerts.map(c => ({ y: e.y, date: c.date || e.date, artist: c.artist, ...(c.tour ? { tour: c.tour } : {}), venue: e.venue, city: e.city, with: c.with, voto: c.voto, vicinanza: c.vicinanza, canzoniNote: c.canzoniNote, ev: e }))
    : [{ y: e.y, date: e.date, artist: e.artist, ...(e.tour ? { tour: e.tour } : {}), venue: e.venue, city: e.city, with: e.with, voto: e.voto, vicinanza: e.vicinanza, canzoniNote: e.canzoniNote, cost: e.cost, gift: e.gift, giftFrom: e.giftFrom, accredito: e.accredito, from: e.from, km: e.km, ev: e, ...(HEADLINER.has(e) ? { headliner: HEADLINER.get(e) } : {}) }];

export const flatConcerts = (data: Entry[]): FlatConcert[] => {
  collegaAperture(data);
  return data.flatMap(concertsOf);
};

/** Chi ha regalato un biglietto: nome, sito e logo facoltativi. */
export interface GifterInfo {
  label: string;
  url?: string;
  logo?: string;
}

/** Coordinate [lng, lat]. */
export type LngLat = [number, number];
