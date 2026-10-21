/* ──────────────────────────────────────────────────────────────
   La pagina pubblica di un profilo (PIANO §5.2): `pages.byHandle`.

   Restituisce, con `returns` esplicito (proiezione pubblica): profilo
   pubblico, concerti, nomi delle persone USATE, "regalato da" con
   `logoUrl`, nomi delle partenze, venue e città usate con le coordinate,
   wishlist, tema e layout. Mai `authUserId`, `onboardingStep`,
   `hasAddress`, `kmSource`, indirizzi o coordinate delle partenze.
   `null` se il profilo non esiste o non è `active`; `{redirect}` se
   l'handle è un alias.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { publicQuery } from "./lib/builders.ts";
import { wishlistOf } from "./wishlist.ts";

const voto = v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4), v.literal(5));
const vicinanza = v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4), v.literal(5), v.literal(6));
const canzoniNote = v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4), v.literal(5), v.literal("na"));

export const entryPubblica = v.object({
  _id: v.id("entries"),
  kind: v.union(v.literal("concert"), v.literal("festival")),
  date: v.string(),
  sortKey: v.number(),
  y: v.number(),
  venueId: v.id("venues"),
  cost: v.optional(v.union(v.number(), v.literal("na"))),
  gift: v.optional(v.boolean()),
  giftFromId: v.optional(v.id("gifters")),
  accredito: v.optional(v.boolean()),
  departureId: v.optional(v.id("departures")),
  km: v.optional(v.number()),
  kmPending: v.optional(v.boolean()),
  comments: v.optional(v.string()),
  artist: v.optional(v.string()),
  with: v.optional(v.array(v.id("people"))),
  voto: v.optional(voto),
  vicinanza: v.optional(vicinanza),
  canzoniNote: v.optional(canzoniNote),
  name: v.optional(v.string()),
  concerts: v.optional(
    v.array(
      v.object({
        cid: v.string(),
        artist: v.string(),
        with: v.array(v.id("people")),
        voto: v.optional(voto),
        vicinanza: v.optional(vicinanza),
        canzoniNote: v.optional(canzoniNote),
        date: v.optional(v.string()),
      }),
    ),
  ),
});

export const paginaPubblica = v.object({
  profile: v.object({
    handle: v.string(),
    displayName: v.string(),
    forma: v.union(v.literal("f"), v.literal("m"), v.literal("n")),
    theme: v.object({
      preset: v.string(),
      accent: v.optional(v.string()),
      fontTitoli: v.optional(v.union(v.literal("fraunces"), v.literal("inter"), v.literal("space-grotesk"), v.literal("playfair-display"))),
      raggi: v.optional(v.string()),
      densita: v.optional(v.string()),
    }),
    layout: v.object({ ordine: v.array(v.string()), nascoste: v.array(v.string()), titoli: v.record(v.string(), v.string()) }),
    extra: v.object({ creditoFooter: v.optional(v.string()), linkTappi: v.optional(v.string()) }),
  }),
  entries: v.array(entryPubblica),
  people: v.array(v.object({ _id: v.id("people"), name: v.string() })),
  gifters: v.array(v.object({ _id: v.id("gifters"), label: v.string(), url: v.optional(v.string()), logoUrl: v.optional(v.string()) })),
  departures: v.array(v.object({ _id: v.id("departures"), name: v.string() })),
  venues: v.array(v.object({ _id: v.id("venues"), name: v.string(), city: v.string(), lng: v.number(), lat: v.number() })),
  cities: v.array(v.object({ name: v.string(), lng: v.number(), lat: v.number() })),
  wishlist: v.array(v.string()),
});

const proietta = (e: Doc<"entries">) => {
  const { profileId, kmSource, updatedAt, _creationTime, ...pub } = e;
  void profileId;
  void kmSource;
  void updatedAt;
  void _creationTime;
  return pub;
};

export const byHandle = publicQuery({
  args: { handle: v.string() },
  returns: v.union(v.null(), v.object({ redirect: v.string() }), paginaPubblica),
  handler: async (ctx, { handle }: { handle: string }) => {
    const h = handle.slice(0, 64).toLowerCase();
    const profile = await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", h)).first();
    if (!profile) {
      const alias = await ctx.db.query("handleAliases").withIndex("by_handle", q => q.eq("handle", h)).first();
      if (!alias) return null;
      const target = await ctx.db.get(alias.profileId);
      return target?.status === "active" && target.handle ? { redirect: target.handle } : null;
    }
    if (profile.status !== "active" || !profile.handle) return null;
    const pid = profile._id;
    const entries = await ctx.db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", pid)).collect();

    const usate = new Set<Id<"people">>();
    for (const e of entries) {
      for (const p of e.with ?? []) usate.add(p);
      for (const c of e.concerts ?? []) for (const p of c.with) usate.add(p);
    }
    const people = (await ctx.db.query("people").withIndex("by_profile_name", q => q.eq("profileId", pid)).collect())
      .filter(p => usate.has(p._id))
      .map(p => ({ _id: p._id, name: p.name }));

    const gifters = [];
    for (const g of await ctx.db.query("gifters").withIndex("by_profile", q => q.eq("profileId", pid)).collect()) {
      const logoUrl = g.logo ? ("url" in g.logo ? g.logo.url : ((await ctx.storage.getUrl(g.logo.storageId)) ?? undefined)) : undefined;
      gifters.push({ _id: g._id, label: g.label, ...(g.url ? { url: g.url } : {}), ...(logoUrl ? { logoUrl } : {}) });
    }
    const departures = (await ctx.db.query("departures").withIndex("by_profile", q => q.eq("profileId", pid)).collect()).map(d => ({ _id: d._id, name: d.name }));

    const venues = [];
    const cityKeys = new Set<string>();
    for (const id of new Set(entries.map(e => e.venueId))) {
      const ven = await ctx.db.get(id);
      if (!ven) continue;
      venues.push({ _id: ven._id, name: ven.name, city: ven.city, lng: ven.lng, lat: ven.lat });
      cityKeys.add(ven.cityKey);
    }
    const cities = [];
    for (const k of cityKeys) {
      const c = await ctx.db.query("cities").withIndex("by_key", q => q.eq("key", k)).first();
      if (c) cities.push({ name: c.name, lng: c.lng, lat: c.lat });
    }

    return {
      profile: {
        handle: profile.handle,
        displayName: profile.displayName ?? profile.handle,
        forma: profile.forma ?? "n",
        theme: profile.theme,
        layout: profile.layout,
        extra: profile.extra,
      },
      entries: entries.map(proietta),
      people,
      gifters,
      departures,
      venues,
      cities,
      wishlist: await wishlistOf(ctx, pid),
    };
  },
});

