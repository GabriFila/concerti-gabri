/* Registro attività e Annulla: gli input condivisi tra convex/activity.ts e il catalogo. */

import { z } from "zod";
import { idDi } from "./ids.ts";

export const elencaAttivitaInput = z
  .object({ limite: z.number().int().min(1).max(100).optional().describe("Quante voci (default 30)") })
  .describe("Quante voci");

export const annullaInput = z
  .object({ activityId: idDi("activity").describe("Voce del registro da annullare") })
  .describe("Cosa annullare");
