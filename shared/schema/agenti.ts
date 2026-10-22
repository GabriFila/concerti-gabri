/* Agenti (PIANO traguardo 7, #agenti): gli input delle funzioni
   dashboardOnly di convex/agents.ts (un token non crea né revoca token). */

import { z } from "zod";

export const creaChiaveInput = z
  .object({
    nome: z.string().trim().min(1).max(32).describe("Nome della chiave, per riconoscerla (es. \"Script di casa\")"),
    scadenzaGiorni: z.number().int().min(1).max(365).optional().describe("Dopo quanti giorni scade; assente = mai"),
  })
  .describe("Nuova API key");

export const revocaChiaveInput = z.object({ id: z.string().min(1).max(128).describe("Id della API key") }).describe("API key da revocare");

export const revocaClientInput = z
  .object({ clientId: z.string().min(1).max(128).describe("client_id del client OAuth (Claude, ChatGPT…)") })
  .describe("Client OAuth da scollegare");

/** Il consent_code che Better Auth mette nell'URL di /autorizza (32 lettere e cifre). */
export const consensoInput = z
  .object({ consentCode: z.string().regex(/^[A-Za-z0-9]{32}$/).describe("consent_code dell'URL di /autorizza") })
  .describe("Richiesta di collegamento di un agente (OAuth)");
