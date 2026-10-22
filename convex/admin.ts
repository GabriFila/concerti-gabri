/* ──────────────────────────────────────────────────────────────
   Amministrazione (PIANO §5.6): solo funzioni interne, cioè
   `convex run` con la chiave admin del deployment.

   `claimProfile({handle, email})` lega un profilo senza proprietario (il
   seed di `gabrifila`) all'account di chi ha fatto il primo login con
   quell'email, in un'unica mutation:
   - l'utente si trova per email nel componente Better Auth;
   - il suo profilo `onboarding` vuoto, creato dal primo login, si cancella;
     se quel profilo ha già un handle o dei dati, si rifiuta (niente
     perdite silenziose);
   - il profilo del seed riceve `authUserId`.
   Rilanciarla sullo stesso account non cambia niente.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./lib/builders.ts";
import { profileOfUser } from "./lib/owner.ts";

/** true se il profilo ha almeno un dato suo (concerti, persone, partenze, regali, wishlist, registro, chat, alias). */
async function haDati(ctx: MutationCtx, profileId: Id<"profiles">): Promise<boolean> {
  const db = ctx.db;
  const trovati = await Promise.all([
    db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", profileId)).first(),
    db.query("people").withIndex("by_profile_name", q => q.eq("profileId", profileId)).first(),
    db.query("departures").withIndex("by_profile", q => q.eq("profileId", profileId)).first(),
    db.query("gifters").withIndex("by_profile", q => q.eq("profileId", profileId)).first(),
    db.query("wishlist").withIndex("by_profile_ordine", q => q.eq("profileId", profileId)).first(),
    db.query("activity").withIndex("by_profile_at", q => q.eq("profileId", profileId)).first(),
    db.query("chatThreads").withIndex("by_profile_visibility_updatedAt", q => q.eq("profileId", profileId)).first(),
    db.query("handleAliases").withIndex("by_profile", q => q.eq("profileId", profileId)).first(),
  ]);
  return trovati.some(Boolean);
}

export const claimProfile = internalMutation({
  args: { handle: v.string(), email: v.string() },
  returns: v.object({ profileId: v.id("profiles"), giaLegato: v.boolean() }),
  handler: async (ctx, { handle, email }) => {
    const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email.trim().toLowerCase() }],
    })) as { _id: string } | null;
    if (!user) throw new Error("claimProfile: nessun utente con questa email (serve prima un login)");

    const target = await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", handle)).first();
    if (!target) throw new Error("claimProfile: nessun profilo con questo handle");
    if (target.authUserId === user._id) return { profileId: target._id, giaLegato: true };
    if (target.authUserId) throw new Error("claimProfile: il profilo è già legato a un altro account");

    const suo = await profileOfUser(ctx, user._id);
    if (suo) {
      if (suo.status !== "onboarding" || suo.handle || (await haDati(ctx, suo._id))) {
        throw new Error("claimProfile: l'account ha già un profilo con handle o dati; non lo cancello");
      }
      await ctx.db.delete(suo._id);
    }
    await ctx.db.patch(target._id, { authUserId: user._id });
    return { profileId: target._id, giaLegato: false };
  },
});
