/* Partenze (PIANO §5.5): il nome è pubblico, l'indirizzo non esce mai dal server. */

import { z } from "zod";
import { nomePartenza } from "./campi.ts";
import { idDi } from "./ids.ts";

export const aggiungiPartenzaInput = z.object({ name: nomePartenza }).describe("Nuova partenza: solo il nome (l'indirizzo si imposta dalla dashboard)");

export const rinominaPartenzaInput = z
  .object({
    id: idDi("departures").describe("Id della partenza"),
    name: nomePartenza,
  })
  .describe("Nuovo nome di una partenza");

export const cancellaPartenzaInput = z
  .object({
    id: idDi("departures").describe("Id della partenza"),
    confirm: z.literal(true).describe("Conferma esplicita della cancellazione"),
  })
  .describe("Cancella una partenza non usata da nessun concerto");

/** Solo dashboard: l'indirizzo arriva come testo e si valida qui. */
export const indirizzo = z.string().trim().min(5).max(200).describe("Indirizzo di partenza (privato, solo dashboard)");

export const geocodificaPartenzaInput = z
  .object({
    departureId: idDi("departures").describe("Id della partenza"),
    address: indirizzo,
  })
  .describe("Cerca i candidati per l'indirizzo di una partenza");

export const confermaIndirizzoInput = z
  .object({
    departureId: idDi("departures").describe("Id della partenza"),
    indice: z.number().int().min(0).max(9).describe("Indice del candidato scelto"),
  })
  .describe("Sceglie uno dei candidati proposti");

/** Come gli agenti vedono una partenza. */
export const partenzaPubblica = z.object({
  id: z.string().describe("Id della partenza"),
  name: nomePartenza,
  stato: z.enum(["impostato", "mancante"]).describe("Se l'indirizzo è impostato (mai l'indirizzo stesso)"),
});
