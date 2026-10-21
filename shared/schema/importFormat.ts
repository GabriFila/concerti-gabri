/* ──────────────────────────────────────────────────────────────
   Formato di import CSV/JSON, CONGELATO nel traguardo 2 (PIANO §5.10).
   Il modello scaricabile (T3) e il parser papaparse (T7) sono adattatori
   di questo file e non cambiano il formato.

   CSV, colonne in quest'ordine:
     tipo,data,data_concerto,artista,festival,venue,citta,con,voto,
     vicinanza,canzoni_note,costo,regalo,regalato_da,accredito,partenza,
     commento
   - `tipo`: concerto | festival
   - `con`: nomi separati da `;`
   - `canzoni_note`: 1–5 oppure `na`
   - le righe `tipo=festival` con stessi `festival`, `venue` e `data`
     formano UN festival; `data_concerto` è il giorno del singolo set;
     `costo`, `regalo`, `regalato_da`, `accredito`, `partenza` e `commento`
     devono essere identici o vuoti in tutto il gruppo.

   JSON: un array nella forma esterna di entry.ts (`entryInput`).
   ────────────────────────────────────────────────────────────── */

import { z } from "zod";
import { REGOLA_SOPRANNOMI } from "./campi.ts";
import { entryInput } from "./entry.ts";

export const COLONNE_CSV = [
  "tipo", "data", "data_concerto", "artista", "festival", "venue", "citta", "con", "voto",
  "vicinanza", "canzoni_note", "costo", "regalo", "regalato_da", "accredito", "partenza", "commento",
] as const;
export type ColonnaCsv = (typeof COLONNE_CSV)[number];

/** Colonne che in un festival appartengono al biglietto: identiche o vuote nel gruppo. */
export const COLONNE_DI_GRUPPO = ["costo", "regalo", "regalato_da", "accredito", "partenza", "commento"] as const satisfies readonly ColonnaCsv[];

/** Chiave che raggruppa le righe di un festival. */
export const CHIAVE_FESTIVAL = ["festival", "venue", "data"] as const satisfies readonly ColonnaCsv[];

export const SEPARATORE_CON = ";";

/** Sopra questa soglia l'import chiede conferma (PIANO §5.7). */
export const CONFIRM_IMPORT_ROWS = 10;

/** Descrizione di ogni colonna, per il modello scaricabile e il prompt. */
export const DESCRIZIONE_COLONNE: Record<ColonnaCsv, string> = {
  tipo: "concerto oppure festival",
  data: 'data dell\'evento: gg/mm/aaaa, AAAA-MM-GG oppure più giorni "30–31/03/2017"',
  data_concerto: "solo festival su più giorni: il giorno del singolo concerto",
  artista: "artista o gruppo",
  festival: "solo festival: nome del festival (le righe con stesso festival, venue e data sono un festival)",
  venue: "nome della venue",
  citta: "città della venue",
  con: `compagni separati da ";". ${REGOLA_SOPRANNOMI}`,
  voto: "1–5, vuoto se non ancora visto",
  vicinanza: "1–6 (6 Transenna … 1 Anello alto), vuoto se non ancora visto",
  canzoni_note: "1–5 oppure na (non ricordo)",
  costo: "prezzo in euro, oppure na se pagato ma dimenticato",
  regalo: "si se il biglietto è un regalo",
  regalato_da: `chi l'ha regalato (un "regalato da" esistente). ${REGOLA_SOPRANNOMI}`,
  accredito: "si se l'ingresso era con accredito",
  partenza: "nome di una partenza esistente",
  commento: "ricordo libero della serata",
};

/** Una riga CSV grezza (tutte stringhe, vuoto = assente). */
export const rigaCsv = z.object(
  Object.fromEntries(COLONNE_CSV.map(c => [c, z.string().optional().describe(DESCRIZIONE_COLONNE[c])])) as Record<ColonnaCsv, z.ZodOptional<z.ZodString>>,
);
export type RigaCsv = z.infer<typeof rigaCsv>;

/** Il JSON di import: un array di concerti e festival nella forma esterna. */
export const importJson = z.array(entryInput).max(2000).describe("Concerti e festival da importare");

/** import_concerts (traguardo 7): il contenuto da importare, in uno dei due formati. */
export const importaConcertiInput = z
  .object({
    formato: z.enum(["csv", "json"]).describe("Formato del contenuto"),
    contenuto: z.string().max(500_000).describe("Il CSV o il JSON da importare (formato di shared/schema/importFormat.ts)"),
    confirm: z.boolean().optional().describe(`Obbligatorio (true) sopra le ${CONFIRM_IMPORT_ROWS} righe`),
  })
  .describe("Import di concerti");
