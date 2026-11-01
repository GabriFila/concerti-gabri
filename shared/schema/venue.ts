/* Le venue di un profilo: ognuno ha le sue (DECISIONI «Venue per profilo»).

   I candidati li emette il server: geo.searchVenue (POI o città da
   Nominatim) e geo.cercaIndirizzoVenue (l'indirizzo di una venue che su
   OpenStreetMap non c'è) li salvano nella cache delle ricerche
   (venueSearchCache) e al chiamante danno un `ref` opaco per ciascuno.
   add_venue accetta SOLO quel `ref` (più il nome da mostrare): coordinate,
   id OSM, città e tipo li rilegge il server dalla cache, quindi nessun
   chiamante scrive coordinate scelte da lui. Il nome è libero (è il tuo
   catalogo), tranne un indirizzo con il numero civico: la pagina è
   pubblica. */

import { z } from "zod";
import { nomeCitta, nomeVenue } from "./campi.ts";

export const cercaVenueInput = z
  .object({
    query: z.string().trim().min(2).max(120).describe('Cosa cercare, es. "Forum di Assago" o "Fabrique Milano"'),
  })
  .describe("Cerca una venue tra le tue e su OpenStreetMap (all'invio, non mentre si scrive)");

export const cercaIndirizzoVenueInput = z
  .object({
    address: z.string().trim().min(3).max(200).describe("L'indirizzo della venue, es. «Via Valtellina 21, Milano»"),
  })
  .describe("Cerca su OpenStreetMap l'indirizzo di una venue che non si trova per nome");

/** Un candidato come lo salva il server (cache delle ricerche). */
export const candidatoVenue = z.object({
  osm: z.string().regex(/^[NWR]\d{1,15}$/).optional().describe("Id OpenStreetMap del luogo (N/W/R + numero)"),
  name: nomeVenue,
  city: nomeCitta,
  lng: z.number().min(-180).max(180).describe("Longitudine"),
  lat: z.number().min(-90).max(90).describe("Latitudine"),
  featureType: z
    .enum(["poi", "city", "indirizzo"])
    .describe("poi = luogo preciso; city = solo la città (nessun POI trovato); indirizzo = il punto di un indirizzo dato dal proprietario"),
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
    name: nomeVenue
      .optional()
      .describe("Il nome da mostrare, se diverso da quello del candidato (es. come lo chiama il proprietario). Mai un indirizzo"),
  })
  // un candidato intero (coordinate comprese) al posto del ref è un errore, non un campo ignorato
  .strict()
  .describe("Aggiunge alle tue venue quella scelta tra i candidati di search_venue");
