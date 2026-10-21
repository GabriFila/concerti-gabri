/* Storico dell'Oracolo per pagina (PIANO §1.26): le funzioni arrivano con il
   traguardo 6. Qui solo lo stub del cron TTL (le voci dei cron sono congelate
   nel traguardo 2). */

import { v } from "convex/values";
import { internalMutation } from "./lib/builders.ts";

/** Cron (T6): thread scaduti (`expiresAt`). */
export const cleanupExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async ctx => {
    const scaduti = await ctx.db.query("chatThreads").withIndex("by_expires", q => q.lt("expiresAt", Date.now())).take(200);
    for (const t of scaduti) await ctx.db.delete(t._id);
    return null;
  },
});
