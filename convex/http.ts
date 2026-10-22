/* ──────────────────────────────────────────────────────────────
   Route HTTP di Convex (PIANO §5.2): quelle di Better Auth (/api/auth/*,
   chiamate dal proxy Start di /api/auth, stessa origine: niente CORS).
   `/oracolo/turno` e `/oracolo/trascrizione` (T6): la route Start manda
   CHAT_SERVER_SECRET come `Authorization: Bearer`, MAI come argomento
   (gli errori di validazione ripetono gli argomenti: PIANO §1.25); qui si
   confronta a tempo costante. Nel traguardo 2 sono stub: 401 o 501.
   ────────────────────────────────────────────────────────────── */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth.ts";

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

const stubOracolo = httpAction(async (_ctx, req) => {
  if (!autorizzato(req)) return json(401, { code: "unauthorized", messaggio: "non autorizzato" });
  return json(501, { code: "non_disponibile", messaggio: "arriva con il traguardo 6" });
});

const http = httpRouter();
authComponent.registerRoutes(http, createAuth);
http.route({ path: "/oracolo/turno", method: "POST", handler: stubOracolo });
http.route({ path: "/oracolo/trascrizione", method: "POST", handler: stubOracolo });

export default http;
