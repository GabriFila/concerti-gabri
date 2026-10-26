/* Registro attività: elenco, Annulla (convex/lib/activity.ts) e conservazione
   a 180 giorni (cron). I cambi di logo dei "regalato da" (op "logo",
   convex/gifters.ts) si registrano ma non si annullano: il file di prima è
   già cancellato. */

import { v } from "convex/values";
import { annullaInput, elencaAttivitaInput } from "../shared/schema/activity.ts";
import { OP_LOGO } from "./gifters.ts";
import { annulla, annullabile } from "./lib/activity.ts";
import { ETICHETTE_ATTORE } from "./lib/owner.ts";
import { errore } from "./lib/errors.ts";
import { internalMutation, ownerMutation, ownerQuery } from "./lib/builders.ts";

export const CONSERVAZIONE_MS = 180 * 24 * 3600_000;

/** Operazioni registrate che non si annullano (vedi sopra). */
export const OP_SENZA_ANNULLA = new Set<string>([OP_LOGO]);

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
        // le voci di prima del cambio di nome hanno ancora «Oracolo» salvato: l'etichetta si mostra sempre quella di oggi
        autore: a.actor.via === "oracolo" ? ETICHETTE_ATTORE.oracolo : a.actor.label,
        via: a.actor.via,
        op: a.op,
        tabella: a.table,
        riassunto: a.summary,
        lotto: a.batchId,
        annullata: !!a.undoneBy,
        annullabile: annullabile(a) && !OP_SENZA_ANNULLA.has(a.op),
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
    const voce = await ctx.db.get(id);
    if (voce && voce.profileId === owner.profile._id && OP_SENZA_ANNULLA.has(voce.op)) {
      throw errore("conflitto", "un cambio di logo non si annulla: il logo di prima non c'è più, caricane un altro");
    }
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
