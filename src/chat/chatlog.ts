/* ──────────────────────────────────────────────────────────────
   Chat transcripts of the Oracolo.

   Since traguardo 6 the history lives in Convex (convex/chat.ts: one
   `chatThreads` row per conversation, public reads through
   `chat.listThreads`/`chat.getThread`, write keys stored as SHA-256; the
   Upstash era and its `preview:` namespace are gone, every Convex
   deployment is its own database). What stays here is
   logMessagesToUIMessages(): it turns a stored transcript (TanStack AI
   ModelMessages) back into UIMessages the widget can show or resume.
   The thread-id, title and author rules live in shared/chat/ (re-exported
   here for the widget).
   ────────────────────────────────────────────────────────────── */

import { modelMessagesToUIMessages, type ModelMessage, type UIMessage } from "@tanstack/ai";

export { THREAD_ID_RE, isValidThreadId } from "../../shared/chat/ids.ts";
export { MAX_AUTHOR_CHARS, chatTitle, sanitizeAuthor } from "../../shared/chat/thread.ts";

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
