/* ──────────────────────────────────────────────────────────────
   I thread dell'Oracolo (PIANO §1.26), regole comuni alla route Start e a
   convex/chat.ts: titolo, firma del visitatore e durata. Puro e isomorfo:
   i messaggi sono quelli di TanStack AI (ModelMessage), tipizzati qui solo
   per la forma che serve.
   ────────────────────────────────────────────────────────────── */

/** Quanto resta una conversazione dopo l'ultimo messaggio (cron `oracolo: thread scaduti`). */
export const CHAT_TTL_GIORNI = 90;
export const CHAT_TTL_MS = CHAT_TTL_GIORNI * 86_400_000;

/** La firma è testo libero del browser e la leggono tutti: lunghezza e caratteri di controllo si tagliano qui. */
export const MAX_AUTHOR_CHARS = 40;
export function sanitizeAuthor(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_AUTHOR_CHARS).trim();
  return s || undefined;
}

interface MessaggioConTesto {
  role: string;
  content?: unknown;
}

/** Il titolo nello storico: il primo messaggio dell'utente. */
export function chatTitle(messages: readonly MessaggioConTesto[]): string {
  const c = messages.find(m => m.role === "user")?.content;
  const text = typeof c === "string"
    ? c
    : Array.isArray(c)
      ? c.filter((p: { type?: string; content?: unknown }) => p?.type === "text" && typeof p.content === "string").map((p: { content: string }) => p.content).join(" ")
      : "";
  return text.trim().slice(0, 80) || "Chat";
}
