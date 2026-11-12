/* ──────────────────────────────────────────────────────────────
   Chi è admin (DECISIONI «Vista admin», 2026-11-12).

   `ADMIN_USER_IDS` (variabile d'ambiente del deployment Convex): una lista
   di `authUserId` di Better Auth separati da virgole. Vuota o assente =
   nessun admin (così resta spenta in produzione finché Gabri non la
   imposta lì).

   Il controllo guarda SOLO l'utente della sessione Better Auth
   (`utenteDellaSessione`, lo stesso di requireOwner): mai l'email, mai un
   token agente (API key o OAuth), mai `as: "oracolo"`. Chi non è admin,
   sessione assente compresa, riceve lo stesso `not_found` di `getOwned`:
   dall'esterno una funzione admin non si distingue da una che non c'è.
   ────────────────────────────────────────────────────────────── */

import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { errore } from "./errors.ts";
import { utenteDellaSessione } from "./owner.ts";

export interface Admin {
  authUserId: string;
}

/** Gli `authUserId` di `ADMIN_USER_IDS` (insieme vuoto se manca). */
export function idAdmin(valore: string | undefined = process.env.ADMIN_USER_IDS): Set<string> {
  return new Set((valore ?? "").split(",").map(s => s.trim()).filter(Boolean));
}

const nonTrovato = () => errore("not_found", "non trovato");

/** L'admin della sessione, o `not_found` (anche con un token agente o `as`, presenti a qualsiasi valore). */
export async function requireAdmin(ctx: QueryCtx | MutationCtx | ActionCtx, a: { agentToken?: unknown; as?: unknown }): Promise<Admin> {
  if ((a.agentToken !== undefined && a.agentToken !== null) || (a.as !== undefined && a.as !== null)) throw nonTrovato();
  const ammessi = idAdmin();
  if (!ammessi.size) throw nonTrovato();
  const userId = await utenteDellaSessione(ctx);
  if (!userId || !ammessi.has(userId)) throw nonTrovato();
  return { authUserId: userId };
}
