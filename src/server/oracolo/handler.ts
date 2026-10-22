/* ──────────────────────────────────────────────────────────────
   L'Oracolo di una pagina, POST /api/chat (PIANO traguardo 6).

   Flusso: Origin per ambiente, chiave Gemini, validazione della richiesta
   (con `forwardedProps.handle`), la pagina da Convex (pages.byHandle con
   un client per richiesta), poi il turno su Convex (/oracolo/turno: limiti,
   pagina del thread, chiave di scrittura) e solo allora Gemini in streaming
   SSE via TanStack AI. Alla fine la conversazione si salva su Convex
   (/oracolo/trascrizione) con `ctx.defer`: in 0.71 `ctx.messages` di
   onFinish contiene già la risposta finale, quindi non si aggiunge niente a
   mano (si duplicherebbe).

   La conversazione che vede il modello è quella SALVATA su Convex (la
   restituisce /oracolo/turno, dopo il controllo della chiave) più la sola
   domanda nuova del browser: risposte dell'Oracolo, chiamate e risultati
   degli strumenti li scrive solo il server. Così un visitatore non fa
   eseguire strumenti con una chiamata inventata (web_search su qualunque
   cosa) né pubblica testo a nome dell'Oracolo nello storico della pagina.

   Gli strumenti di filtro/navigazione/tema non hanno `execute` qui: girano
   nel browser (client tools). In 0.71 il run si interrompe su quello
   strumento e il widget lo riprende con una nuova richiesta (`parentRunId`
   e `resume`): per questo il run porta l'id del widget (runDelWidget).
   query_concerts, report_unsupported_query e web_search girano qui.
   L'elenco degli strumenti è fisso sul server: quelli dichiarati dal
   browser non entrano mai.

   ORACOLO_FAKE=1 (solo con E2E=1, fuori da Vercel) usa il copione di
   finto.ts al posto di Gemini.
   ────────────────────────────────────────────────────────────── */

import { chat, toServerSentEventsResponse, type AgentLoopStrategy, type AnyTextAdapter, type ChatMiddleware, type ModelMessage } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { todayKey } from "../../../shared/lib/dates.ts";
import { chatToolDefs, chatToolList } from "../../chat/tools.ts";
import { serverNow } from "../now.ts";
import { adapterFinto, oracoloFinto } from "./finto.ts";
import { originOk } from "./origins.ts";
import { paginaDaConvex, type PaginaOracolo } from "./pagina.ts";
import { systemPrompt } from "./prompt.ts";
import { hashChiave, ipHmac, MIN_SEGRETO, storicoConvex, type ChiaveTurno, type EsitoStorico, type Storico } from "./storico.ts";
import { serverTools } from "./tools.ts";
import { MAX_CARATTERI_STORICO, MAX_MESSAGGI_STORICO, TROPPO_LUNGA, validate, type ValidChatRequest } from "./validate.ts";

export type Env = Record<string, string | undefined>;

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

export const NON_DISPONIBILE = "L'Oracolo non è disponibile, riprova più tardi.";

