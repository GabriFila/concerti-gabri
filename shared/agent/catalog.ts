/* ──────────────────────────────────────────────────────────────
   Catalogo delle operazioni per agenti (PIANO §5.3, traguardo 7),
   CONGELATO nel traguardo 2: MCP (`inputSchema`), l'Oracolo in scrittura
   (`toolDefinition`) e il registro di convex/ ne derivano.

   - `funzione`: la funzione Convex che lo realizza ("modulo:nome"); il
     builder la etichetta con `catalogOp: <name>` e convex/registry.test.ts
     controlla la corrispondenza nei due sensi;
   - `traguardo`: quando arriva la funzione (le operazioni di T5/T7 possono
     mancare fino ad allora);
   - `confirm`: chiede `confirm: true` (cancellazioni, import > 10 righe).
   Nessuna operazione legge o scrive indirizzi.
   ────────────────────────────────────────────────────────────── */

import { z } from "zod";
import { REGOLA_SOPRANNOMI, nomePersona, artista, nessunInput } from "../schema/campi.ts";
import { annullaInput, elencaAttivitaInput } from "../schema/activity.ts";
import { aggiungiPartenzaInput, cancellaPartenzaInput, rinominaPartenzaInput, partenzaPubblica } from "../schema/departure.ts";
import { cancellaConcertoInput, elencaConcertiInput, entryInput, leggiConcertoInput, modificaConcertoInput, statisticheInput } from "../schema/entry.ts";
import { importaConcertiInput } from "../schema/importFormat.ts";
import { aggiungiRegaloInput, cancellaRegaloInput, logoRegaloInput, modificaRegaloInput } from "../schema/gifter.ts";
import { aggiungiPersonaInput, cancellaPersonaInput, rinominaPersonaInput, unisciPersoneInput } from "../schema/people.ts";
import { aggiornaProfiloInput, impostaTemaInput } from "../schema/profile.ts";
import { aggiungiVenueInput, candidatoProposto, cercaVenueInput } from "../schema/venue.ts";
import { impostaWishlistInput } from "../schema/wishlist.ts";
import { canzoniNoteScale, vicinanzaScale } from "../model/scale.ts";

export interface OperazioneCatalogo {
  name: string;
  descrizione: string;
  tipo: "lettura" | "scrittura";
  input: z.ZodType;
  output: z.ZodType;
  confirm?: boolean;
  funzione: string;
  traguardo: 2 | 5 | 7;
}

const vuoto = nessunInput;
const ok = z.object({ ok: z.literal(true) });
const conId = z.object({ id: z.string().describe("Id del documento") });
const SCALE = `Scale (più alto = meglio): voto 1–5; vicinanza ${vicinanzaScale()}; canzoni note ${canzoniNoteScale()} oppure "na".`;

const op = (o: OperazioneCatalogo) => o;

