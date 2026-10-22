/* ──────────────────────────────────────────────────────────────
   Strumenti di sviluppo e test (PIANO §5.2): tutte INTERNE (solo
   `convex run` con la chiave admin del deployment) e tutte con la
   guardia: rifiutano sul deployment di produzione e senza AUTH_DEV_OTP=1.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { entryInput } from "../shared/schema/entry.ts";
import { cancellaSegreti, ricalcola, scriviSegreto } from "./departures.ts";
import { NOMINATIM_DEFAULT, nominatim, USER_AGENT } from "./geo.ts";
import { logActivity } from "./lib/activity.ts";
import { internalAction, internalMutation, internalQuery } from "./lib/builders.ts";
import { parseInput } from "./lib/errors.ts";
import { campiKm, cancellaCoppieDelProfilo } from "./lib/km.ts";
import { caricaRefs, campiDaInput } from "./lib/refs.ts";

/** Il deployment di produzione (mai devtools né OTP di sviluppo lì). */
export const PROD_DEPLOYMENT = "brave-chickadee-534";

/** La guardia: lancia se siamo in produzione o se manca AUTH_DEV_OTP=1. */
export function guardiaSviluppo(env: Record<string, string | undefined> = process.env) {
  if ((env.CONVEX_CLOUD_URL ?? "").includes(PROD_DEPLOYMENT)) throw new Error("devtools: rifiutato sul deployment di produzione");
  if (env.AUTH_DEV_OTP !== "1") throw new Error("devtools: serve AUTH_DEV_OTP=1 sul deployment");
}

async function profiloPerHandle(ctx: MutationCtx, handle: string) {
  const p = await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", handle)).first();
  if (!p) throw new Error("devtools: profilo inesistente");
  return p;
}

export const whoami = internalQuery({
  args: {},
  returns: v.object({ cloudUrl: v.string(), siteUrl: v.string() }),
  handler: async () => {
    guardiaSviluppo();
    return { cloudUrl: process.env.CONVEX_CLOUD_URL ?? "", siteUrl: process.env.CONVEX_SITE_URL ?? "" };
  },
});

/** Aggiunge un concerto (forma esterna) a un profilo, come attività `sistema`. */
export const addEntry = internalMutation({
  args: { handle: v.string(), entry: v.any() },
  handler: async (ctx, { handle, entry }) => {
    guardiaSviluppo();
    const profile = await profiloPerHandle(ctx, handle);
    const input = parseInput(entryInput, entry);
    const campi = await campiDaInput(ctx, await caricaRefs(ctx, profile._id), input);
    const km = await campiKm(ctx, { profileId: profile._id, departureId: campi.departureId, venueId: campi.venueId });
    const doc = Object.fromEntries(Object.entries({ ...campi, ...km, profileId: profile._id, updatedAt: Date.now() }).filter(([, x]) => x !== undefined));
    const id = await ctx.db.insert("entries", doc as never);
    await logActivity(ctx, { profile, actor: { via: "sistema", label: "devtools" } }, { op: "create", table: "entries", docId: id, summary: "aggiunto da devtools" });
    return id;
  },
});

/** Toglie un concerto aggiunto dai test (e2e/live.spec.ts) con le sue righe di registro: è pulizia, non un'attività. */
export const removeEntry = internalMutation({
  args: { handle: v.string(), entryId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    guardiaSviluppo();
    const profile = await profiloPerHandle(ctx, a.handle);
    const id = ctx.db.normalizeId("entries", a.entryId);
    const e = id ? await ctx.db.get(id) : null;
    if (!id || !e || e.profileId !== profile._id) return false;
    await ctx.db.delete(id);
    const righe = await ctx.db.query("activity").withIndex("by_profile_at", q => q.eq("profileId", profile._id)).collect();
    for (const r of righe) if (r.docId === a.entryId) await ctx.db.delete(r._id);
    return true;
  },
});

/** Un profilo di prova `active` legato a un utente (e2e senza Better Auth). */
export const creaProfiloDiProva = internalMutation({
  args: { handle: v.string(), authUserId: v.string(), displayName: v.optional(v.string()) },
  handler: async (ctx, a) => {
    guardiaSviluppo();
    const esiste = await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", a.handle)).first();
    if (esiste) return esiste._id;
    return await ctx.db.insert("profiles", {
      handle: a.handle, authUserId: a.authUserId, displayName: a.displayName ?? a.handle, forma: "n",
      status: "active", onboardingStep: "fatto", theme: { preset: "predefinito" },
      layout: { ordine: [], nascoste: [], titoli: {} }, extra: {}, createdAt: Date.now(),
    });
  },
});

