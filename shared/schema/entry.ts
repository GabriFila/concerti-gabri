/* ──────────────────────────────────────────────────────────────
   Concerti e festival (PIANO §5.1, §5.3).

   Due forme:
   - DB (`entryDb`): riferimenti per id (persone, venue, partenza,
     "regalato da"), così rinominare non rompe niente;
   - esterna (`entryInput`): gli agenti, l'import e i form usano i NOMI,
     tradotti in id da un unico `resolveRefs` lato server. La data si
     accetta anche in ISO; un festival richiede almeno 2 concerti.
   ────────────────────────────────────────────────────────────── */

import { z } from "zod";
import {
  artista, canzoniNote, commento, costo, dataEvento, dataEventoInput, dataGiorno, dataGiornoInput,
  etichettaRegalo, nomeCitta, nomeFestival, nomePartenza, nomePersona, nomeVenue, vicinanza, voto,
} from "./campi.ts";
import { idDi } from "./ids.ts";

/* ── DB ──────────────────────────────────────────────────────── */

export const concertoFestivalDb = z.object({
  cid: z.string().min(1).max(40).describe("Id stabile del concerto dentro il festival"),
  artist: artista,
  with: z.array(idDi("people").describe("Id di una persona")).describe("Compagni del concerto"),
  voto: voto.optional(),
  vicinanza: vicinanza.optional(),
  canzoniNote: canzoniNote.optional(),
  date: dataGiorno.optional(),
});

export const entryDbFields = {
  profileId: idDi("profiles").describe("Proprietario"),
  kind: z.enum(["concert", "festival"]).describe("concert = un concerto singolo; festival = più concerti con un solo biglietto"),
  date: dataEvento,
  sortKey: z.number().int().describe("AAAAMMGG del primo giorno, per ordinare"),
  y: z.number().int().describe("Anno dell'evento"),
  venueId: idDi("venues").describe("Venue del catalogo"),
  cost: costo.optional(),
  gift: z.boolean().optional().describe("Biglietto regalato"),
  giftFromId: idDi("gifters").optional().describe("Chi l'ha regalato"),
  accredito: z.boolean().optional().describe("Ingresso con accredito o lista ospiti"),
  departureId: idDi("departures").optional().describe("Partenza del viaggio"),
  km: z.number().min(0).optional().describe("Km di sola andata, calcolati lato server"),
  kmSource: z.enum(["legacy", "calcolato"]).optional().describe("Origine del km"),
  kmPending: z.boolean().optional().describe("Km in attesa dell'indirizzo della partenza"),
  comments: commento.optional(),
  updatedAt: z.number().describe("Ultima modifica (ms)"),
  // solo concerto
  artist: artista.optional(),
  with: z.array(idDi("people").describe("Id di una persona")).optional().describe("Compagni del concerto"),
  voto: voto.optional(),
  vicinanza: vicinanza.optional(),
  canzoniNote: canzoniNote.optional(),
  // solo festival
  name: nomeFestival.optional(),
  concerts: z.array(concertoFestivalDb).optional().describe("Concerti del festival, in ordine di lineup"),
};
export const entryDb = z.object(entryDbFields);
export type EntryDb = z.infer<typeof entryDb>;

/* ── forma esterna (nomi) ───────────────────────────────────── */

const biglietto = {
  cost: costo.optional(),
  gift: z.boolean().optional().describe("true se il biglietto è stato regalato"),
  giftFrom: etichettaRegalo.optional().describe('Chi l\'ha regalato: il nome di un "regalato da" esistente (solo con gift: true)'),
  accredito: z.boolean().optional().describe("true se l'ingresso era con accredito/lista ospiti (non un regalo)"),
};
const viaggio = {
  from: nomePartenza.optional().describe("Nome di una partenza esistente da cui è partito il viaggio; i km li calcola il server"),
};
const luogo = {
  venue: nomeVenue,
  city: nomeCitta,
};
const fatti = {
  artist: artista,
  with: z.array(nomePersona).max(30).default([]).describe("Compagni (nomi già presenti tra le persone). Usa soprannomi o diminutivi, non nome e cognome: 'Marco Rossi' → 'Marco R.'"),
  voto: voto.optional(),
  vicinanza: vicinanza.optional(),
  canzoniNote: canzoniNote.optional(),
};

