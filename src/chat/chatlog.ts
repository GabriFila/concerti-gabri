/* ──────────────────────────────────────────────────────────────
   Chat transcript log — shared between the two Netlify functions
   (chat.mts writes it, chat-history.mts reads it). Nothing here is
   imported by browser code.

   Redis layout: one JSON blob per conversation under
   `concerti:chat:log:<threadId>` (TTL-bounded) plus a sorted-set
   index of threadIds scored by last-update time.
   ────────────────────────────────────────────────────────────── */

import { modelMessagesToUIMessages, type ModelMessage, type UIMessage } from "@tanstack/ai";

export const CHAT_LOG_INDEX_KEY = "concerti:chat:log:index";
export const chatLogKey = (threadId: string) => `concerti:chat:log:${threadId}`;

// TanStack ids look like "thread-<ts>-<rand>", the widget's are UUIDs;
// anything else from a hand-rolled client is rejected so a client-chosen
// value never becomes an arbitrary Redis key.
export const THREAD_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

// Same origin allowlist for both chat functions.
export const ALLOWED_ORIGINS = /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|concerti\.gabrifila\.me|[a-z0-9-]+\.netlify\.app)$/i;

/** What chat.mts stores per conversation. `ip` is for abuse review only
    and must never be returned to the browser. */
export interface ChatLogRecord {
  threadId: string;
  ip: string;
  updatedAt: string;
  messages: ModelMessage[];
}

const parseMaybeJson = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
};

/** Convert stored ModelMessages into UIMessages the chat widget can resume
    from. The library conversion leaves tool-call parts without `output`
    (results live in separate tool-result parts), so the widget's tool chips
    would render as still running; merge each result back onto its call and
    parse the arguments into `input` (used for chip labels). The tool-result
    parts are kept: the widget renders them as nothing, but they're what
    turns back into `role:"tool"` messages when the resumed history is sent
    to the model. */
export function logMessagesToUIMessages(messages: ModelMessage[]): UIMessage[] {
  const ui = modelMessagesToUIMessages(messages);
  const results = new Map<string, unknown>();
  for (const m of ui) {
    for (const p of m.parts ?? []) {
      if (p.type === "tool-result") results.set(p.toolCallId, parseMaybeJson(p.content));
    }
  }
  return ui.map(m => ({
    ...m,
    parts: (m.parts ?? []).map((p: any) =>
      p.type === "tool-call"
        ? { ...p, input: parseMaybeJson(p.arguments), ...(results.has(p.id) && { output: results.get(p.id) }) }
        : p),
  }));
}
