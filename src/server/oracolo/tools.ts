/* ──────────────────────────────────────────────────────────────
   Gli strumenti SERVER dell'Oracolo: query_concerts (i dati della pagina),
   report_unsupported_query (domande che non sappiamo calcolare) e
   web_search (domande di musica generali, con una chiamata Gemini annidata
   che usa solo Google Search: l'API rifiuta google_search mescolato a
   function declarations nella stessa richiesta, quindi non si combinano mai).
   ────────────────────────────────────────────────────────────── */

import { GoogleGenAI } from "@google/genai";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { Dataset } from "../../../shared/lib/dataset.ts";
import type { ChatVocab } from "../../chat/tools.ts";
import { queryInputSchema, runConcertQuery } from "./query.ts";

export function queryConcertsDef(vocab: ChatVocab) {
  return toolDefinition({
    name: "query_concerts",
    description:
      "The ONLY source of the concert data. A CONCERT is one act's set; a festival is one EVENT/ticket containing several concerts, " +
      "so counts are per concert while costs are per ticket/event. Only this page's data, never addresses. Returns, for the concerts matching the filters (combined with AND): " +
      "exact count, attended/planned split, distinct event/ticket count, total and average ticket cost, average rating, average canzoni note, optional breakdown by " +
      "person/artist/year/city/venue/vicinanza/canzoniNote, and the full matching list in chronological order. " +
      "Call it (possibly more than once) before answering ANY question about the data.",
    inputSchema: queryInputSchema(vocab),
    outputSchema: z.object({
      count: z.number().meta({ description: "Concerts (sets) matching all filters — a festival contributes one per set watched" }),
      attendedCount: z.number(),
      plannedCount: z.number(),
      eventCount: z.number().meta({ description: "Distinct events/tickets behind the matching concerts (a festival counts once)" }),
      totalCost: z.number().meta({ description: "Sum of the known ticket costs over the matching events, euros (a festival ticket counts once)" }),
      costKnownCount: z.number().meta({ description: "How many of those events/tickets have a known cost (a ticket paid for but whose price the page owner no longer recalls counts as unknown here, and shows as 'prezzo non ricordato' in the list)" }),
      avgCost: z.number().nullable().meta({ description: "Average cost per ticket/event, not per concert" }),
      avgVoto: z.number().nullable().meta({ description: "Average rating over the matching concerts that have one" }),
      avgCanzoniNote: z.number().nullable().meta({ description: "Average canzoni-note level (1..5) over the matching concerts that have one" }),
      groups: z.array(z.object({
        key: z.string(),
        count: z.number(),
        totalCost: z.number(),
        avgCost: z.number().nullable(),
        avgVoto: z.number().nullable(),
        avgCanzoniNote: z.number().nullable(),
      })).optional().meta({ description: "Already sorted by sortGroupsBy (desc): a ready-made ranking. count = concerts; costs = distinct tickets in the group" }),
      concerts: z.array(z.string()).meta({ description: "Chronological; each line is 'date · artist[ (festival name)] · venue (city) · con companions|da solo[ · N€][ · regalo[ di CHI]][ · accredito][ · voto N][ · canzoni note LABEL][ · in programma][ · commento: \"…\"]'. Festival sets show the festival in parentheses and no per-set cost: the ticket belongs to the whole event. The commento is the page owner's own free-text remark on the EVENING (a festival's comment covers the whole festival, so its sets repeat it): quote it, never paraphrase it into new facts." }),
      concertsTruncated: z.boolean(),
    }),
  });
}

/* Called by the model when a data question cannot be computed with
   query_concerts. The server-side execute logs it, so the function logs
   double as a wishlist of missing chat capabilities. */
