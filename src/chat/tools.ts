/* ──────────────────────────────────────────────────────────────
   AI chat: tool definitions shared between the browser and the
   Netlify function. Keep this file free of React/DOM imports —
   the serverless bundle pulls it in too.

   These are TanStack AI *client tools*: no server `execute`, so
   the model's call streams to the browser, runs there (filters,
   scroll), and the result goes back to the model.
   ────────────────────────────────────────────────────────────── */

import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { ALLDATA } from "../data.ts";

// Single source of truth for the page sections (the TOC adds icons on top).
export const SECTIONS = [
  { id: "sec-kpis", label: "Riepilogo" },
  { id: "sec-andamento", label: "Andamento" },
  { id: "sec-mappa", label: "Dove sono andato" },
  { id: "sec-artisti", label: "Chi ho visto di più" },
  { id: "sec-compagni", label: "Con chi vado di più" },
  { id: "sec-venue", label: "Dove torno più spesso" },
  { id: "sec-posto", label: "Che biglietto prendo" },
  { id: "sec-vicinanza", label: "Quanto sono vicino" },
  { id: "sec-stagionalita", label: "Quando vado" },
  { id: "sec-voti", label: "Come li giudico" },
  { id: "sec-voti-migliori", label: "I migliori" },
  { id: "sec-voti-vs", label: "Voto a confronto" },
  { id: "sec-spesa", label: "Quanto spendo" },
  { id: "sec-spesa-dettaglio", label: "Quando ho speso di più" },
  { id: "sec-spesa-distribuzione", label: "Quanto pago di solito" },
  { id: "sec-archivio", label: "Archivio" },
] as const;

const SECTION_IDS = SECTIONS.map(s => s.id) as [string, ...string[]];

// Vocabularies derived from the data, so the model can only pick real values.
const CITIES = [...new Set(ALLDATA.map(d => d.city))].sort() as [string, ...string[]];
const COMPANIONS = [...new Set(ALLDATA.flatMap(d => d.with || []))].sort() as [string, ...string[]];
const POSTI = ["Pit/Gold", "Prato/Parterre", "Platea", "Gradinata"] as const;

export const setFiltersDef = toolDefinition({
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
    cities: z.array(z.enum(CITIES)).optional().meta({ description: "Concert cities (OR between them). Empty array = all cities." }),
    people: z.array(z.enum(COMPANIONS)).optional().meta({ description: "Companions Gabri went with (OR between them). Empty array = anyone." }),
    solo: z.boolean().optional().meta({ description: "true = only concerts attended alone" }),
    posti: z.array(z.enum(POSTI)).optional().meta({ description: "Ticket/spot type. Empty array = all." }),
    vicinanze: z.array(z.enum(["1", "2", "3", "4", "5", "6"])).optional().meta({ description: "Closeness to the stage: 1 Transenna, 2 Sottopalco, 3 Centro, 4 Fondo, 5 Tribuna, 6 Anello alto. Empty array = all." }),
    price: z.enum(["all", "paid", "gift", "unknown"]).optional().meta({ description: "paid = has a known price, gift = received as a present, unknown = no price recorded" }),
    costMin: z.number().optional().meta({ description: "Minimum ticket cost in euros (only constrains concerts with a known price)" }),
    costMax: z.number().optional().meta({ description: "Maximum ticket cost in euros" }),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    matchCount: z.number().meta({ description: "Concerts matching the new filters" }),
    summary: z.string().meta({ description: "Human-readable recap of the now-active filters" }),
  }),
});

export const clearFiltersDef = toolDefinition({
  name: "clear_filters",
  description: "Remove every active filter so the dashboard shows all concerts again.",
  inputSchema: z.object({}),
  outputSchema: z.object({ ok: z.boolean(), matchCount: z.number() }),
});

export const goToSectionDef = toolDefinition({
  name: "go_to_section",
  description:
    "Scroll the page (behind the chat) to one of its sections. " +
    "After calling it, remind the user to close the chat to see the section.",
  inputSchema: z.object({
    section: z.enum(SECTION_IDS).meta({ description: "Section id; the label next to each id in the system prompt says what it shows" }),
  }),
  outputSchema: z.object({ ok: z.boolean(), label: z.string() }),
});

export const chatToolDefs = [setFiltersDef, clearFiltersDef, goToSectionDef];
