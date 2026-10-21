/* Registro attività: elenco, Annulla (convex/lib/activity.ts) e conservazione
   a 180 giorni (cron). */

import { v } from "convex/values";
import { annullaInput, elencaAttivitaInput } from "../shared/schema/activity.ts";
import { annulla, annullabile } from "./lib/activity.ts";
import { errore } from "./lib/errors.ts";
import { internalMutation, ownerMutation, ownerQuery } from "./lib/builders.ts";

export const CONSERVAZIONE_MS = 180 * 24 * 3600_000;

export const list = ownerQuery({
  catalogOp: "list_activity",
  input: elencaAttivitaInput,
  handler: async (ctx, owner, { limite }) => {
    const voci = await ctx.db
      .query("activity")
      .withIndex("by_profile_at", q => q.eq("profileId", owner.profile._id))
      .order("desc")
      .take(limite ?? 30);
    return {
      voci: voci.map(a => ({
        id: a._id as string,
        at: a.at,
        autore: a.actor.label,
        via: a.actor.via,
        op: a.op,
        tabella: a.table,
        riassunto: a.summary,
        lotto: a.batchId,
        annullata: !!a.undoneBy,
        annullabile: annullabile(a),
      })),
    };
  },
});

export const undo = ownerMutation({
  catalogOp: "undo",
  input: annullaInput,
  handler: async (ctx, owner, { activityId }) => {
    const id = ctx.db.normalizeId("activity", activityId);
    if (!id) throw errore("not_found", "voce del registro non trovata");
    const nuove = await annulla(ctx, owner, id);
    return { ok: true as const, voci: nuove.length };
  },
});

/** Cron: voci più vecchie di 180 giorni. */
export const cleanupOld = internalMutation({
  args: {},
  returns: v.null(),
  handler: async ctx => {
    const limite = Date.now() - CONSERVAZIONE_MS;
    const vecchie = await ctx.db.query("activity").order("asc").take(500);
    for (const a of vecchie) if (a.at < limite) await ctx.db.delete(a._id);
    return null;
  },
});
