/* "Regalato da" (PIANO §5.1). T5 aggiunge il logo (upload, setLogoFromUrl,
   cron degli orfani). */

import { v } from "convex/values";
import { nessunInput } from "../shared/schema/campi.ts";
import { aggiungiRegaloInput, cancellaRegaloInput, modificaRegaloInput } from "../shared/schema/gifter.ts";
import { istantanea, logActivity } from "./lib/activity.ts";
import { internalMutation, ownerMutation, ownerQuery } from "./lib/builders.ts";
import { errore } from "./lib/errors.ts";
import { getOwned } from "./lib/owner.ts";
import { chiave, giftersOf } from "./lib/refs.ts";

export const list = ownerQuery({
  catalogOp: "list_gifters",
  input: nessunInput,
  handler: async (ctx, owner) => ({
    gifters: (await giftersOf(ctx, owner.profile._id)).map(g => ({ id: g._id as string, label: g.label, url: g.url })),
  }),
});

export const add = ownerMutation({
  catalogOp: "add_gifter",
  input: aggiungiRegaloInput,
  handler: async (ctx, owner, { label, url }) => {
    if ((await giftersOf(ctx, owner.profile._id)).some(g => chiave(g.label) === chiave(label))) {
      throw errore("conflitto", "esiste già un \"regalato da\" con questo nome", { campo: "label" });
    }
    const id = await ctx.db.insert("gifters", { profileId: owner.profile._id, label, url });
    await logActivity(ctx, owner, { op: "create", table: "gifters", docId: id, summary: `"regalato da" aggiunto: ${label}`, after: istantanea(await ctx.db.get(id)) });
    return { id: id as string };
  },
});

export const update = ownerMutation({
  catalogOp: "update_gifter",
  input: modificaRegaloInput,
  handler: async (ctx, owner, { id, label, url }) => {
    const g = await getOwned(ctx, owner, "gifters", id);
    if (label !== undefined && (await giftersOf(ctx, owner.profile._id)).some(x => x._id !== g._id && chiave(x.label) === chiave(label))) {
      throw errore("conflitto", "esiste già un \"regalato da\" con questo nome", { campo: "label" });
    }
    await ctx.db.patch(g._id, {
      ...(label !== undefined ? { label } : {}),
      ...(url !== undefined ? { url: url ?? undefined } : {}),
    });
    await logActivity(ctx, owner, { op: "update", table: "gifters", docId: g._id, summary: `"regalato da" modificato: ${label ?? g.label}`, before: istantanea(g), after: istantanea(await ctx.db.get(g._id)) });
    return { ok: true as const };
  },
});

export const remove = ownerMutation({
  catalogOp: "delete_gifter",
  input: cancellaRegaloInput,
  handler: async (ctx, owner, { id }) => {
    const g = await getOwned(ctx, owner, "gifters", id);
    const usato = (await ctx.db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", owner.profile._id)).collect()).some(e => e.giftFromId === g._id);
    if (usato) throw errore("in_uso", "è usato da almeno un concerto: toglilo lì prima di cancellarlo");
    await ctx.db.delete(g._id);
    await logActivity(ctx, owner, { op: "delete", table: "gifters", docId: g._id, summary: `"regalato da" cancellato: ${g.label}`, before: istantanea(g) });
    return { ok: true as const };
  },
});

/** Cron (T5): file di logo caricati e mai usati. Stub fino ad allora. */
export const cleanupOrphanLogos = internalMutation({
  args: {},
  returns: v.null(),
  handler: async () => null,
});
