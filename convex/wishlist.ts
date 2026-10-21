/* Lista dei desideri: artisti in ordine, fuori da ogni statistica. */

import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { nessunInput } from "../shared/schema/campi.ts";
import { impostaWishlistInput } from "../shared/schema/wishlist.ts";
import { logActivity } from "./lib/activity.ts";
import { ownerMutation, ownerQuery } from "./lib/builders.ts";

export async function wishlistOf(ctx: QueryCtx, profileId: Id<"profiles">) {
  return (await ctx.db.query("wishlist").withIndex("by_profile_ordine", q => q.eq("profileId", profileId)).collect()).map(r => r.artist);
}

export const list = ownerQuery({
  catalogOp: "list_wishlist",
  input: nessunInput,
  handler: async (ctx, owner) => ({ artists: await wishlistOf(ctx, owner.profile._id) }),
});

export const set = ownerMutation({
  catalogOp: "set_wishlist",
  input: impostaWishlistInput,
  handler: async (ctx, owner, { artists }) => {
    const righe = await ctx.db.query("wishlist").withIndex("by_profile_ordine", q => q.eq("profileId", owner.profile._id)).collect();
    const prima = righe.map(r => r.artist);
    for (const r of righe) await ctx.db.delete(r._id);
    for (const [i, artist] of artists.entries()) await ctx.db.insert("wishlist", { profileId: owner.profile._id, artist, ordine: i });
    await logActivity(ctx, owner, { op: "replace", table: "wishlist", docId: owner.profile._id, summary: `lista dei desideri aggiornata (${artists.length})`, before: prima, after: artists });
    return { ok: true as const };
  },
});