export const json = (status: number, payload: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", ...headers } });

// le route registrano ANY: qualunque altro metodo arriva qui e prende 405
export const methodNotAllowed = (allow: string) => json(405, { error: "Method not allowed" }, { Allow: allow });

/** Le parti esterne della route, sostituibili nei test. */
export interface DipendenzeChat {
  /** La pagina da Convex (default: pages.byHandle con un client per richiesta). */
  pagina?: (handle: string) => Promise<PaginaOracolo | null>;
  /** Turno e trascrizione su Convex (default: le httpAction col segreto). */
  storico?: Storico;
  /** Il modello (default: Gemini, o il copione con ORACOLO_FAKE). */
  adapter?: AnyTextAdapter;
}

/** Il segreto verso Convex, o null se manca (o è troppo corto per valere qualcosa). */
export function segretoServer(env: Env): string | null {
  const s = env.CHAT_SERVER_SECRET ?? "";
  if (s.length >= MIN_SEGRETO) return s;
  console.error("chat: CHAT_SERVER_SECRET mancante");
  return null;
}

/** Il rifiuto di Convex per il browser: i messaggi di limiti e chiavi passano così come sono. */
export function rispostaTurno(t: EsitoStorico): Response {
  if (t.status === 429) return json(429, { error: t.messaggio || "Limite giornaliero della chat raggiunto: riprova domani." });
  if (t.status === 403) return json(403, { error: t.messaggio || "Questa chat appartiene a un altro visitatore: puoi solo leggerla." });
  if (t.status === 404) return json(404, { error: "Pagina non trovata." });
  // 401 = segreto diverso tra Vercel e Convex; il resto è un guasto
  console.error("chat: turno non accettato da Convex", t.status, t.code ?? "");
  return json(503, { error: NON_DISPONIBILE });
}

/** Salva la conversazione a fine giro, senza bloccare lo stream (awaited prima della chiusura). */
export function salvaTrascrizione(storico: Storico, chiave: ChiaveTurno, author?: string): ChatMiddleware {
  return {
    name: "oracolo-trascrizione",
    onFinish(ctx) {
      ctx.defer(
        storico
          .salva({ ...chiave, ...(author ? { author } : {}), messages: [...ctx.messages] })
          .then(r => {
            if (!r.ok) console.warn("chat: trascrizione non salvata", r.status, r.code ?? "");
          })
          .catch(() => console.warn("chat: trascrizione non salvata (Convex non raggiungibile)")),
      );
    },
  };
}

type ChiamataSalvata = { id: string; metadata?: { providerExecuted?: boolean } };

/** Lo storico salvato con ogni chiamata rimasta senza risultato chiusa da un "non eseguito"
    (uno strumento del browser mai ripreso, un'approvazione mai data): Gemini non accetta una
    chiamata senza risposta seguita da una domanda nuova. */
export function chiudiChiamateSospese(messages: ModelMessage[]): ModelMessage[] {
  const risposte = new Set(messages.flatMap(m => (m.role === "tool" && m.toolCallId ? [m.toolCallId] : [])));
  const out: ModelMessage[] = [];
  let sospese: string[] = [];
  const chiudi = () => {
    for (const toolCallId of sospese) out.push({ role: "tool", toolCallId, content: JSON.stringify({ ok: false, error: "non eseguito" }) });
    sospese = [];
  };
  for (const m of messages) {
    if (m.role !== "tool") chiudi();
    out.push(m);
    if (m.role === "assistant") {
      sospese = ((m.toolCalls ?? []) as ChiamataSalvata[]).filter(c => !c.metadata?.providerExecuted && !risposte.has(c.id)).map(c => c.id);
    }
  }
  chiudi();
  return out;
}

/** I messaggi per il modello: lo storico salvato su Convex più la domanda nuova (o, in una
    ripresa, solo lo storico: il run interrotto è lì). Mai la cronologia del browser. */
export function conversazioneDelServer(salvata: unknown[], r: ValidChatRequest): ModelMessage[] | { error: string } {
  const storico = salvata as ModelMessage[];
  if (r.domanda === undefined) return storico.length ? storico : { error: "Richiesta non valida." };
  // come il limite sul corpo del widget: il browser non può allungare lo storico mandandone solo un pezzo
  if (storico.length >= MAX_MESSAGGI_STORICO || JSON.stringify(storico).length > MAX_CARATTERI_STORICO) return { error: TROPPO_LUNGA };
  return [...chiudiChiamateSospese(storico), { role: "user", content: r.domanda }];
}

/** Il run del widget e, se riprende un run interrotto da uno strumento del browser
    (TanStack AI 0.71), `parentRunId` e `resume`: senza, il widget non riprende. */
export const runDelWidget = (r: ValidChatRequest) => ({
  ...(r.runId ? { runId: r.runId } : {}),
  ...(r.parentRunId ? { parentRunId: r.parentRunId } : {}),
  ...(r.resume ? { resume: r.resume } : {}),
});

/** Gemini, il copione finto (quello della scrittura per /api/chat/scrittura) o quello dei test. */
export async function scegliAdapter(env: Env, dip: DipendenzeChat, { scrittura = false } = {}): Promise<{ adapter: AnyTextAdapter; model: string } | null> {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  if (dip.adapter) return { adapter: dip.adapter, model };
  if (oracoloFinto(env)) return { adapter: await adapterFinto(scrittura), model };
  if (!env.GEMINI_API_KEY && !env.GOOGLE_API_KEY) return null;
  // geminiText types `model` as a union of known ids; the env override is a plain string
  return { adapter: geminiText(model as Parameters<typeof geminiText>[0]), model };
}

export async function handleChat(req: Request, { ip, env = process.env, dip = {} }: { ip: string; env?: Env; dip?: DipendenzeChat }): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed("POST");
  if (!originOk(req.headers.get("origin"), env)) return json(403, { error: "Forbidden" });

  const scelto = await scegliAdapter(env, dip);
  if (!scelto) return json(500, { error: "GEMINI_API_KEY non configurata." });
  const secret = segretoServer(env);
  if (!secret) return json(503, { error: NON_DISPONIBILE });

  const parsed = validate(await req.text());
  if ("error" in parsed) return json(400, { error: parsed.error });

  let pagina: PaginaOracolo | null;
  try {
    pagina = await (dip.pagina ?? paginaDaConvex)(parsed.handle);
  } catch {
    // niente dettagli dell'errore Convex nei log né in risposta (PIANO §1.25)
    console.error("chat: lettura della pagina da Convex non riuscita");
    return json(503, { error: "Dati non disponibili, riprova più tardi." });
  }
  if (!pagina) return json(404, { error: "Pagina non trovata." });

  const storico = dip.storico ?? storicoConvex(secret);
  const chiave: ChiaveTurno = {
    handle: pagina.profilo.handle,
    threadId: parsed.threadId,
    visibility: "pubblica",
    ipHmac: ipHmac(ip, secret),
    ...(parsed.writeKey ? { writeKeyHash: hashChiave(parsed.writeKey) } : {}),
  };
  let turno: EsitoStorico;
  try {
    turno = await storico.turno(chiave);
  } catch {
    console.error("chat: Convex non raggiungibile per il turno");
    return json(503, { error: NON_DISPONIBILE });
  }
  if (!turno.ok) return rispostaTurno(turno);
  const messages = conversazioneDelServer(turno.messages ?? [], parsed);
  if ("error" in messages) return json(400, { error: messages.error });

  const { dataset, profilo } = pagina;
  const today = todayKey(serverNow(env));
  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY || "";
  try {
    const stream = chat({
      adapter: scelto.adapter,
      messages,
      threadId: parsed.threadId,
      ...runDelWidget(parsed),
      systemPrompts: [systemPrompt(dataset, today, profilo)],
      // the tool list is fixed here on the server: client-declared tools are never merged in
      tools: [...chatToolList(chatToolDefs(dataset.vocab)), ...serverTools({ dataset, today, model: scelto.model, apiKey })],
      agentLoopStrategy: untilAnswered,
      modelOptions: { maxOutputTokens: 1500, temperature: 0.4 },
      middleware: [salvaTrascrizione(storico, chiave, parsed.author)],
    });
    return toServerSentEventsResponse(stream);
  } catch (err) {
    console.error("chat error", err instanceof Error ? err.name : typeof err);
    return json(500, { error: "Errore del servizio AI, riprova più tardi." });
  }
}