/** Salva un indirizzo di prova (il canarino) su una partenza, senza Nominatim. */
export const setDepartureForTest = internalMutation({
  args: { handle: v.string(), departure: v.string(), address: v.string(), lng: v.number(), lat: v.number() },
  handler: async (ctx, a) => {
    guardiaSviluppo();
    const profile = await profiloPerHandle(ctx, a.handle);
    const d = (await ctx.db.query("departures").withIndex("by_profile", q => q.eq("profileId", profile._id)).collect()).find(x => x.name === a.departure);
    if (!d) throw new Error("devtools: partenza inesistente");
    const correzione = d.hasAddress;
    await scriviSegreto(ctx, { profileId: profile._id, departureId: d._id, address: a.address, lng: a.lng, lat: a.lat });
    await ctx.db.patch(d._id, { hasAddress: true });
    await ricalcola(ctx, profile._id, d._id, correzione);
    return null;
  },
});

const TABELLE_APP = [
  "entries", "people", "gifters", "wishlist", "activity", "chatThreads", "handleAliases", "devOtpOutbox", "venueSearchCache",
] as const;

async function svuotaProfilo(ctx: MutationCtx, profileId: Id<"profiles">) {
  const deps = await ctx.db.query("departures").withIndex("by_profile", q => q.eq("profileId", profileId)).collect();
  await cancellaCoppieDelProfilo(ctx, deps.map(d => d._id));
  for (const d of deps) {
    await cancellaSegreti(ctx, d._id);
    await ctx.db.delete(d._id);
  }
}

/** Svuota le tabelle dell'app (gli utenti Better Auth restano): poi seed:ensure. */
export const reset = internalMutation({
  args: {},
  handler: async ctx => {
    guardiaSviluppo();
    for (const p of await ctx.db.query("profiles").collect()) await svuotaProfilo(ctx, p._id);
    for (const t of TABELLE_APP) for (const d of await ctx.db.query(t).collect()) await ctx.db.delete(d._id);
    for (const t of ["profiles", "venues", "cities"] as const) for (const d of await ctx.db.query(t).collect()) await ctx.db.delete(d._id);
    return null;
  },
});

/** Cancella i profili di prova `e2e-*` e i loro dati. */
export const cleanupE2E = internalMutation({
  args: {},
  handler: async ctx => {
    guardiaSviluppo();
    let n = 0;
    for (const p of await ctx.db.query("profiles").collect()) {
      if (!p.handle?.startsWith("e2e-")) continue;
      await svuotaProfilo(ctx, p._id);
      for (const t of ["entries", "people", "gifters", "wishlist", "activity", "chatThreads"] as const) {
        for (const d of await ctx.db.query(t).collect()) if ((d as { profileId?: Id<"profiles"> }).profileId === p._id) await ctx.db.delete(d._id);
      }
      for (const a of await ctx.db.query("handleAliases").withIndex("by_profile", q => q.eq("profileId", p._id)).collect()) await ctx.db.delete(a._id);
      await ctx.db.delete(p._id);
      n++;
    }
    return n;
  },
});

/** Spike del traguardo 2: una ricerca vera a Nominatim dal runtime predefinito (User-Agent, coda con setTimeout). */
export const nominatimProbe = internalAction({
  args: { query: v.string(), reale: v.optional(v.boolean()) },
  handler: async (ctx, { query, reale }) => {
    guardiaSviluppo();
    const base = reale ? NOMINATIM_DEFAULT : undefined;
    const t0 = Date.now();
    const r = await nominatim(ctx, { q: query, layer: "poi", limit: "3" }, { base });
    const t1 = Date.now();
    // seconda richiesta subito dopo: deve aspettare il turno (1/s) con setTimeout
    await nominatim(ctx, { q: query, layer: "poi", limit: "1" }, { base });
    return {
      userAgent: USER_AGENT,
      risultati: r.length,
      primo: r[0] ? { name: r[0].name ?? null, tipo: `${r[0].category ?? r[0].class}/${r[0].type}`, osm: `${r[0].osm_type}/${r[0].osm_id}` } : null,
      msPrima: t1 - t0,
      msSeconda: Date.now() - t1,
    };
  },
});