export const reportUnsupportedDef = toolDefinition({
  name: "report_unsupported_query",
  description:
    "Report a data question that query_concerts cannot compute (missing filter, aggregation or capability). " +
    "Call this INSTEAD of guessing, then tell the user that the chat cannot compute it yet.",
  inputSchema: z.object({
    question: z.string().meta({ description: "The user's question, as asked" }),
    missing: z.string().meta({ description: "Short description of the missing capability, e.g. 'median cost', 'filter by weekday'" }),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
});

/* Web search for general music questions ("chi fa parte degli Imagine
   Dragons?"). Grounding runs as a NESTED Gemini call — google_search only —
   wrapped in a normal function tool for the main loop. Same API key;
   grounded search queries are billed by Google on top of the token price. */
export const webSearchDef = toolDefinition({
  name: "web_search",
  description:
    "Search the web (Google) and get a short, up-to-date answer with sources. " +
    "ONLY for general music and live-music questions (artists, bands, songs, albums, tours, venues, festivals). " +
    "Never for questions about the page owner's data (use query_concerts) and never for off-topic requests.",
  inputSchema: z.object({
    query: z.string().meta({ description: "The web search question, in the user's language, e.g. 'chi fa parte degli Imagine Dragons?'" }),
  }),
  outputSchema: z.object({
    answer: z.string(),
    sources: z.array(z.string()).meta({ description: "Names of the main web sources the answer is based on" }),
    grounded: z.boolean().meta({ description: "true = answer comes from a live Google Search; false = model knowledge only, may be outdated — say so briefly" }),
    error: z.string().optional().meta({ description: "Why live search was unavailable, for diagnostics" }),
  }),
});

// Keys must never reach the transcript or the logs; the rest of an API error
// is generic JSON (status/code/message) and safe to expose for debugging.
export const sanitizeErr = (err: unknown) =>
  String((err as Error)?.message ?? err).replace(/AIza[0-9A-Za-z_-]{30,}/g, "***").slice(0, 300);

export interface ServerToolsOptions {
  dataset: Dataset;
  today: number;
  model: string;
  apiKey: string;
  /** true nell'Oracolo in scrittura (PIANO §1.27): niente web_search (i risultati di Google
      potrebbero iniettare chiamate di scrittura) e niente testo del proprietario nei log
      (potrebbe contenere il suo indirizzo). */
  scrittura?: boolean;
}

/**
 * L'input di query_concerts per i log. In scrittura solo i NOMI dei filtri
 * usati, mai i valori: artista, città e persone sono testo libero del
 * modello, che può ripetere quello che il proprietario ha scritto (anche un
 * indirizzo). Nell'Oracolo pubblico resta l'input intero, utile per capire
 * le domande dei visitatori (le conversazioni pubbliche sono già pubbliche).
 */
export function inputPerLog(input: Record<string, unknown>, scrittura: boolean): string {
  if (!scrittura) return JSON.stringify(input);
  const usati = Object.keys(input).filter(k => input[k] !== undefined && input[k] !== null).sort();
  return JSON.stringify({ campi: usati });
}

/** Gli strumenti server con la loro esecuzione, legati ai dati della pagina. */
export function serverTools({ dataset, today, model, apiKey, scrittura = false }: ServerToolsOptions) {
  // query_concerts runs here on the server: exact numbers computed by code.
  // The concert data is NOT in the prompt, so this tool is the model's only
  // way to answer data questions.
  const queryConcertsTool = queryConcertsDef(dataset.vocab).server(input => {
    const result = runConcertQuery(dataset, input, today);
    console.log("query_concerts", inputPerLog(input, scrittura), "->", `count=${result.count} attended=${result.attendedCount} planned=${result.plannedCount}`);
    return result;
  });

  // grep "unsupported_query" in the function logs to see what the chat is missing
  const reportUnsupportedTool = reportUnsupportedDef.server(input => {
    // in scrittura solo metadati fissi: la richiesta del proprietario, anche parafrasata, non va nei log
    console.warn("unsupported_query", JSON.stringify(scrittura ? { missingChars: String(input.missing ?? "").length } : input));
    return { ok: true };
  });

  const webSearchTool = webSearchDef.server(async ({ query }) => {
    const genai = new GoogleGenAI({ apiKey });
    const ask = (grounded: boolean) =>
      genai.models.generateContent({
        model,
        contents: query,
        config: {
          ...(grounded && { tools: [{ googleSearch: {} }] }),
          maxOutputTokens: 1000,
          temperature: 0.2,
          systemInstruction: `Answer concisely (a few sentences, plain text)${grounded ? " using Google Search" : ""}. Reply in the language of the question.`,
        },
      });
    try {
      const res = await ask(true);
      const answer = (res.text ?? "").trim();
      const sources = [...new Set(
        (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
          .map(c => c.web?.title)
          .filter((t): t is string => !!t),
      )].slice(0, 3);
      console.log("web_search", JSON.stringify(query), "->", answer ? `${answer.length} chars, ${sources.length} sources` : "empty");
      return { answer: answer || "La ricerca non ha trovato una risposta.", sources, grounded: true };
    } catch (err) {
      // Grounding can be unavailable (e.g. key tier without Google Search
      // quota): degrade to the model's own knowledge instead of failing.
      const error = sanitizeErr(err);
      console.error("web_search grounding failed:", error);
      try {
        const res = await ask(false);
        const answer = (res.text ?? "").trim();
        return { answer: answer || "Non ho trovato una risposta.", sources: [], grounded: false, error };
      } catch (err2) {
        console.error("web_search fallback failed:", sanitizeErr(err2));
        return { answer: "La ricerca sul web non è disponibile in questo momento.", sources: [], grounded: false, error };
      }
    }
  });

  return scrittura ? [queryConcertsTool, reportUnsupportedTool] : [queryConcertsTool, reportUnsupportedTool, webSearchTool];
}