export const concertoInput = z
  .object({
    kind: z.literal("concert").describe("Un concerto singolo, con il suo biglietto"),
    date: dataEventoInput,
    ...luogo,
    ...fatti,
    ...biglietto,
    ...viaggio,
    comments: commento.optional(),
  })
  .describe("Un concerto singolo");

export const concertoDiFestivalInput = z
  .object({
    ...fatti,
    date: dataGiornoInput.optional(),
  })
  .describe("Un concerto dentro un festival (niente prezzo né commento suoi)");

export const festivalInput = z
  .object({
    kind: z.literal("festival").describe("Un festival: un solo biglietto per almeno due concerti"),
    name: nomeFestival,
    date: dataEventoInput,
    ...luogo,
    ...biglietto,
    ...viaggio,
    comments: commento.optional(),
    concerts: z.array(concertoDiFestivalInput).min(2).max(60).describe("Almeno due concerti, in ordine di lineup"),
  })
  .describe("Un festival");

export const entryInput = z.discriminatedUnion("kind", [concertoInput, festivalInput]).describe("Un concerto o un festival");
export type EntryInput = z.output<typeof entryInput>;

/** Modifica parziale: i campi assenti restano; `null` toglie un campo facoltativo. */
export const entryPatch = z
  .object({
    date: dataEventoInput.optional(),
    venue: nomeVenue.optional(),
    city: nomeCitta.optional(),
    artist: artista.optional().describe("Solo per i concerti singoli"),
    name: nomeFestival.optional().describe("Solo per i festival"),
    with: z.array(nomePersona).max(30).optional().describe("Compagni (solo concerti singoli). Usa soprannomi o diminutivi, non nome e cognome: 'Marco Rossi' → 'Marco R.'"),
    voto: voto.nullable().optional(),
    vicinanza: vicinanza.nullable().optional(),
    canzoniNote: canzoniNote.nullable().optional(),
    cost: costo.nullable().optional(),
    gift: z.boolean().nullable().optional().describe("Biglietto regalato; null toglie"),
    giftFrom: etichettaRegalo.nullable().optional(),
    accredito: z.boolean().nullable().optional().describe("Accredito; null toglie"),
    from: nomePartenza.nullable().optional(),
    comments: commento.nullable().optional(),
    concerts: z.array(concertoDiFestivalInput).min(2).max(60).optional().describe("Solo per i festival: sostituisce l'intera lineup"),
  })
  .describe("Campi da cambiare");

export const modificaConcertoInput = z
  .object({ id: idDi("entries").describe("Id del concerto o festival"), patch: entryPatch })
  .describe("Modifica un concerto o un festival");

export const cancellaConcertoInput = z
  .object({ id: idDi("entries").describe("Id del concerto o festival"), confirm: z.literal(true).describe("Conferma esplicita della cancellazione") })
  .describe("Cancella un concerto o un festival");

export const elencaConcertiInput = z
  .object({
    anno: z.number().int().min(1950).max(2100).optional().describe("Solo gli eventi di quest'anno"),
    artista: z.string().max(120).optional().describe("Solo i concerti di quest'artista (senza maiuscole)"),
    da_completare: z.boolean().optional().describe("Solo i concerti passati senza voto, vicinanza o canzoni note"),
  })
  .describe("Filtri dell'elenco dei concerti");

export const leggiConcertoInput = z.object({ id: idDi("entries").describe("Id del concerto o festival") }).describe("Quale concerto leggere");

/** get_stats (traguardo 7): le statistiche, eventualmente di un solo anno. */
export const statisticheInput = z
  .object({ anno: z.number().int().min(1950).max(2100).optional().describe("Solo quest'anno") })
  .describe("Filtri delle statistiche");
