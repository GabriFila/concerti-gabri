/* ──────────────────────────────────────────────────────────────
   I campi comuni, con la descrizione in italiano (PIANO §5.3): da qui
   derivano Convex, i form, gli strumenti MCP e dell'Oracolo, l'import.
   Le etichette delle scale vengono da shared/model/scale.ts (fonte unica).
   ────────────────────────────────────────────────────────────── */

import { z } from "zod";
import { canzoniNoteScale, vicinanzaScale } from "../model/scale.ts";

/** La regola dei soprannomi (PIANO §1.42), da ripetere ovunque si inseriscono nomi. */
export const REGOLA_SOPRANNOMI =
  "Usa soprannomi o diminutivi, non nome e cognome: 'Marco Rossi' → 'Marco R.'";

export const voto = z
  .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
  .describe("Voto del concerto da 1 (pessimo) a 5 (indimenticabile); più alto = meglio");

export const vicinanza = z
  .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)])
  .describe(`Quanto vicino al palco, più alto = più vicino: ${vicinanzaScale()}`);

export const canzoniNote = z
  .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal("na")])
  .describe(`Quante canzoni della scaletta conoscevi: ${canzoniNoteScale()}; "na" = non ricordo`);

export const costo = z
  .union([z.number().min(0).max(10000), z.literal("na")])
  .describe('Prezzo del biglietto in euro (0 = gratis), oppure "na" se pagato ma il prezzo è dimenticato');

export const DATA_GIORNO_RE = /^\d{2}\/\d{2}\/\d{4}$/;
export const DATA_EVENTO_RE = /^\d{2}(?:[–-]\d{2})?\/\d{2}\/\d{4}$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Data di un giorno nel formato del DB, "gg/mm/aaaa". */
export const dataGiorno = z.string().regex(DATA_GIORNO_RE).describe('Data del concerto, "gg/mm/aaaa"');

/** Data di un evento nel DB: "gg/mm/aaaa" oppure più giorni "30–31/03/2017". */
export const dataEvento = z
  .string()
  .regex(DATA_EVENTO_RE)
  .describe('Data dell\'evento, "gg/mm/aaaa"; più giorni: "30–31/03/2017"');

/** "AAAA-MM-GG" → "gg/mm/aaaa"; il resto invariato. */
export function isoInGiorno(s: string): string {
  const m = ISO_RE.exec(s.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s.trim();
}

const dataValida = (s: string) => {
  const m = /(\d{2})(?:[–-]\d{2})?\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return false;
  const [d, mo, y] = [+m[1], +m[2], +m[3]];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 1950 && y <= 2100;
};

/** Data in ingresso (agenti, import, form): accetta anche l'ISO "AAAA-MM-GG". */
export const dataEventoInput = z
  .string()
  .transform(isoInGiorno)
  .pipe(z.string().regex(DATA_EVENTO_RE).refine(dataValida, "data non valida"))
  .describe('Data dell\'evento: "gg/mm/aaaa", "AAAA-MM-GG" oppure più giorni "30–31/03/2017"');

export const dataGiornoInput = z
  .string()
  .transform(isoInGiorno)
  .pipe(z.string().regex(DATA_GIORNO_RE).refine(dataValida, "data non valida"))
  .describe('Giorno del singolo concerto (festival su più giorni): "gg/mm/aaaa" o "AAAA-MM-GG"');

export const urlHttps = z
  .string()
  .max(500)
  .refine(s => {
    try {
      return new URL(s).protocol === "https:";
    } catch {
      return false;
    }
  }, "serve un URL https")
  .describe("Indirizzo web che inizia con https://");

export const nomePersona = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .describe(`Nome di un compagno di concerto. ${REGOLA_SOPRANNOMI}`);

export const artista = z.string().trim().min(1).max(120).describe("Nome dell'artista o del gruppo, come in locandina");
export const nomeFestival = z.string().trim().min(1).max(120).describe('Nome del festival, es. "MI AMI 2026"');
export const nomeVenue = z.string().trim().min(1).max(120).describe("Nome del locale, teatro, stadio o festival dove si è suonato");
export const nomeCitta = z.string().trim().min(1).max(80).describe("Città della venue");
export const nomePartenza = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .describe('Nome pubblico della partenza del viaggio, es. "Casa Milano" (mai l\'indirizzo)');
export const etichettaRegalo = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .describe(`Chi ha regalato il biglietto (persona o azienda). Se è una persona: ${REGOLA_SOPRANNOMI}`);
export const commento = z
  .string()
  .max(2000)
  .describe("Ricordo libero della serata (di tutto il festival, non di un set)");

export const conferma = z
  .literal(true)
  .describe("Deve essere true: conferma esplicita dell'utente per un'operazione che cancella");

/** Forma grammaticale del proprietario. */
export const forma = z.enum(["f", "m", "n"]).describe("Forma grammaticale delle etichette in prima persona: f femminile, m maschile, n neutra");

export const handle = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/)
  .describe("Handle della pagina: minuscole, numeri e '-', da 3 a 30 caratteri");

export const nomeVisualizzato = z.string().trim().min(1).max(40).describe("Nome mostrato sulla pagina");

/** L'input delle operazioni senza argomenti (gli elenchi). */
export const nessunInput = z.object({}).describe("Nessun argomento");
