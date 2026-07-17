/* ──────────────────────────────────────────────────────────────
   Chat transcript log — shared between the two Netlify functions
   (chat.mts writes it, chat-history.mts reads it). Nothing here is
   imported by browser code.

   Redis layout: one JSON blob per conversation under
   `concerti:chat:log:<threadId>` (TTL-bounded), a sorted-set index
   of threadIds scored by last-update time, a hash of chat titles
   (first user message) and a hash of author names (the optional
   visitor-chosen signature) so the history list can be served
   without fetching whole transcripts, and a hash of per-thread
   write keys.

   Ownership: the browser that starts a thread generates a secret
   write key (kept in its localStorage, sent with every message);
   chat.mts stores it in the keys hash and refuses to continue a
   keyed thread without the matching key. Thread ids are public
   (the history list shows them) — the key is what makes "continue
   only your own chats" enforceable without accounts. Keys never
   leave the server via the history endpoint.
   ────────────────────────────────────────────────────────────── */

import { modelMessagesToUIMessages, type ModelMessage, type UIMessage } from "@tanstack/ai";

export const CHAT_LOG_INDEX_KEY = "concerti:chat:log:index";
export const CHAT_LOG_TITLES_KEY = "concerti:chat:log:titles";
export const CHAT_LOG_KEYS_KEY = "concerti:chat:log:keys";
export const CHAT_LOG_AUTHORS_KEY = "concerti:chat:log:authors";
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
  /** Optional visitor-chosen name, shown next to the chat in the public history. */
  author?: string;
}

/** The author name is free text from the browser and ends up rendered to every
    visitor: cap its length and collapse whitespace/control chars server-side,
    whatever the widget's own maxLength says. */
export const MAX_AUTHOR_CHARS = 40;
export function sanitizeAuthor(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_AUTHOR_CHARS).trim();
  return s || undefined;
}

/** History-list title for a conversation: its first user message. */
export function chatTitle(messages: ModelMessage[]): string {
  const c = messages.find(m => m.role === "user")?.content;
  const text = typeof c === "string"
    ? c
    : Array.isArray(c) ? c.filter((p: any) => p.type === "text").map((p: any) => p.content).join(" ") : "";
  return text.trim().slice(0, 80) || "Chat";
}

/** Drop index entries (and their titles + authors + write keys) older than the
    transcript TTL, so the listing never outlives the expiring
    `concerti:chat:log:<id>` blobs. Called from both the write path
    (chat.mts) and the list path (chat-history.mts); reads-then-removes so
    the hashes never leak orphan fields. The Redis client is typed loosely
    to avoid importing @upstash/redis into a src/ module. */
export async function pruneExpiredChatLog(r: any, now: number, ttlSeconds: number): Promise<void> {
  const expired: string[] = await r.zrange(CHAT_LOG_INDEX_KEY, 0, now - ttlSeconds * 1000, { byScore: true });
  if (!expired.length) return;
  await Promise.all([
    r.zrem(CHAT_LOG_INDEX_KEY, ...expired),
    r.hdel(CHAT_LOG_TITLES_KEY, ...expired),
    r.hdel(CHAT_LOG_KEYS_KEY, ...expired),
    r.hdel(CHAT_LOG_AUTHORS_KEY, ...expired),
  ]);
}

/** Ownership gate for continuing a thread: a thread claimed with a write key
    can only get new messages from the client holding that key. Unclaimed
    threads (fresh ids, or legacy ones logged before keys existed) are open —
    they get claimed by the next persisted request that carries a key. */
export async function isThreadWritable(r: any, threadId: string, writeKey: string | undefined): Promise<boolean> {
  const existing: string | null = await r.hget(CHAT_LOG_KEYS_KEY, threadId);
  return !existing || existing === writeKey;
}

/** The public history list, newest first: prunes expired entries, then reads
    ids+scores from the index and titles/authors from the hashes — whole
    transcripts are never fetched for listing. */
export async function listChatLog(r: any, now: number, ttlSeconds: number, limit: number): Promise<Array<{ threadId: string; title: string; updatedAt: number; author?: string }>> {
  await pruneExpiredChatLog(r, now, ttlSeconds);
  const flat: Array<string | number> = await r.zrange(CHAT_LOG_INDEX_KEY, 0, limit - 1, { rev: true, withScores: true });
  const ids: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    ids.push(String(flat[i]));
    scores.push(Number(flat[i + 1]));
  }
  const [titles, authors]: Array<Record<string, string> | null> = ids.length
    ? await Promise.all([r.hmget(CHAT_LOG_TITLES_KEY, ...ids), r.hmget(CHAT_LOG_AUTHORS_KEY, ...ids)])
    : [null, null];
  return ids.map((id, i) => ({
    threadId: id,
    title: titles?.[id] || "Chat",
    updatedAt: scores[i],
    ...(authors?.[id] && { author: authors[id] }),
  }));
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
