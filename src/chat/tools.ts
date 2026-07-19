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
import { ALLDATA, type Concert } from "../data.ts";

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
  { id: "sec-giorni", label: "Che giorno esco" },
  { id: "sec-voti", label: "Come li giudico" },
  { id: "sec-voti-migliori", label: "I migliori" },
  { id: "sec-voti-vs", label: "Voto a confronto" },
  { id: "sec-canzoni", label: "Quante canzoni conosco" },
  { id: "sec-spesa", label: "Quanto spendo" },
  { id: "sec-spesa-dettaglio", label: "Quando ho speso di più" },
  { id: "sec-spesa-distribuzione", label: "Quanto pago di solito" },
  { id: "sec-archivio", label: "Archivio" },
] as const;

const SECTION_IDS = SECTIONS.map(s => s.id) as [string, ...string[]];

// Vocabularies derived from the data, so the model can only pick real values.
const CITIES = [...new Set(ALLDATA.map(d => d.city))].sort() as [string, ...string[]];
export const COMPANIONS = [...new Set(ALLDATA.flatMap(d => d.with || []))].sort() as [string, ...string[]];
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
    price: z.enum(["all", "paid", "gift", "accredito", "unknown"]).optional().meta({ description: "paid = has a known price, gift = received as a present, accredito = free entry via guest list/press pass, unknown = no price recorded" }),
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

export const setThemeDef = toolDefinition({
  name: "set_theme",
  description:
    "Switch the page's color theme. The change is visible immediately, even behind the open chat.",
  inputSchema: z.object({
    theme: z.enum(["dark", "light", "system"]).meta({ description: "dark = tema scuro, light = tema chiaro, system = follow the visitor's OS preference" }),
  }),
  outputSchema: z.object({ ok: z.boolean(), theme: z.enum(["dark", "light", "system"]) }),
});

/* ── query_concerts ────────────────────────────────────────────
   Server tool (execute attached in netlify/functions/chat.mts):
   deterministic counts/sums over ALLDATA, so the model quotes
   computed numbers instead of eyeballing the JSON in its prompt. */

// Same date semantics as App.tsx: first day of a multi-day range,
// and a concert happening today still counts as "planned".
const sortKey = (d: Concert) => {
  const m = d.date.match(/(\d{1,2})(?:–\d{1,2})?\/(\d{2})\/(\d{4})/);
  return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 0;
};
const todayKey = () => { const t = new Date(); return t.getFullYear() * 10000 + (t.getMonth() + 1) * 100 + t.getDate(); };
const isPlanned = (d: Concert) => sortKey(d) >= todayKey();

const MAX_LISTED_CONCERTS = 200; // > dataset size today; the cap only guards future growth

const queryInputSchema = z.object({
  status: z.enum(["all", "attended", "planned"]).optional().meta({ description: "attended = date before today, planned = today or later. Omitted = all. Past-tense questions ('è andato', 'ha visto') want attended." }),
  people: z.array(z.enum(COMPANIONS)).optional().meta({ description: "Exact companion names; matches concerts with at least one of them (OR). One person = that person's concerts." }),
  solo: z.boolean().optional().meta({ description: "true = only concerts attended alone (no companions)" }),
  artist: z.string().optional().meta({ description: "Case-insensitive substring match on the artist name" }),
  cities: z.array(z.enum(CITIES)).optional().meta({ description: "Concert cities (OR between them)" }),
  years: z.array(z.number()).optional().meta({ description: "Concert years, e.g. [2025]" }),
  gift: z.boolean().optional().meta({ description: "true = only concerts received as a present, false = only paid/own tickets" }),
  accredito: z.boolean().optional().meta({ description: "true = only concerts with free entry via guest list/press pass (accredito), false = exclude them" }),
  groupBy: z.enum(["person", "artist", "year", "city", "venue", "posto", "vicinanza"]).optional().meta({ description: "Also return per-group stats (count, avg voto, costs) over the matching concerts (person = one entry per companion)" }),
  sortGroupsBy: z.enum(["count", "avgVoto", "avgCost", "totalCost"]).optional().meta({ description: "Descending sort of `groups` (default count). For rankings, pick the right key and report the groups exactly in the returned order." }),
});

export type ConcertQuery = z.infer<typeof queryInputSchema>;

export const queryConcertsDef = toolDefinition({
  name: "query_concerts",
  description:
    "The ONLY source of the concert data. Returns, for the concerts matching the filters (combined with AND): " +
    "exact count, attended/planned split, total and average cost, average rating, optional breakdown by " +
    "person/artist/year/city/venue/posto/vicinanza, and the full matching list in chronological order. " +
    "Call it (possibly more than once) before answering ANY question about the data.",
  inputSchema: queryInputSchema,
  outputSchema: z.object({
    count: z.number().meta({ description: "Concerts matching all filters" }),
    attendedCount: z.number(),
    plannedCount: z.number(),
    totalCost: z.number().meta({ description: "Sum of the known costs, euros" }),
    costKnownCount: z.number().meta({ description: "How many matching concerts have a known cost" }),
    avgCost: z.number().nullable(),
    avgVoto: z.number().nullable(),
    groups: z.array(z.object({
      key: z.string(),
      count: z.number(),
      totalCost: z.number(),
      avgCost: z.number().nullable(),
      avgVoto: z.number().nullable(),
    })).optional().meta({ description: "Already sorted by sortGroupsBy (desc): a ready-made ranking" }),
    concerts: z.array(z.string()).meta({ description: "Chronological; each line is 'date · artist · venue (city) · con companions|da solo[ · N€][ · regalo][ · accredito][ · voto N][ · in programma]'" }),
    concertsTruncated: z.boolean(),
  }),
});

