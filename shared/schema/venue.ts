/* Catalogo venue condiviso (PIANO §5.5.4): si crea solo da un candidato OSM o dalla città.

   I candidati li emette il server: geo.searchVenue li salva nella cache
   condivisa (venueSearchCache, solo POI o città da Nominatim) e al
   chiamante dà un `ref` opaco per ciascuno. add_venue accetta SOLO quel
   `ref` (più un nome facoltativo): coordinate, id OSM, città e tipo li
   rilegge il server dalla cache. Nessun chiamante può quindi mettere nel
   catalogo coordinate scelte da lui (una via, un indirizzo).

   Il nome non può travestire un luogo da un altro: un POI di OpenStreetMap
   tiene il SUO nome (nomeVenueAmmesso), e una venue già nel catalogo con lo
   stesso nome+città si riusa solo se sta nello stesso punto del candidato
   (convex/venues.ts). Altrimenti chi aggiungesse più tardi la venue vera
   finirebbe sul punto scelto da un altro, e il km pubblico del suo concerto
   direbbe quanto dista casa sua da quel punto. */

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
    name: nomeVenue
      .optional()
      .describe(
        "Solo se serve, il nome da mostrare: per un luogo di OpenStreetMap (featureType poi) resta il suo nome, al più con un dettaglio tra parentesi " +
          "quando nella stessa città c'è già un'altra venue con quel nome, es. «Teatro Verdi (Sestri)»; per il ripiego sulla città (featureType city) è il nome del locale",
      ),
  })
  // un candidato intero (coordinate comprese) al posto del ref è un errore, non un campo ignorato
  .strict()
  .describe("Aggiunge al catalogo la venue scelta tra i candidati di search_venue");

/** Confronto dei nomi a meno di maiuscole, accenti, punteggiatura e spazi. */
const formaBase = (s: string): string =>
  s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** `Nome (dettaglio)` → `{ base: "Nome", dettaglio: "dettaglio" }`; altrimenti null. */
export function nomeConDettaglio(nome: string): { base: string; dettaglio: string } | null {
  const m = /^(.*\S)\s*\(([^()]*)\)$/.exec(nome.trim());
  return m && formaBase(m[2]) ? { base: m[1], dettaglio: m[2].trim() } : null;
}

/**
 * Il nome che add_venue accetta per un candidato.
 * - Ripiego sulla città: qualunque nome (le coordinate sono quelle del centro abitato).
 * - POI di OpenStreetMap: il suo nome, a meno di maiuscole, accenti e
 *   punteggiatura; `conDettaglio` ammette anche `<nome del POI> (dettaglio)`,
 *   che il server concede solo per distinguerlo da un'omonima nella stessa città.
 */
export function nomeVenueAmmesso(
  candidato: Pick<CandidatoVenue, "name" | "featureType">,
  nome: string,
  { conDettaglio = false }: { conDettaglio?: boolean } = {},
): boolean {
  if (candidato.featureType === "city") return true;
  if (formaBase(nome) === formaBase(candidato.name)) return true;
  const d = conDettaglio ? nomeConDettaglio(nome) : null;
  return !!d && formaBase(d.base) === formaBase(candidato.name);
}
