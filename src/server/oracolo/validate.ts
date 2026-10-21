/* ──────────────────────────────────────────────────────────────
   Controlli sulla richiesta a /api/chat, prima di spendere una chiamata
   Gemini: dimensioni, forma dei messaggi, id del thread e chiave di
   scrittura. I messaggi d'errore sono parte del contratto col widget
   (friendlyError riconosce "troppo lung").
   ────────────────────────────────────────────────────────────── */

import { randomUUID } from "node:crypto";
import { isValidThreadId, sanitizeAuthor, THREAD_ID_RE } from "../../chat/chatlog.ts";

export const MAX_BODY_CHARS = 80_000;
export const MAX_MESSAGES = 40;
export const MAX_USER_TEXT = 1_500;

export interface ValidChatRequest {
  messages: unknown[];
  threadId: string;
  writeKey?: string;
  author?: string;
}

export function validate(raw: string): ValidChatRequest | { error: string } {
  if (raw.length > MAX_BODY_CHARS) return { error: "Conversazione troppo lunga: apri una nuova chat." };
  let body: any;
  try { body = JSON.parse(raw); } catch { return { error: "Richiesta non valida." }; }
  const threadId: string =
    typeof body?.threadId === "string" && isValidThreadId(body.threadId) ? body.threadId : randomUUID();
  // per-thread ownership secret, sent by the widget in forwardedProps
  const rawKey = body?.forwardedProps?.writeKey ?? body?.data?.writeKey;
  const writeKey = typeof rawKey === "string" && THREAD_ID_RE.test(rawKey) ? rawKey : undefined;
  // optional visitor signature for the public history, sent next to the key
  const author = sanitizeAuthor(body?.forwardedProps?.author ?? body?.data?.author);
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return { error: "Richiesta non valida." };
  if (messages.length > MAX_MESSAGES) return { error: "Conversazione troppo lunga: apri una nuova chat." };
  for (const m of messages) {
    if (typeof m !== "object" || m === null || typeof m.role !== "string") return { error: "Richiesta non valida." };
    if (m.role === "user" && typeof m.content === "string" && m.content.length > MAX_USER_TEXT)
      return { error: `Messaggio troppo lungo (max ${MAX_USER_TEXT} caratteri).` };
  }
  return { messages, threadId, writeKey, author };
}

// Origini per ambiente: stanno in origins.ts, riesportate qui accanto agli
// altri controlli della richiesta.
export { allowedOrigins, deployKind, isAllowedOrigin, originOk, LOCAL_ORIGINS, PORTLESS_ORIGIN_RE, PRODUCTION_ORIGINS, type DeployEnv, type DeployKind } from "./origins.ts";
