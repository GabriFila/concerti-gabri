/* Profilo: tema, layout, extra e input di modifica (PIANO §5.1, §1.35, §1.40). */

import { z } from "zod";
import { forma, handle, nomeVisualizzato, urlHttps } from "./campi.ts";

export const FONT_TITOLI = ["fraunces", "inter", "space-grotesk", "playfair-display"] as const;

export const tema = z
  .object({
    preset: z.string().regex(/^[a-z0-9-]{1,30}$/).describe('Tema predefinito, es. "predefinito"'),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Colore d'accento esadecimale, es. #ff6a3d"),
    fontTitoli: z.enum(FONT_TITOLI).optional().describe("Font dei titoli"),
    raggi: z.string().regex(/^[a-z-]{1,20}$/).optional().describe("Arrotondamento degli angoli (token)"),
    densita: z.string().regex(/^[a-z-]{1,20}$/).optional().describe("Densità dell'impaginazione (token)"),
  })
  .describe("Stile della pagina: preset e token validati, niente CSS libero");

export const layout = z
  .object({
    ordine: z.array(z.string().regex(/^sec-[a-z0-9-]{1,40}$/).describe("Id fisso di una sezione (sec-…)")).max(40).describe("Ordine delle sezioni de \"I dati\""),
    nascoste: z.array(z.string().regex(/^sec-[a-z0-9-]{1,40}$/).describe("Id fisso di una sezione (sec-…)")).max(40).describe("Sezioni nascoste"),
    titoli: z.record(z.string().regex(/^sec-[a-z0-9-]{1,40}$/), z.string().trim().min(1).max(60).describe("Titolo personalizzato")).describe("Titoli personalizzati per id di sezione"),
  })
  .describe("Ordine, visibilità e titoli delle sezioni");

export const extra = z
  .object({
    creditoFooter: z.string().max(200).optional().describe("Riga di ringraziamento nel footer"),
    linkTappi: urlHttps.optional().describe("Link facoltativo nel footer (https)"),
  })
  .describe("Contenuti personali facoltativi del profilo");

export const TEMA_PREDEFINITO = { preset: "predefinito" } as const;
export const LAYOUT_VUOTO = { ordine: [], nascoste: [], titoli: {} } as const;

export const STATI_PROFILO = ["onboarding", "active"] as const;
export const PASSI_ONBOARDING = ["partenze", "agente", "regali", "fatto"] as const;

/** update_profile: nome visualizzato, handle (con alias), forma. */
export const aggiornaProfiloInput = z
  .object({
    displayName: nomeVisualizzato.optional(),
    handle: handle.optional(),
    forma: forma.optional(),
  })
  .describe("Campi del profilo da cambiare; quelli assenti restano invariati");

/** set_theme: preset, token e layout (niente set_layout separato). */
export const impostaTemaInput = z
  .object({
    theme: tema.optional(),
    layout: layout.optional(),
  })
  .describe("Nuovo tema e/o layout della pagina");
