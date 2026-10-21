/* ──────────────────────────────────────────────────────────────
   `seed:ensure` (PIANO §5.6): interna e idempotente, la usa anche
   `--preview-run`. Porta in Convex il profilo `gabrifila` dai dati statici
   (shared/seed/gabrifila.ts):
   - 49 persone, 1 "regalato da" (logo esterno https), la wishlist;
   - le venue con le loro coordinate più le città;
   - 2 partenze, "Milano" e "Genova", `legacy` e SENZA indirizzo;
   - 84 righe (91 concerti, 2 festival) con i km di oggi copiati TALI E
     QUALI (`kmSource: "legacy"`);
   - le coppie km legacy: per ogni (partenza, venue) il km del concerto più
     recente (ogni concerto tiene il suo).
   Il profilo è `active`, `onboardingStep: "fatto"`, forma `m`, senza
   `authUserId` (lo lega admin:claimProfile). Solo il seed scavalca
   l'handle riservato `gabrifila`.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { sortKey } from "../shared/lib/dates.ts";
import { isFestival } from "../shared/model/concert.ts";
import { ALLDATA, CITY_COORDS, DEPARTURES, GIFTERS, PEOPLE, VENUE_COORDS, WISHLIST } from "../shared/seed/gabrifila.ts";
import { internalMutation } from "./lib/builders.ts";
import { salvaCoppiaLegacy } from "./lib/km.ts";
import { chiave } from "./lib/refs.ts";

export const HANDLE_SEED = "gabrifila";
export const EXTRA_SEED = {
  creditoFooter: "Creato con il fondamentale supporto di Cami",
  linkTappi: "https://rwrd.io/ref_E19KPYV",
};

let cid = 0;

export async function seedGabrifila(ctx: MutationCtx) {
  const conteggi = { venues: 0, cities: 0, people: 0, gifters: 0, wishlist: 0, departures: 0, entries: 0, coppie: 0 };

  /* città e venue (catalogo condiviso) */
  for (const [name, [lng, lat]] of Object.entries(CITY_COORDS)) {
    if (!(await ctx.db.query("cities").withIndex("by_key", q => q.eq("key", chiave(name))).first())) {
      await ctx.db.insert("cities", { name, key: chiave(name), lng, lat });
      conteggi.cities++;
    }
  }
  const venueId = new Map<string, Id<"venues">>();
  for (const e of ALLDATA) {
    const k = `${e.venue}\u0000${e.city}`;
    if (venueId.has(k)) continue;
    let ven = await ctx.db.query("venues").withIndex("by_key", q => q.eq("nameKey", chiave(e.venue)).eq("cityKey", chiave(e.city))).first();
    if (!ven) {
      const coords = VENUE_COORDS[e.venue] ?? CITY_COORDS[e.city];
      if (!coords) throw new Error(`seed: coordinate mancanti per una venue (${e.venue})`);
      const id = await ctx.db.insert("venues", {
        name: e.venue, city: e.city, nameKey: chiave(e.venue), cityKey: chiave(e.city),
        lng: coords[0], lat: coords[1], source: VENUE_COORDS[e.venue] ? "seed" : "citta",
      });
      ven = (await ctx.db.get(id))!;
      conteggi.venues++;
    }
    venueId.set(k, ven._id);
  }

  /* profilo */
  let profile = await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", HANDLE_SEED)).first();
  if (!profile) {
    // gabrifila rinominato (update_profile): l'handle è un suo alias. Si
    // riusa quel profilo, mai un secondo `gabrifila` che oscurerebbe il 301
    const alias = await ctx.db.query("handleAliases").withIndex("by_handle", q => q.eq("handle", HANDLE_SEED)).first();
    if (alias) profile = await ctx.db.get(alias.profileId);
  }
  if (!profile) {
    const id = await ctx.db.insert("profiles", {
      handle: HANDLE_SEED, displayName: "Gabri", forma: "m", status: "active", onboardingStep: "fatto",
      theme: { preset: "predefinito" }, layout: { ordine: [], nascoste: [], titoli: {} }, extra: EXTRA_SEED, createdAt: Date.now(),
    });
    profile = (await ctx.db.get(id))!;
  }
  const pid = profile._id;

  /* persone */
  const persone = new Map<string, Id<"people">>();
  for (const name of PEOPLE) {
    let p = await ctx.db.query("people").withIndex("by_profile_name", q => q.eq("profileId", pid).eq("name", name)).first();
    if (!p) {
      p = (await ctx.db.get(await ctx.db.insert("people", { profileId: pid, name })))!;
      conteggi.people++;
    }
    persone.set(name, p._id);
  }

  /* "regalato da" */
  const regali = new Map<string, Id<"gifters">>();
  const esistenti = await ctx.db.query("gifters").withIndex("by_profile", q => q.eq("profileId", pid)).collect();
  for (const [key, g] of Object.entries(GIFTERS)) {
    let doc = esistenti.find(x => x.label === g.label);
    if (!doc) {
      doc = (await ctx.db.get(await ctx.db.insert("gifters", { profileId: pid, label: g.label, url: g.url, logo: { url: g.logo } })))!;
      conteggi.gifters++;
    }
    regali.set(key, doc._id);
  }

  /* wishlist */
  if (!(await ctx.db.query("wishlist").withIndex("by_profile_ordine", q => q.eq("profileId", pid)).first())) {
    for (const [i, artist] of WISHLIST.entries()) await ctx.db.insert("wishlist", { profileId: pid, artist, ordine: i });
    conteggi.wishlist = WISHLIST.length;
  }

  /* partenze legacy, senza indirizzo */
  const partenze = new Map<string, Id<"departures">>();
  const deps = await ctx.db.query("departures").withIndex("by_profile", q => q.eq("profileId", pid)).collect();
  for (const [key, name] of Object.entries(DEPARTURES)) {
    let d = deps.find(x => x.name === name);
    if (!d) {
      d = (await ctx.db.get(await ctx.db.insert("departures", { profileId: pid, name, hasAddress: false, legacy: true, createdAt: Date.now() })))!;
      conteggi.departures++;
    }
    partenze.set(key, d._id);
  }

  /* concerti: solo se il profilo non ne ha (il seed non duplica mai) */
  const giaPresenti = await ctx.db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", pid)).first();
  if (!giaPresenti) {
    for (const e of ALLDATA) {
      const comune = {
        profileId: pid,
        date: e.date,
        sortKey: sortKey(e),
        y: e.y,
        venueId: venueId.get(`${e.venue}\u0000${e.city}`)!,
        ...(e.cost !== undefined ? { cost: e.cost } : {}),
        ...(e.gift !== undefined ? { gift: e.gift } : {}),
        ...(e.giftFrom ? { giftFromId: regali.get(e.giftFrom)! } : {}),
        ...(e.accredito !== undefined ? { accredito: e.accredito } : {}),
        ...(e.from ? { departureId: partenze.get(e.from)! } : {}),
        ...(e.from && typeof e.km === "number" ? { km: e.km, kmSource: "legacy" as const } : {}),
        ...(e.from && typeof e.km !== "number" ? { kmPending: true } : {}),
        ...(e.comments ? { comments: e.comments } : {}),
        updatedAt: Date.now(),
      };
      const fatti = (c: { voto?: 1 | 2 | 3 | 4 | 5; vicinanza?: 1 | 2 | 3 | 4 | 5 | 6; canzoniNote?: 1 | 2 | 3 | 4 | 5 | "na" }) => ({
        ...(c.voto !== undefined ? { voto: c.voto } : {}),
        ...(c.vicinanza !== undefined ? { vicinanza: c.vicinanza } : {}),
        ...(c.canzoniNote !== undefined ? { canzoniNote: c.canzoniNote } : {}),
      });
      if (isFestival(e)) {
        await ctx.db.insert("entries", {
          ...comune, kind: "festival", name: e.name,
          concerts: e.concerts.map(c => ({ cid: `seed${cid++}`, artist: c.artist, with: c.with.map(n => persone.get(n)!), ...fatti(c), ...(c.date ? { date: c.date } : {}) })),
        });
      } else {
        await ctx.db.insert("entries", { ...comune, kind: "concert", artist: e.artist, with: e.with.map(n => persone.get(n)!), ...fatti(e) });
      }
      conteggi.entries++;
    }
  }

  /* coppie km legacy: il valore del concerto più recente di ogni coppia */
  const recente = new Map<string, { km: number; k: number; dep: Id<"departures">; ven: Id<"venues"> }>();
  for (const e of ALLDATA) {
    if (!e.from || typeof e.km !== "number") continue;
    const dep = partenze.get(e.from)!;
    const ven = venueId.get(`${e.venue}\u0000${e.city}`)!;
    const key = `${dep}|${ven}`;
    const k = sortKey(e);
    const cur = recente.get(key);
    if (!cur || k >= cur.k) recente.set(key, { km: e.km, k, dep, ven });
  }
  for (const c of recente.values()) {
    await salvaCoppiaLegacy(ctx, { profileId: pid, departureId: c.dep, venueId: c.ven, km: c.km });
  }
  conteggi.coppie = recente.size;
  return { profileId: pid, ...conteggi };
}

export const ensure = internalMutation({
  args: {},
  returns: v.object({
    profileId: v.id("profiles"), venues: v.number(), cities: v.number(), people: v.number(), gifters: v.number(),
    wishlist: v.number(), departures: v.number(), entries: v.number(), coppie: v.number(),
  }),
  handler: async ctx => await seedGabrifila(ctx),
});