/* Called by the model when a data question cannot be computed with
   query_concerts. Server-side execute (in chat.mts) logs it, so the
   function logs double as a wishlist of missing chat capabilities. */
export const reportUnsupportedDef = toolDefinition({
  name: "report_unsupported_query",
  description:
    "Report a data question that query_concerts cannot compute (missing filter, aggregation or capability). " +
    "Call this INSTEAD of guessing, then tell the user you cannot compute it and that they can ask Gabri to extend the chat.",
  inputSchema: z.object({
    question: z.string().meta({ description: "The user's question, as asked" }),
    missing: z.string().meta({ description: "Short description of the missing capability, e.g. 'median cost', 'filter by weekday'" }),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
});

const round2 = (n: number) => Math.round(n * 100) / 100;

export function runConcertQuery(q: ConcertQuery) {
  const artist = q.artist?.trim().toLowerCase();
  const matches = ALLDATA.filter(d => {
    if (q.status === "attended" && isPlanned(d)) return false;
    if (q.status === "planned" && !isPlanned(d)) return false;
    if (q.people?.length && !q.people.some(p => (d.with || []).includes(p as Concert["with"][number]))) return false;
    if (q.solo && (d.with || []).length > 0) return false;
    if (artist && !d.artist.toLowerCase().includes(artist)) return false;
    if (q.cities?.length && !q.cities.includes(d.city)) return false;
    if (q.years?.length && !q.years.includes(d.y)) return false;
    if (q.gift !== undefined && !!d.gift !== q.gift) return false;
    if (q.accredito !== undefined && !!d.accredito !== q.accredito) return false;
    return true;
  });

  const costVotoStats = (list: Concert[]) => {
    const withCost = list.filter(d => typeof d.cost === "number");
    const withVoto = list.filter(d => typeof d.voto === "number");
    const totalCost = withCost.reduce((s, d) => s + (d.cost as number), 0);
    return {
      totalCost: round2(totalCost),
      costKnownCount: withCost.length,
      avgCost: withCost.length ? round2(totalCost / withCost.length) : null,
      avgVoto: withVoto.length ? round2(withVoto.reduce((s, d) => s + (d.voto as number), 0) / withVoto.length) : null,
    };
  };

  type Group = { key: string; count: number; totalCost: number; avgCost: number | null; avgVoto: number | null };
  let groups: Group[] | undefined;
  if (q.groupBy) {
    const keysOf = (d: Concert): string[] =>
      q.groupBy === "person" ? (d.with || [])
      : q.groupBy === "artist" ? [d.artist]
      : q.groupBy === "year" ? [String(d.y)]
      : q.groupBy === "city" ? [d.city]
      : q.groupBy === "venue" ? [d.venue]
      : q.groupBy === "posto" ? [d.posto]
      : [String(d.vicinanza ?? "non impostata")];
    const byKey = new Map<string, Concert[]>();
    for (const d of matches) for (const k of keysOf(d)) byKey.set(k, [...(byKey.get(k) || []), d]);
    const sortBy = q.sortGroupsBy || "count";
    groups = [...byKey.entries()]
      .map(([key, list]) => {
        const { costKnownCount: _ignored, ...stats } = costVotoStats(list);
        return { key, count: list.length, ...stats };
      })
      .sort((a, b) =>
        ((b[sortBy] ?? -Infinity) - (a[sortBy] ?? -Infinity)) || (b.count - a.count) || a.key.localeCompare(b.key));
  }

  return {
    count: matches.length,
    attendedCount: matches.filter(d => !isPlanned(d)).length,
    plannedCount: matches.filter(isPlanned).length,
    ...costVotoStats(matches),
    ...(groups ? { groups } : {}),
    concerts: matches.slice(0, MAX_LISTED_CONCERTS).map(d =>
      `${d.date} · ${d.artist} · ${d.venue} (${d.city})` +
      ` · ${d.with?.length ? `con ${d.with.join(", ")}` : "da solo"}` +
      (typeof d.cost === "number" ? ` · ${d.cost}€` : "") +
      (d.gift ? " · regalo" : "") +
      (d.accredito ? " · accredito" : "") +
      (typeof d.voto === "number" ? ` · voto ${d.voto}` : "") +
      (isPlanned(d) ? " · in programma" : "")),
    concertsTruncated: matches.length > MAX_LISTED_CONCERTS,
  };
}

export const chatToolDefs = [setFiltersDef, clearFiltersDef, goToSectionDef, setThemeDef];