/* Traguardo 4 (e2e/forme.spec.ts, e2e/profilo-vuoto.spec.ts): un profilo di
   prova `active` con forma, nome, layout, tema ed extra scelti dal test, più
   le persone e le partenze (senza indirizzo) che i suoi concerti nominano.
   Se il profilo esiste già (anche creato dal login, corsia 3) lo aggiorna:
   le persone e le partenze mancanti si aggiungono, quelle presenti restano.
   Con `concerti` (forma esterna, come addEntry) i concerti del profilo si
   sostituiscono in blocco: una sola chiamata per profilo, anche sotto carico.
   `alias` (e2e/redirect.spec.ts): vecchi handle `e2e-*` che portano qui
   con un 301, come dopo un cambio di handle. */
export const preparaProfiloDiProva = internalMutation({
  args: {
    handle: v.string(),
    displayName: v.optional(v.string()),
    forma: v.optional(v.union(v.literal("f"), v.literal("m"), v.literal("n"))),
    layout: v.optional(v.object({ ordine: v.array(v.string()), nascoste: v.array(v.string()), titoli: v.record(v.string(), v.string()) })),
    theme: v.optional(v.object({ preset: v.string(), accent: v.optional(v.string()), fontTitoli: v.optional(v.union(v.literal("fraunces"), v.literal("inter"), v.literal("space-grotesk"), v.literal("playfair-display"))), raggi: v.optional(v.string()), densita: v.optional(v.string()) })),
    extra: v.optional(v.object({ creditoFooter: v.optional(v.string()), linkTappi: v.optional(v.string()) })),
    persone: v.optional(v.array(v.string())),
    partenze: v.optional(v.array(v.string())),
    concerti: v.optional(v.array(v.any())),
    alias: v.optional(v.array(v.string())),
  },
  returns: v.id("profiles"),
  handler: async (ctx, a) => {
    guardiaSviluppo();
    if (![a.handle, ...(a.alias ?? [])].every(h => h.startsWith("e2e-"))) throw new Error("devtools: solo profili di prova e2e-*");
    const campi = Object.fromEntries(Object.entries({
      displayName: a.displayName, forma: a.forma, layout: a.layout, theme: a.theme, extra: a.extra,
    }).filter(([, x]) => x !== undefined));
    const esiste = await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", a.handle)).first();
    const profileId = esiste?._id ?? await ctx.db.insert("profiles", {
      handle: a.handle, authUserId: `e2e:${a.handle}`, displayName: a.handle, forma: "n",
      status: "active", onboardingStep: "fatto", theme: { preset: "predefinito" },
      layout: { ordine: [], nascoste: [], titoli: {} }, extra: {}, createdAt: Date.now(),
    });
    if (Object.keys(campi).length) await ctx.db.patch(profileId, campi);
    const persone = new Set((await ctx.db.query("people").withIndex("by_profile_name", q => q.eq("profileId", profileId)).collect()).map(p => p.name));
    for (const name of a.persone ?? []) if (!persone.has(name)) await ctx.db.insert("people", { profileId, name });
    const partenze = new Set((await ctx.db.query("departures").withIndex("by_profile", q => q.eq("profileId", profileId)).collect()).map(d => d.name));
    for (const name of a.partenze ?? []) {
      if (!partenze.has(name)) await ctx.db.insert("departures", { profileId, name, hasAddress: false, legacy: false, createdAt: Date.now() });
    }
    for (const handle of a.alias ?? []) {
      for (const x of await ctx.db.query("handleAliases").withIndex("by_handle", q => q.eq("handle", handle)).collect()) await ctx.db.delete(x._id);
      await ctx.db.insert("handleAliases", { handle, profileId, createdAt: Date.now() });
    }
    if (a.concerti) {
      for (const d of await ctx.db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", profileId)).collect()) await ctx.db.delete(d._id);
      for (const d of await ctx.db.query("activity").withIndex("by_profile_at", q => q.eq("profileId", profileId)).collect()) await ctx.db.delete(d._id);
      const refs = await caricaRefs(ctx, profileId);
      for (const entry of a.concerti) {
        const campi = await campiDaInput(ctx, refs, parseInput(entryInput, entry));
        const km = await campiKm(ctx, { profileId, departureId: campi.departureId, venueId: campi.venueId });
        const doc = Object.fromEntries(Object.entries({ ...campi, ...km, profileId, updatedAt: Date.now() }).filter(([, x]) => x !== undefined));
        await ctx.db.insert("entries", doc as never);
      }
    }
    return profileId;
  },
});
