/* Persone (compagni di concerto): gli input delle operazioni, condivisi tra
   le funzioni Convex (convex/people.ts) e il catalogo degli agenti. */

import { z } from "zod";
import { nomePersona } from "./campi.ts";
import { idDi } from "./ids.ts";

export const aggiungiPersonaInput = z.object({ name: nomePersona }).describe("Nuova persona");

export const rinominaPersonaInput = z
  .object({ id: idDi("people").describe("Id della persona"), name: nomePersona })
  .describe("Nuovo nome");

export const unisciPersoneInput = z
  .object({
    from: idDi("people").describe("Persona da unire (sparisce)"),
    into: idDi("people").describe("Persona che resta"),
  })
  .describe("Unione di due persone");

export const cancellaPersonaInput = z
  .object({ id: idDi("people").describe("Id della persona"), confirm: z.literal(true).describe("Conferma esplicita") })
  .describe("Persona da cancellare");
