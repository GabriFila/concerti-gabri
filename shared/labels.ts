/* ──────────────────────────────────────────────────────────────
   Le etichette in prima persona secondo la forma grammaticale del profilo
   (SPEC "Forma grammaticale", PIANO traguardo 4).

   - `m`: i testi di sempre, quelli della pagina di Gabri (la parità con
     `main` li confronta lettera per lettera);
   - `f`: gli stessi al femminile;
   - `n`: il neutro RIFORMULA invece di scegliere una desinenza, senza
     participi o aggettivi marcati ("Dove ho visto concerti").

   Qui stanno solo le frasi che cambiano con la forma: tutto il resto della
   pagina è già neutro. Puro e isomorfo: lo leggono la pagina, i titoli
   delle sezioni (shared/sections.ts), i filtri e i KPI.
   ────────────────────────────────────────────────────────────── */

export const FORME = ["f", "m", "n"] as const;
export type Forma = (typeof FORME)[number];

export const ETICHETTE = {
  /** Titolo della mappa (sec-mappa) e voce del TOC. */
  secMappa: { m: "Dove sono andato", f: "Dove sono andata", n: "Dove ho visto concerti" },
  /** Titolo della card della vicinanza (sec-vicinanza) e voce del TOC. */
  secVicinanza: { m: "Quanto sono vicino", f: "Quanto sono vicina", n: "Quanto mi avvicino al palco" },
  /** Etichetta della KPI dei concerti senza compagni. */
  kpiSolo: { m: "Concerti da solo", f: "Concerti da sola", n: "Concerti senza compagnia" },
  /** Il filtro "nessun compagno" (in testa alla lista dei compagni). */
  filtroSolo: { m: "Da solo", f: "Da sola", n: "Senza compagnia" },
  /** Lo stesso filtro nel riassunto testuale (describeFilters, Oracolo). */
  riassuntoSolo: { m: "da solo", f: "da sola", n: "senza compagnia" },
  /** Ritratto, atto "Con chi": "… e N concerti vissuti da solo." */
  ritrattoSolo: { m: "concerti vissuti da solo", f: "concerti vissuti da sola", n: "concerti vissuti senza compagnia" },
  /** Legenda del voto 5★ ("Epico, …"). */
  voto5: {
    m: "se non ci fossi stato mi sarei buttato",
    f: "se non ci fossi stata mi sarei buttata",
    n: "se l'avessi perso non me lo sarei mai perdonato",
  },
  /** Descrizione della card dei commenti. */
  commentiDesc: {
    m: "Quello che mi sono segnato dopo la serata.",
    f: "Quello che mi sono segnata dopo la serata.",
    n: "Quello che ho annotato dopo la serata.",
  },
} as const satisfies Record<string, Record<Forma, string>>;

export type EtichettaId = keyof typeof ETICHETTE;

/** La forma di un profilo; un valore mancante o sconosciuto vale neutro (come `pages.byHandle`). */
export const formaDi = (x: unknown): Forma => (x === "f" || x === "m" || x === "n" ? x : "n");

/** L'etichetta `id` nella forma data. */
export const etichetta = (id: EtichettaId, forma: Forma): string => ETICHETTE[id][formaDi(forma)];
