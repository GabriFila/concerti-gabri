/* ──────────────────────────────────────────────────────────────
   Controlli sulla richiesta a /api/chat, prima di spendere una chiamata
   Gemini: dimensioni, forma dei messaggi, pagina (handle), id del thread e
   chiave di scrittura. I messaggi d'errore sono parte del contratto col
   widget (friendlyError riconosce "troppo lung").

   Il widget (ai-client) manda un RunAgentInput AG-UI: `messages`,
   `threadId` e i dati extra in `forwardedProps` (copiati anche in `data`):
   `handle` della pagina, `writeKey` e `author`.

   Della cronologia del browser il server prende SOLO il testo dell'ultimo
   messaggio dell'utente (`domanda`): la conversazione precedente la
   ricostruisce da Convex (handler.ts, `conversazioneDelServer`). Un
   messaggio "assistant" o una chiamata a uno strumento scritti dal browser
   non arrivano mai al modello né allo storico pubblico. Una ripresa
   (`resume` + `parentRunId`) non porta una domanda: risponde a uno
   strumento del browser o a un'approvazione del run interrotto.

   I limiti del testo dell'utente, del payload di una ripresa e del numero
   di messaggi valgono per il widget pubblico; l'Oracolo in scrittura passa
   i suoi (scrittura.ts: un biglietto incollato, la scheda corretta di
   propose_concert, le sessioni lunghe di schede). Il tetto sul corpo intero
   (MAX_BODY_CHARS) resta uguale per tutti.
   ────────────────────────────────────────────────────────────── */

import { randomUUID } from "node:crypto";
import { isValidThreadId, THREAD_ID_RE } from "../../../shared/chat/ids.ts";
import { sanitizeAuthor } from "../../../shared/chat/thread.ts";

export const MAX_BODY_CHARS = 80_000;
export const MAX_MESSAGES = 40;
export const MAX_USER_TEXT = 1_500;
/** Il risultato di uno strumento del browser in una ripresa (`{ok, matchCount, summary}` e simili). */
export const MAX_PAYLOAD_RIPRESA = 2_000;
/** Lo storico salvato che torna al modello: oltre, "troppo lunga" come per il corpo della richiesta.
    Il doppio, perché su Convex ogni giro di strumenti è un messaggio a sé (nel browser no) e porta
    i metadati del modello: di solito scatta prima il limite del widget. */
export const MAX_MESSAGGI_STORICO = 2 * MAX_MESSAGES;
export const MAX_CARATTERI_STORICO = 2 * MAX_BODY_CHARS;
export const TROPPO_LUNGA = "Conversazione troppo lunga: apri una nuova chat.";

/** Forma larga di un handle (quella stretta la decide Convex: qui basta che sia una chiave sensata). */
export const HANDLE_RICHIESTA_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

const RUOLI_AMMESSI = new Set(["user", "assistant", "tool"]);

/** Il testo di un messaggio utente: una stringa o solo parti di testo (niente immagini né file), altrimenti null.
    Il widget manda sempre una stringa; le parti AG-UI hanno `text`, quelle di TanStack `content`. */
function testoUtente(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  let testo = "";
  for (const p of content) {
    const t = p?.type === "text" ? (p.text ?? p.content) : undefined;
    if (typeof t !== "string") return null;
    testo += t;
  }
  return testo;
}

export interface ValidChatRequest {
  handle: string;
  /** Il testo dell'ultimo messaggio dell'utente; assente in una ripresa. */
  domanda?: string;
  threadId: string;
  writeKey?: string;
  author?: string;
  /** Il run del widget (AG-UI `runId`): l'interruzione di uno strumento del browser vale per quel run. */
  runId?: string;
  /** La ripresa di un run interrotto (AG-UI `resume` + `parentRunId`): i risultati degli
      strumenti del browser e, in scrittura, le approvazioni. */
  resume?: RipresaRun[];
  parentRunId?: string;
}

export interface RipresaRun {
  interruptId: string;
  status: "resolved" | "cancelled";
  payload?: unknown;
}

const MAX_RIPRESE = 20;

const payloadPiccolo = (p: unknown, max: number) => p === undefined || (JSON.stringify(p) ?? "").length <= max;