export const CATALOGO: readonly OperazioneCatalogo[] = [
  /* ── lettura ── */
  op({ name: "get_profile", tipo: "lettura", traguardo: 2, funzione: "profiles:get", input: vuoto,
    output: z.object({ handle: z.string().optional(), displayName: z.string().optional(), forma: z.string().optional(), status: z.string() }),
    descrizione: "Il profilo del proprietario: handle, nome visualizzato, forma grammaticale, tema e layout." }),
  op({ name: "list_concerts", tipo: "lettura", traguardo: 2, funzione: "entries:list", input: elencaConcertiInput,
    output: z.object({ concerts: z.array(z.any()) }),
    descrizione: `Elenca concerti e festival, con filtri per anno, artista o "da completare" (passati senza voto, vicinanza o canzoni note: proponi di completarli). ${SCALE}` }),
  op({ name: "get_concert", tipo: "lettura", traguardo: 2, funzione: "entries:get", input: leggiConcertoInput, output: z.any(),
    descrizione: "Legge un concerto o festival per id, con i nomi di persone, venue, partenza e \"regalato da\"." }),
  op({ name: "list_people", tipo: "lettura", traguardo: 2, funzione: "people:list", input: vuoto,
    output: z.object({ people: z.array(z.object({ id: z.string(), name: nomePersona, concerti: z.number() })) }),
    descrizione: `Le persone (compagni di concerto) del proprietario. ${REGOLA_SOPRANNOMI}` }),
  op({ name: "list_departures", tipo: "lettura", traguardo: 2, funzione: "departures:list", input: vuoto,
    output: z.object({ departures: z.array(partenzaPubblica) }),
    descrizione: "Le partenze dei viaggi: nome e stato impostato/mancante, MAI l'indirizzo. Se manca l'indirizzo, chiedi di impostarlo dalla dashboard (#partenze)." }),
  op({ name: "list_gifters", tipo: "lettura", traguardo: 2, funzione: "gifters:list", input: vuoto,
    output: z.object({ gifters: z.array(z.object({ id: z.string(), label: z.string(), url: z.string().optional() })) }),
    descrizione: "Chi ha regalato biglietti (\"regalato da\")." }),
  op({ name: "list_wishlist", tipo: "lettura", traguardo: 2, funzione: "wishlist:list", input: vuoto,
    output: z.object({ artists: z.array(artista) }),
    descrizione: "La lista dei desideri: artisti da vedere, in ordine." }),
  op({ name: "search_venue", tipo: "lettura", traguardo: 2, funzione: "geo:searchVenue", input: cercaVenueInput,
    output: z.object({ catalogo: z.array(z.object({ id: z.string(), name: z.string(), city: z.string() })), candidati: z.array(candidatoProposto), attribuzione: z.string() }),
    descrizione: "Cerca una venue: prima nel catalogo condiviso, poi su OpenStreetMap (© OpenStreetMap contributors). Per aggiungerne una al catalogo usa add_venue con il ref di un candidato." }),
  op({ name: "get_stats", tipo: "lettura", traguardo: 7, funzione: "agents:stats", input: statisticheInput, output: z.any(),
    descrizione: "Le statistiche della pagina (le stesse KPI della dashboard)." }),
  op({ name: "list_activity", tipo: "lettura", traguardo: 2, funzione: "activity:list",
    input: elencaAttivitaInput,
    output: z.object({ voci: z.array(z.any()) }),
    descrizione: "Il registro delle attività, dalla più recente, con autore (dashboard, Oracolo, MCP, API key, sistema). Ogni voce si annulla con undo." }),

  /* ── scrittura ── */
  op({ name: "add_concert", tipo: "scrittura", traguardo: 2, funzione: "entries:add", input: entryInput, output: conId,
    descrizione: `Aggiunge un concerto o un festival (almeno 2 concerti). Persone, venue, partenza e "regalato da" si indicano per nome e devono esistere. ${REGOLA_SOPRANNOMI}. ${SCALE} I km li calcola il server.` }),
  op({ name: "update_concert", tipo: "scrittura", traguardo: 2, funzione: "entries:update", input: modificaConcertoInput, output: conId,
    descrizione: `Modifica un concerto o festival; null toglie un campo. ${REGOLA_SOPRANNOMI}. ${SCALE}` }),
  op({ name: "delete_concert", tipo: "scrittura", traguardo: 2, funzione: "entries:remove", input: cancellaConcertoInput, output: ok, confirm: true,
    descrizione: "Cancella un concerto o festival. Chiedi conferma all'utente e passa confirm: true. Si può annullare con undo." }),
  op({ name: "add_person", tipo: "scrittura", traguardo: 2, funzione: "people:add", input: aggiungiPersonaInput, output: conId,
    descrizione: `Aggiunge una persona. ${REGOLA_SOPRANNOMI}` }),
  op({ name: "rename_person", tipo: "scrittura", traguardo: 2, funzione: "people:rename",
    input: rinominaPersonaInput, output: ok,
    descrizione: `Rinomina una persona (i concerti la seguono). ${REGOLA_SOPRANNOMI}` }),
  op({ name: "merge_person", tipo: "scrittura", traguardo: 2, funzione: "people:merge",
    input: unisciPersoneInput, output: ok,
    descrizione: "Unisce due persone: i concerti della prima passano alla seconda. Si annulla con undo." }),
  op({ name: "delete_person", tipo: "scrittura", traguardo: 2, funzione: "people:remove",
    input: cancellaPersonaInput, output: ok, confirm: true,
    descrizione: "Cancella una persona non usata da nessun concerto (altrimenti errore con l'elenco). Chiedi conferma." }),
  op({ name: "add_departure", tipo: "scrittura", traguardo: 2, funzione: "departures:add", input: aggiungiPartenzaInput, output: conId,
    descrizione: "Aggiunge una partenza: solo il nome. L'indirizzo lo imposta il proprietario dalla dashboard (#partenze); finché manca, i km restano in attesa." }),
  op({ name: "rename_departure", tipo: "scrittura", traguardo: 2, funzione: "departures:rename", input: rinominaPartenzaInput, output: ok,
    descrizione: "Rinomina una partenza (mai l'indirizzo)." }),
  op({ name: "delete_departure", tipo: "scrittura", traguardo: 2, funzione: "departures:remove", input: cancellaPartenzaInput, output: ok, confirm: true,
    descrizione: "Cancella una partenza non usata. Chiedi conferma." }),
  op({ name: "add_venue", tipo: "scrittura", traguardo: 2, funzione: "venues:createFromCandidate", input: aggiungiVenueInput, output: conId,
    descrizione: "Aggiunge al catalogo condiviso una venue scelta tra i candidati di search_venue: passa il suo ref (coordinate, città e id OSM li prende il server da OpenStreetMap). Le coordinate non si modificano mai." }),
  op({ name: "add_gifter", tipo: "scrittura", traguardo: 2, funzione: "gifters:add", input: aggiungiRegaloInput, output: conId,
    descrizione: `Aggiunge un "regalato da". ${REGOLA_SOPRANNOMI}` }),
  op({ name: "update_gifter", tipo: "scrittura", traguardo: 2, funzione: "gifters:update", input: modificaRegaloInput, output: ok,
    descrizione: `Modifica un "regalato da". ${REGOLA_SOPRANNOMI}` }),
  op({ name: "delete_gifter", tipo: "scrittura", traguardo: 2, funzione: "gifters:remove", input: cancellaRegaloInput, output: ok, confirm: true,
    descrizione: "Cancella un \"regalato da\" non usato. Chiedi conferma." }),
  op({ name: "set_gifter_logo", tipo: "scrittura", traguardo: 5, funzione: "gifters:setLogoFromUrl", input: logoRegaloInput, output: ok,
    descrizione: "Imposta il logo di un \"regalato da\" da un URL https (png, jpeg o webp, max 256 KB); null lo toglie." }),
  op({ name: "set_wishlist", tipo: "scrittura", traguardo: 2, funzione: "wishlist:set",
    input: impostaWishlistInput, output: ok,
    descrizione: "Sostituisce la lista dei desideri." }),
  op({ name: "update_profile", tipo: "scrittura", traguardo: 2, funzione: "profiles:update", input: aggiornaProfiloInput, output: ok,
    descrizione: "Cambia nome visualizzato, handle (il vecchio reindirizza) o forma grammaticale." }),
  op({ name: "set_theme", tipo: "scrittura", traguardo: 2, funzione: "profiles:setTheme", input: impostaTemaInput, output: ok,
    descrizione: "Cambia tema (preset e token validati) e layout delle sezioni (ordine, nascoste, titoli)." }),
  op({ name: "import_concerts", tipo: "scrittura", traguardo: 7, funzione: "importer:apply",
    input: importaConcertiInput,
    output: z.object({ importate: z.number(), batchId: z.string() }), confirm: true,
    descrizione: `Importa concerti da CSV o JSON; sopra le 10 righe chiede confirm: true. ${REGOLA_SOPRANNOMI}` }),
  op({ name: "undo", tipo: "scrittura", traguardo: 2, funzione: "activity:undo",
    input: annullaInput, output: ok,
    descrizione: "Annulla una voce del registro (o il suo lotto). Se il documento è cambiato dopo, chiede di annullare prima le modifiche successive." }),
];

export const NOMI_CATALOGO: readonly string[] = CATALOGO.map(o => o.name);
export const operazione = (name: string) => CATALOGO.find(o => o.name === name);
