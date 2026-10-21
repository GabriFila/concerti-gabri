/* ──────────────────────────────────────────────────────────────
   L'Oracolo, POST /api/chat (ex netlify/functions/chat.mts).

   Flusso: Origin per ambiente, chiave Gemini, limiti d'uso, validazione
   della richiesta, poi la risposta di Gemini in streaming SSE via TanStack
   AI. Gli strumenti di filtro/navigazione/tema non hanno `execute` qui:
   girano nel browser (client tools). query_concerts, report_unsupported_query
   e web_search girano qui.

   I dati arrivano da Convex a ogni richiesta (pagina.ts, PIANO §1.14):
   vocabolari, strumenti e query_concerts si costruiscono dalla stessa
   proiezione pubblica che legge la pagina.

   Fino al traguardo 6 non c'è storico (niente Redis): nessuna trascrizione
   salvata, nessun controllo della chiave di scrittura, limiti in memoria.
   ────────────────────────────────────────────────────────────── */

import { chat, toServerSentEventsResponse, type AgentLoopStrategy, type ModelMessage } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import type { Dataset } from "../../../shared/lib/dataset.ts";
import { todayKey } from "../../../shared/lib/dates.ts";
import { chatToolDefs, chatToolList } from "../../chat/tools.ts";
import { serverNow } from "../now.ts";
import { originOk } from "./origins.ts";
import { datasetDaConvex } from "./pagina.ts";
import { systemPrompt } from "./prompt.ts";
import { MemoryRateLimiter, rateLimitMessage, rateLimitsFromEnv } from "./ratelimit.ts";
import { serverTools } from "./tools.ts";
import { validate } from "./validate.ts";

/* Agent loop: capped rounds, but also stop as soon as the model has
   written answer text after seeing at least one tool result. Flash-lite
   sometimes tacks a redundant tool call onto its final answer; without
   this check the loop runs another round and the user gets the same
   answer twice (and we pay an extra Gemini request). Text emitted
   BEFORE the first tool result (a preamble next to the first tool
   call) doesn't count as an answer. */
const hasAnswerText = (m: ModelMessage) =>
  m.role === "assistant" &&
  (typeof m.content === "string"
    ? m.content.trim().length > 0
    : Array.isArray(m.content) && m.content.some(p => p.type === "text" && p.content.trim().length > 0));

export const untilAnswered: AgentLoopStrategy = ({ iterationCount, messages }) => {
  if (iterationCount >= 5) return false;
  // Only the current turn counts: previous turns already contain
  // tool results followed by answers, which would stop the loop at once.
  const turn = messages.slice(messages.map(m => m.role).lastIndexOf("user") + 1);
  const firstToolResult = turn.findIndex(m => m.role === "tool");
  if (firstToolResult === -1) return true;
  return !turn.some((m, i) => i > firstToolResult && hasAnswerText(m));
};

export const DEFAULT_MODEL = "gemini-3.1-flash-lite";

// per istanza: solo i limiti in memoria (un dosso, non un muro). I dati no:
// arrivano da Convex a ogni richiesta, con un client nuovo (PIANO §1.7)
let limiter: MemoryRateLimiter | null = null;

const json = (status: number, payload: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", ...headers } });

// le route registrano ANY: qualunque altro metodo arriva qui e prende 405
const methodNotAllowed = (allow: string) => json(405, { error: "Method not allowed" }, { Allow: allow });

export async function handleChat(req: Request, { ip }: { ip: string }): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed("POST");
  const env = process.env;

  if (!originOk(req.headers.get("origin"), env)) return json(403, { error: "Forbidden" });

  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  if (!apiKey) return json(500, { error: "GEMINI_API_KEY non configurata." });

  limiter ??= new MemoryRateLimiter(rateLimitsFromEnv(env));
  const rate = limiter.check(ip);
  if (!rate.allowed) return json(429, { error: rateLimitMessage(rate.reason) });

  const parsed = validate(await req.text());
  if ("error" in parsed) return json(400, { error: parsed.error });

  let dataset: Dataset | null;
  try {
    dataset = await datasetDaConvex();
  } catch {
    // niente dettagli dell'errore Convex nei log né in risposta (PIANO §1.25)
    console.error("chat: lettura della pagina da Convex non riuscita");
    return json(503, { error: "Dati non disponibili, riprova più tardi." });
  }
  if (!dataset) return json(503, { error: "Dati non disponibili, riprova più tardi." });
  const today = todayKey(serverNow(env));
  // geminiText types `model` as a union of known ids; the env override is a plain string
  const model = (env.GEMINI_MODEL || DEFAULT_MODEL) as Parameters<typeof geminiText>[0];

  try {
    const stream = chat({
      adapter: geminiText(model),
      messages: parsed.messages as any,
      threadId: parsed.threadId,
      systemPrompts: [systemPrompt(dataset, today)],
      // the tool list is fixed here on the server: client-declared tools are never merged in
      tools: [...chatToolList(chatToolDefs(dataset.vocab)), ...serverTools({ dataset, today, model, apiKey })],
      agentLoopStrategy: untilAnswered,
      modelOptions: { maxOutputTokens: 1500, temperature: 0.4 },
    });
    return toServerSentEventsResponse(stream);
  } catch (err) {
    console.error("chat error", err);
    return json(500, { error: "Errore del servizio AI, riprova più tardi." });
  }
}

/** GET /api/chat/history: lo storico torna col traguardo 6 (Convex). Fino ad
    allora risponde come prima su Netlify senza Redis: 503. */
export function handleChatHistory(req: Request): Response {
  if (req.method !== "GET") return methodNotAllowed("GET");
  if (!originOk(req.headers.get("origin"), process.env)) return json(403, { error: "Forbidden" });
  return json(503, { error: "Cronologia non disponibile." });
}