/** Le voci di `resume` ben formate (le altre si scartano: il motore rifiuta comunque quelle che non aspetta). */
function riprese(v: unknown, maxPayload: number): RipresaRun[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const ok = v.slice(0, MAX_RIPRESE).filter(
    (r): r is RipresaRun =>
      !!r && typeof r === "object" && typeof r.interruptId === "string" && r.interruptId.length <= 200 &&
      (r.status === "resolved" || r.status === "cancelled") && payloadPiccolo(r.payload, maxPayload),
  );
  return ok.map(r => ({ interruptId: r.interruptId, status: r.status, ...(r.payload !== undefined ? { payload: r.payload } : {}) }));
}

const idRun = (v: unknown): string | undefined => (typeof v === "string" && THREAD_ID_RE.test(v) ? v : undefined);

/** I limiti di una route (default: quelli del widget pubblico). */
export interface LimitiRichiesta {
  /** Il payload di una voce di `resume` (JSON), in caratteri. */
  maxPayloadRipresa?: number;
  /** Il testo di un messaggio dell'utente, in caratteri. */
  maxTestoUtente?: number;
  /** I messaggi della cronologia del browser (del tetto: il server ne legge solo l'ultima domanda). */
  maxMessaggi?: number;
}

export function validate(
  raw: string,
  { maxPayloadRipresa = MAX_PAYLOAD_RIPRESA, maxTestoUtente = MAX_USER_TEXT, maxMessaggi = MAX_MESSAGES }: LimitiRichiesta = {},
): ValidChatRequest | { error: string } {
  if (raw.length > MAX_BODY_CHARS) return { error: TROPPO_LUNGA };
  let body: any;
  try { body = JSON.parse(raw); } catch { return { error: "Richiesta non valida." }; }
  const extra = body?.forwardedProps ?? body?.data;
  // la pagina dell'Oracolo: senza, non si sa di chi parlare
  const rawHandle = extra?.handle;
  const handle = typeof rawHandle === "string" ? rawHandle.trim().toLowerCase() : "";
  if (!HANDLE_RICHIESTA_RE.test(handle)) return { error: "Richiesta non valida." };
  const threadId: string =
    typeof body?.threadId === "string" && isValidThreadId(body.threadId) ? body.threadId : randomUUID();
  // per-thread ownership secret, sent by the widget in forwardedProps
  const rawKey = extra?.writeKey;
  const writeKey = typeof rawKey === "string" && THREAD_ID_RE.test(rawKey) ? rawKey : undefined;
  // optional visitor signature for the public history, sent next to the key
  const author = sanitizeAuthor(extra?.author);
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return { error: "Richiesta non valida." };
  if (messages.length > maxMessaggi) return { error: TROPPO_LUNGA };
  for (const m of messages) {
    if (typeof m !== "object" || m === null || typeof m.role !== "string") return { error: "Richiesta non valida." };
    if (m.role !== "user") continue;
    const testo = testoUtente(m.content);
    if (testo === null) return { error: "Richiesta non valida." };
    if (testo.length > maxTestoUtente) return { error: `Messaggio troppo lungo (max ${maxTestoUtente} caratteri).` };
  }
  const conversazione = messages.filter(m => RUOLI_AMMESSI.has(m.role));
  if (!conversazione.some(m => m.role === "user")) return { error: "Richiesta non valida." };
  const runId = idRun(body?.runId);
  const parentRunId = idRun(body?.parentRunId);
  const resume = riprese(body?.resume, maxPayloadRipresa);
  const base = { handle, threadId, writeKey, author, ...(runId ? { runId } : {}) };
  // una ripresa vale solo col run che riprende: niente domanda nuova
  if (parentRunId && resume?.length) return { ...base, parentRunId, resume };
  // altrimenti il turno è l'ultimo messaggio, e deve essere dell'utente
  const ultimo = conversazione[conversazione.length - 1];
  const domanda = ultimo.role === "user" ? testoUtente(ultimo.content) : null;
  if (!domanda?.trim()) return { error: "Richiesta non valida." };
  return { ...base, domanda };
}

// Origini per ambiente: stanno in origins.ts, riesportate qui accanto agli
// altri controlli della richiesta.
export { allowedOrigins, deployKind, isAllowedOrigin, originOk, LOCAL_ORIGINS, PORTLESS_ORIGIN_RE, PRODUCTION_ORIGINS, type DeployEnv, type DeployKind } from "./origins.ts";
