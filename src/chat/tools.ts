/* ──────────────────────────────────────────────────────────────
   L'Oracolo: definizioni degli strumenti CLIENT, condivise tra il browser e
   la route /api/chat (src/server/oracolo/). Niente React né DOM qui.

   Sono "client tools" di TanStack AI: nessun `execute` sul server, quindi la
   chiamata del modello arriva al browser, gira lì (filtri, scroll, tema) e il
   risultato torna al modello.

   Gli enum (città, compagni) vengono dal vocabolario del profilo
   (dataset.vocab): ai-client valida l'input degli strumenti client con il
   PROPRIO schema e il server manda al modello lo schema del suo lato, quindi
   le due parti devono costruirli dallo stesso vocabolario, con questa stessa
   funzione.
   ────────────────────────────────────────────────────────────── */

import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { canzoniNoteScale, vicinanzaScale } from "../../shared/model/scale.ts";
import { SECTION_IDS } from "../../shared/sections.ts";

export interface ChatVocab {
  cities: string[];
  companions: string[];
}

/** z.enum dei valori, o una stringa libera se il profilo non ne ha ancora. */
export const enumOrString = (values: string[]) =>
  values.length ? z.enum(values as [string, ...string[]]) : z.string();

export const THEMES = ["dark", "light", "system"] as const;

export function chatToolDefs(vocab: ChatVocab) {
  const setFiltersDef = toolDefinition({
    name: "set_filters",
    description:
      "Change the dashboard's active filters. Every chart on the page updates to show only matching concerts. " +
      "Omitted fields keep their current value; pass `replace: true` to reset everything else first. " +
      "Returns how many concerts match afterwards.",
    inputSchema: z.object({
      replace: z.boolean().optional().meta({ description: "true = clear all current filters before applying these; false/omitted = merge into the current ones" }),
      status: z.enum(["all", "attended", "planned"]).optional().meta({ description: "attended = already seen, planned = upcoming" }),
      dateFrom: z.string().optional().meta({ description: "Only concerts on/after this date, ISO YYYY-MM-DD. Empty string clears it." }),
      dateTo: z.string().optional().meta({ description: "Only concerts on/before this date, ISO YYYY-MM-DD. Empty string clears it." }),
      cities: z.array(enumOrString(vocab.cities)).optional().meta({ description: "Concert cities (OR between them). Empty array = all cities." }),
      people: z.array(enumOrString(vocab.companions)).optional().meta({ description: "Companions Gabri went with (OR between them). Empty array = anyone." }),
      solo: z.boolean().optional().meta({ description: "true = only concerts attended alone" }),
      vicinanze: z.array(z.enum(["1", "2", "3", "4", "5", "6"])).optional().meta({ description: `Closeness to the stage, higher = closer: ${vicinanzaScale()}. Empty array = all.` }),
      canzoniNote: z.array(z.enum(["1", "2", "3", "4", "5"])).optional().meta({ description: `"Canzoni note" — how much of the setlist Gabri already knew: ${canzoniNoteScale()}. Empty array = all.` }),
      price: z.enum(["all", "paid", "gift", "accredito", "unknown"]).optional().meta({ description: "paid = has a known price, gift = received as a present, accredito = free entry via guest list/press pass, unknown = no price recorded" }),
      costMin: z.number().optional().meta({ description: "Minimum ticket cost in euros (only constrains concerts with a known price)" }),
      costMax: z.number().optional().meta({ description: "Maximum ticket cost in euros" }),
      kmMin: z.number().optional().meta({ description: "Minimum one-way trip distance in km (only constrains concerts with a known trip distance)" }),
      kmMax: z.number().optional().meta({ description: "Maximum one-way trip distance in km" }),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      matchCount: z.number().meta({ description: "Concerts matching the new filters" }),
      summary: z.string().meta({ description: "Human-readable recap of the now-active filters" }),
    }),
  });

  const clearFiltersDef = toolDefinition({
    name: "clear_filters",
    description: "Remove every active filter so the dashboard shows all concerts again.",
    inputSchema: z.object({}),
    outputSchema: z.object({ ok: z.boolean(), matchCount: z.number() }),
  });

  const goToSectionDef = toolDefinition({
    name: "go_to_section",
    description:
      "Scroll the page (behind the chat) to one of its sections. " +
      "After calling it, remind the user to close the chat to see the section.",
    inputSchema: z.object({
      section: z.enum(SECTION_IDS).meta({ description: "Section id; the label next to each id in the system prompt says what it shows" }),
    }),
    // ok:false = that section is not on the page right now (sec-commenti only shows
    // when at least one evening has a comment): say so, don't claim you scrolled.
    outputSchema: z.object({ ok: z.boolean(), label: z.string() }),
  });

  // Il tema del VISITATORE (cookie `tema`). Il nome `set_theme` resta libero per
  // lo strumento del catalogo che cambierà lo stile della pagina del proprietario.
  const setVisitorThemeDef = toolDefinition({
    name: "set_visitor_theme",
    description:
      "Switch the color theme the visitor sees (saved in their browser). The change is visible immediately, even behind the open chat.",
    inputSchema: z.object({
      theme: z.enum(THEMES).meta({ description: "dark = tema scuro, light = tema chiaro, system = follow the visitor's OS preference" }),
    }),
    outputSchema: z.object({ ok: z.boolean(), theme: z.enum(THEMES) }),
  });

  return { setFiltersDef, clearFiltersDef, goToSectionDef, setVisitorThemeDef };
}

export type ChatToolDefs = ReturnType<typeof chatToolDefs>;

/** L'elenco da passare a `chat({ tools })` sul server. */
export const chatToolList = (d: ChatToolDefs) => [d.setFiltersDef, d.clearFiltersDef, d.goToSectionDef, d.setVisitorThemeDef];
