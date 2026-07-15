/* ──────────────────────────────────────────────────────────────
   Chat history endpoint (GET /api/chat/history?threadId=...).

   Returns one stored conversation from the Redis transcript log
   (written by chat.mts) as UIMessages ready for the widget's
   `initialMessages`, so a visitor can reopen and continue a chat.

   Access control is capability-based: thread ids are unguessable
   (UUIDs / TanStack random ids) and the browser only knows the ids
   of its own conversations (kept in localStorage), so knowing the
   id IS the authorization. The stored visitor IP is never returned.

   Uses the same Upstash env vars as chat.mts; without them there is
   no transcript log, so the endpoint answers 503.
   ────────────────────────────────────────────────────────────── */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ALLOWED_ORIGINS, chatLogKey, logMessagesToUIMessages, THREAD_ID_RE, type ChatLogRecord } from "../../src/chat/chatlog.ts";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

// Reads are cheap but public: cap them per IP, generously enough for a
// browsing user (each history open costs one request per clicked chat).
const limiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, "60 s"), prefix: "concerti:chat:hist-m" })
  : null;

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

export default async (req: Request, context: { ip?: string }) => {
  if (req.method !== "GET") return json(405, { error: "Method not allowed" });

  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.test(origin)) return json(403, { error: "Forbidden" });

  if (!redis || !limiter) return json(503, { error: "Cronologia non disponibile." });

  const threadId = new URL(req.url).searchParams.get("threadId") || "";
  if (!THREAD_ID_RE.test(threadId)) return json(400, { error: "Richiesta non valida." });

  const ip = context.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";
  try {
    const rate = await limiter.limit(ip);
    if (!rate.success) return json(429, { error: "Troppe richieste: aspetta un momento e riprova." });

    const record = await redis.get<ChatLogRecord>(chatLogKey(threadId));
    if (!record?.messages?.length) return json(404, { error: "Chat non trovata: probabilmente è scaduta." });
    return json(200, {
      threadId,
      updatedAt: record.updatedAt,
      messages: logMessagesToUIMessages(record.messages),
    });
  } catch (err) {
    console.error("chat history error", err);
    return json(500, { error: "Errore del servizio, riprova più tardi." });
  }
};

export const config = { path: "/api/chat/history" };
