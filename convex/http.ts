/* ──────────────────────────────────────────────────────────────
   Route HTTP di Convex (PIANO §5.2): quelle di Better Auth (/api/auth/*,
   chiamate dal proxy Start di /api/auth, stessa origine: niente CORS).
   `/oracolo/turno` e `/oracolo/trascrizione` (T6): la route Start manda
   CHAT_SERVER_SECRET come `Authorization: Bearer`, MAI come argomento
   (gli errori di validazione ripetono gli argomenti: PIANO §1.25); qui si
   confronta a tempo costante; il resto (corpo, turno, trascrizione) sta in
   convex/chat.ts (traguardo 6).
   ────────────────────────────────────────────────────────────── */

import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
import { authComponent, createAuth } from "./auth.ts";
import { trascrizioneHttp, turnoHttp } from "./chat.ts";

/** Confronto a tempo costante (lunghezze diverse: falso, senza uscire prima sul contenuto). */
export function ugualeCostante(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i % (ea.length || 1)] ?? 0) ^ (eb[i % (eb.length || 1)] ?? 0);
  return diff === 0 && ea.length > 0;
}

export function autorizzato(req: Request): boolean {
  const secret = process.env.CHAT_SERVER_SECRET ?? "";
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  return secret.length >= 16 && ugualeCostante(token, secret);
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Solo la route Start col segreto: senza, 401 prima di leggere il corpo (che non si ripete mai). */
const oracolo = (fn: (ctx: ActionCtx, req: Request) => Promise<Response>) =>
  httpAction(async (ctx, req) => (autorizzato(req) ? await fn(ctx, req) : json(401, { code: "unauthorized", messaggio: "non autorizzato" })));

const http = httpRouter();
authComponent.registerRoutes(http, createAuth);
http.route({ path: "/oracolo/turno", method: "POST", handler: oracolo(turnoHttp) });
http.route({ path: "/oracolo/trascrizione", method: "POST", handler: oracolo(trascrizioneHttp) });

export default http;
