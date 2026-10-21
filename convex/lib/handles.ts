/* ──────────────────────────────────────────────────────────────
   Handle e alias (PIANO §1.20): un'unica strada per cambiare l'handle di
   un profilo, usata da profiles.update e da Annulla (lib/activity.ts), così
   due profili non possono mai finire con lo stesso handle.

   - Disponibile = formato valido, non riservato, non preso da un altro
     profilo né da un alias di un altro profilo. Il proprio handle di prima
     (un alias di sé) torna sempre disponibile, anche se è riservato: è il
     caso di `gabrifila` che si rinomina e poi torna indietro.
   - Cambiare handle: il vecchio diventa un alias (301) e resta riservato;
     se il nuovo era un alias di sé, quell'alias sparisce.
   T3 sostituisce l'elenco dei riservati con shared/handles.ts.
   ────────────────────────────────────────────────────────────── */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { errore } from "./errors.ts";

export const HANDLE_RISERVATI = new Set([
  "dati", "benvenuto", "privacy", "modifica", "api", "mcp", "ingest", "assets", "og", "login",
  "accedi", "autorizza", "esci", "logout", "well-known", "static", "public", "admin", "account",
  "impostazioni", "robots", "sitemap", "manifest", "www", "app", "aiuto", "gabrifila",
]);
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/** Perché un handle non è disponibile (o null se lo è). `self`: il profilo che lo chiede. */
export async function motivoHandle(ctx: QueryCtx | MutationCtx, handle: string, self?: Id<"profiles">): Promise<string | null> {
  if (!HANDLE_RE.test(handle)) return "formato non valido";
  const p = await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", handle)).first();
  if (p && p._id !== self) return "già preso";
  const a = await ctx.db.query("handleAliases").withIndex("by_handle", q => q.eq("handle", handle)).first();
  if (a && a.profileId !== self) return "già preso";
  // il proprio handle, attuale o di prima: sempre disponibile
  if (self && ((p && p._id === self) || (a && a.profileId === self))) return null;
  if (HANDLE_RISERVATI.has(handle)) return "riservato";
  return null;
}

/**
 * Porta il profilo all'handle `nuovo`, con gli alias. Lancia
 * `handle_non_disponibile` se non si può. Non scrive il registro.
 */
export async function cambiaHandle(ctx: MutationCtx, profile: Doc<"profiles">, nuovo: string) {
  if (nuovo === profile.handle) return;
  const motivo = await motivoHandle(ctx, nuovo, profile._id);
  if (motivo) throw errore("handle_non_disponibile", `handle non disponibile: ${motivo}`, { campo: "handle" });
  // il vecchio handle diventa un alias (301) e resta riservato
  if (profile.handle) {
    const gia = await ctx.db.query("handleAliases").withIndex("by_handle", q => q.eq("handle", profile.handle!)).first();
    if (!gia) await ctx.db.insert("handleAliases", { handle: profile.handle, profileId: profile._id, createdAt: Date.now() });
  }
  // tornare a un handle di prima: il suo alias non serve più
  for (const a of await ctx.db.query("handleAliases").withIndex("by_handle", q => q.eq("handle", nuovo)).collect()) {
    if (a.profileId === profile._id) await ctx.db.delete(a._id);
  }
  await ctx.db.patch(profile._id, { handle: nuovo });
}
