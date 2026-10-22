/* ──────────────────────────────────────────────────────────────
   Input delle funzioni SOLO DASHBOARD di /<handle>/modifica (T5): non
   sono nel catalogo degli agenti (PIANO §5.2, tabella `dashboardOnly`),
   ma i form della dashboard li usano come validatori, e convex/ li
   rivalida dentro gli handler.
   ────────────────────────────────────────────────────────────── */

import { z } from "zod";
import { handle, urlHttps } from "./campi.ts";
import { idDi } from "./ids.ts";
import { importJson } from "./importFormat.ts";

/** Logo dei "regalato da": tipi e dimensione ammessi (upload dal browser e da URL). */
export const LOGO_TIPI = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_MAX_BYTES = 256 * 1024;

export const urlCaricamentoLogoInput = z
  .object({ id: idDi("gifters").describe("Id del \"regalato da\" a cui andrà il logo") })
  .describe("Chiede un URL per caricare un logo dal browser");

export const logoCaricatoInput = z
  .object({
    id: idDi("gifters").describe("Id del \"regalato da\""),
    storageId: idDi("_storage").nullable().describe("Il file appena caricato (png, jpeg o webp, max 256 KB); null toglie il logo"),
  })
  .describe("Imposta (o toglie) il logo caricato dal browser");

export const extraProfiloInput = z
  .object({
    creditoFooter: z.string().trim().max(200).nullable().optional().describe("Riga di ringraziamento nel footer; null la toglie"),
    linkTappi: urlHttps.nullable().optional().describe("Link facoltativo nel footer (https); null lo toglie"),
  })
  .describe("Contenuti personali facoltativi del footer");

export const eliminaAccountInput = z
  .object({ conferma: handle.describe("L'handle della pagina, riscritto per confermare l'eliminazione") })
  .describe("Elimina l'account e tutti i suoi dati");

/** Tema da descrizione: il testo che l'utente scrive in #stile. */
export const descrizioneTemaInput = z
  .object({ descrizione: z.string().trim().min(3).max(300).describe("Com'è il tema che vuoi, a parole (es. \"notte d'estate al mare\")") })
  .describe("Descrizione del tema da generare");

/**
 * Il file di «Esporta i tuoi dati» (account.esporta): un oggetto con
 * profilo, persone, partenze… e `concerti`, che è l'import JSON di
 * importFormat.ts. Un import che riconosce `formato` ne prende i concerti.
 */
export const FORMATO_EXPORT = "concerti-gabri/export";
export const fileEsportato = z
  .object({
    formato: z.literal(FORMATO_EXPORT).describe("Il segno del file scaricato da #account"),
    concerti: importJson.describe("I concerti e i festival, nel formato dell'import JSON"),
  })
  .describe("File esportato da #account: l'import ne usa i concerti");
