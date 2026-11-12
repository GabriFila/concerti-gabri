/* ──────────────────────────────────────────────────────────────
   Le foto di un evento (DECISIONI «Foto dei concerti»): solo dashboard.

   Il browser ridimensiona e ricodifica ogni foto in JPEG prima di
   caricarla (src/modifica/foto/elabora.ts): due file, la foto (lato lungo
   al massimo FOTO_LATO px) e la miniatura (MINIATURA_LATO px). Ricodificare
   toglie i metadati EXIF, GPS compreso; il server lo ricontrolla
   comunque (convex/lib/jpeg.ts) e rifiuta un JPEG con metadati, così una
   foto scattata a casa non porta mai le coordinate sulla pagina pubblica.
   ────────────────────────────────────────────────────────────── */

import { z } from "zod";
import { idDi } from "./ids.ts";

/** Foto per evento, al massimo. */
export const FOTO_PER_EVENTO = 20;
/** Lato lungo massimo della foto e della miniatura (px). */
export const FOTO_LATO = 2048;
export const MINIATURA_LATO = 512;
/** Dimensioni massime dei file caricati. */
export const FOTO_MAX_BYTES = 2 * 1024 * 1024;
export const MINIATURA_MAX_BYTES = 200 * 1024;
/** Il solo tipo che si carica: il browser ricodifica tutto in JPEG. */
export const FOTO_TIPO = "image/jpeg";

export const urlCaricamentoFotoInput = z
  .object({ entryId: idDi("entries").describe("Id del concerto o festival a cui andrà la foto") })
  .describe("Chiede i due URL per caricare una foto (e la sua miniatura) dal browser");

export const fotoCaricataInput = z
  .object({
    entryId: idDi("entries").describe("Id del concerto o festival"),
    file: idDi("_storage").describe("La foto appena caricata (jpeg senza metadati)"),
    miniatura: idDi("_storage").describe("La miniatura appena caricata (jpeg senza metadati)"),
  })
  .describe("Aggiunge all'evento una foto appena caricata dal browser");

export const fotoDiEventoInput = z
  .object({ entryId: idDi("entries").describe("Id del concerto o festival") })
  .describe("Le foto di un evento");

export const togliFotoInput = z
  .object({ id: idDi("foto").describe("Id della foto"), confirm: z.literal(true).describe("Conferma esplicita") })
  .describe("Toglie una foto (il file si cancella)");

export const spostaFotoInput = z
  .object({ id: idDi("foto").describe("Id della foto"), verso: z.enum(["prima", "dopo"]).describe("Un posto prima o dopo") })
  .describe("Sposta una foto di un posto nell'ordine dell'evento");

/** Agenti (link_foto_concerto): il link al pannello del concerto, dove il proprietario carica le foto. */
export const linkFotoInput = z
  .object({ id: idDi("entries").describe("Id del concerto o festival (da list_concerts)") })
  .describe("Il link per caricare le foto di un concerto dalla dashboard");
