/* "Regalato da" (PIANO §5.1): nome, link https e logo facoltativi. */

import { z } from "zod";
import { etichettaRegalo, urlHttps } from "./campi.ts";
import { idDi } from "./ids.ts";

export const aggiungiRegaloInput = z
  .object({
    label: etichettaRegalo,
    url: urlHttps.optional().describe("Sito di chi ha regalato (https), facoltativo"),
  })
  .describe("Nuovo \"regalato da\"");

export const modificaRegaloInput = z
  .object({
    id: idDi("gifters").describe("Id del \"regalato da\""),
    label: etichettaRegalo.optional(),
    url: urlHttps.nullable().optional().describe("Nuovo sito (https); null lo toglie"),
  })
  .describe("Modifica un \"regalato da\"");

export const cancellaRegaloInput = z
  .object({
    id: idDi("gifters").describe("Id del \"regalato da\""),
    confirm: z.literal(true).describe("Conferma esplicita della cancellazione"),
  })
  .describe("Cancella un \"regalato da\" non usato");

export const logoRegaloInput = z
  .object({
    id: idDi("gifters").describe("Id del \"regalato da\""),
    url: urlHttps.nullable().describe("URL https di un'immagine png, jpeg o webp (max 256 KB); null toglie il logo"),
  })
  .describe("Imposta il logo da un URL");
