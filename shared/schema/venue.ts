/* Catalogo venue condiviso (PIANO §5.5.4): si crea solo da un candidato OSM o dalla città.

   I candidati li emette il server: geo.searchVenue li salva nella cache
   condivisa (venueSearchCache, solo POI o città da Nominatim) e al
   chiamante dà un `ref` opaco per ciascuno. add_venue accetta SOLO quel
   `ref` (più un nome facoltativo): coordinate, id OSM, città e tipo li
   rilegge il server dalla cache. Nessun chiamante può quindi mettere nel
   catalogo coordinate scelte da lui (una via, un indirizzo) né occupare un
   id OSM o un nome+città con coordinate false. */

import { z } from "zod";
import { nomeCitta, nomeVenue } from "./campi.ts";

export const cercaVenueInput = z
  .object({
    query: z.string().trim().min(2).max(120).describe('Cosa cercare, es. "Forum di Assago" o "Fabrique Milano"'),
  })
  .describe("Cerca una venue su OpenStreetMap (all'invio, non mentre si scrive)");

/** Un candidato come lo salva il server (cache condivisa delle ricerche). */
export const candidatoVenue = z.object({
  osm: z.string().regex(/^[NWR]\d{1,15}$/).optional().describe("Id OpenStreetMap del luogo (N/W/R + numero)"),
  name: nomeVenue,
  city: nomeCitta,
  lng: z.number().min(-180).max(180).describe("Longitudine"),
  lat: z.number().min(-90).max(90).describe("Latitudine"),
  featureType: z.enum(["poi", "city"]).describe("poi = luogo preciso; city = solo la città (nessun POI trovato)"),
  label: z.string().max(300).describe("Descrizione leggibile del candidato"),
});
export type CandidatoVenue = z.infer<typeof candidatoVenue>;

/** `ref` di un candidato: `<id della ricerca in cache>:<indice>`. */
export const RIF_CANDIDATO_RE = /^[A-Za-z0-9]{8,64}:\d{1,2}$/;
export const rifCandidato = (cacheId: string, indice: number) => `${cacheId}:${indice}`;

/** Un candidato come lo restituisce search_venue: in più il `ref` per add_venue. */
export const candidatoProposto = candidatoVenue.extend({
  ref: z.string().regex(RIF_CANDIDATO_RE).describe("Riferimento del candidato da passare ad add_venue"),
});
export type CandidatoProposto = z.infer<typeof candidatoProposto>;

export const aggiungiVenueInput = z
  .object({
    ref: z.string().regex(RIF_CANDIDATO_RE).describe("Il ref di uno dei candidati restituiti da search_venue: coordinate, città e id OSM li prende il server"),
    name: nomeVenue.optional().describe("Nome da usare se diverso da quello del candidato (la città e il luogo restano quelli del candidato)"),
  })
  // un candidato intero (coordinate comprese) al posto del ref è un errore, non un campo ignorato
  .strict()
  .describe("Aggiunge al catalogo la venue scelta tra i candidati di search_venue");
