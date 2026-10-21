/* ──────────────────────────────────────────────────────────────
   Lo schema Convex: TUTTE le tabelle di PIANO §5.1. I validatori sono
   scritti a mano per avere i tipi (Doc<…>), ma la fonte è Zod
   (shared/schema/tables.ts): shared/schema/schema.test.ts verifica che
   zodToConvex(tabelle Zod) dia esattamente questi validatori.
   Da qui in poi solo cambi additivi (PIANO §1.17).
   ────────────────────────────────────────────────────────────── */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const voto = v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4), v.literal(5));
const vicinanza = v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4), v.literal(5), v.literal(6));
const canzoniNote = v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4), v.literal(5), v.literal("na"));
const costo = v.union(v.number(), v.literal("na"));

export const fields = {
  profiles: {
    authUserId: v.optional(v.string()),
    handle: v.optional(v.string()),
    displayName: v.optional(v.string()),
    forma: v.optional(v.union(v.literal("f"), v.literal("m"), v.literal("n"))),
    status: v.union(v.literal("onboarding"), v.literal("active")),
    onboardingStep: v.union(v.literal("partenze"), v.literal("agente"), v.literal("regali"), v.literal("fatto")),
    theme: v.object({
      preset: v.string(),
      accent: v.optional(v.string()),
      fontTitoli: v.optional(v.union(v.literal("fraunces"), v.literal("inter"), v.literal("space-grotesk"), v.literal("playfair-display"))),
      raggi: v.optional(v.string()),
      densita: v.optional(v.string()),
    }),
    layout: v.object({
      ordine: v.array(v.string()),
      nascoste: v.array(v.string()),
      titoli: v.record(v.string(), v.string()),
    }),
    extra: v.object({
      creditoFooter: v.optional(v.string()),
      linkTappi: v.optional(v.string()),
    }),
    createdAt: v.number(),
  },
  handleAliases: {
    handle: v.string(),
    profileId: v.id("profiles"),
    createdAt: v.number(),
  },
  people: {
    profileId: v.id("profiles"),
    name: v.string(),
  },
  gifters: {
    profileId: v.id("profiles"),
    label: v.string(),
    url: v.optional(v.string()),
    logo: v.optional(v.union(v.object({ storageId: v.id("_storage") }), v.object({ url: v.string() }))),
  },
  wishlist: {
    profileId: v.id("profiles"),
    artist: v.string(),
    ordine: v.number(),
  },
  departures: {
    profileId: v.id("profiles"),
    name: v.string(),
    hasAddress: v.boolean(),
    legacy: v.boolean(),
    lastCorrectionAt: v.optional(v.number()),
    createdAt: v.number(),
  },
  departureSecrets: {
    departureId: v.id("departures"),
    profileId: v.id("profiles"),
    address: v.string(),
    lng: v.number(),
    lat: v.number(),
    geocodedAt: v.number(),
  },
  geocodeDrafts: {
    profileId: v.id("profiles"),
    departureId: v.id("departures"),
    candidates: v.array(v.object({ label: v.string(), lng: v.number(), lat: v.number() })),
    expiresAt: v.number(),
  },
  kmPairs: {
    profileId: v.id("profiles"),
    departureId: v.id("departures"),
    venueId: v.id("venues"),
    km: v.number(),
    source: v.union(v.literal("legacy"), v.literal("calcolato")),
    drawnAt: v.number(),
  },
  venues: {
    name: v.string(),
    city: v.string(),
    nameKey: v.string(),
    cityKey: v.string(),
    lng: v.number(),
    lat: v.number(),
    osm: v.optional(v.string()),
    source: v.union(v.literal("seed"), v.literal("osm"), v.literal("citta")),
    createdBy: v.optional(v.id("profiles")),
  },
  cities: {
    name: v.string(),
    key: v.string(),
    lng: v.number(),
    lat: v.number(),
  },
  venueSearchCache: {
    keyHash: v.string(),
    results: v.array(
      v.object({
        osm: v.optional(v.string()),
        name: v.string(),
        city: v.string(),
        lng: v.number(),
        lat: v.number(),
        featureType: v.union(v.literal("poi"), v.literal("city")),
        label: v.string(),
      }),
    ),
    fetchedAt: v.number(),
  },
  entries: {
    profileId: v.id("profiles"),
    kind: v.union(v.literal("concert"), v.literal("festival")),
    date: v.string(),
    sortKey: v.number(),
    y: v.number(),
    venueId: v.id("venues"),
    cost: v.optional(costo),
    gift: v.optional(v.boolean()),
    giftFromId: v.optional(v.id("gifters")),
    accredito: v.optional(v.boolean()),
    departureId: v.optional(v.id("departures")),
    km: v.optional(v.number()),
    kmSource: v.optional(v.union(v.literal("legacy"), v.literal("calcolato"))),
    kmPending: v.optional(v.boolean()),
    comments: v.optional(v.string()),
    updatedAt: v.number(),
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
  },
  activity: {
    profileId: v.id("profiles"),
    at: v.number(),
    actor: v.object({
      via: v.union(v.literal("dashboard"), v.literal("oracolo"), v.literal("mcp"), v.literal("apikey"), v.literal("sistema")),
      label: v.string(),
    }),
    op: v.string(),
    table: v.string(),
    docId: v.string(),
    batchId: v.optional(v.string()),
    summary: v.string(),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    undoneBy: v.optional(v.id("activity")),
    undoOf: v.optional(v.id("activity")),
  },
  chatThreads: {
    profileId: v.id("profiles"),
    threadId: v.string(),
    visibility: v.union(v.literal("pubblica"), v.literal("proprietario")),
    title: v.string(),
    author: v.optional(v.string()),
    writeKeyHash: v.optional(v.string()),
    ipHmac: v.optional(v.string()),
    messages: v.array(v.any()),
    updatedAt: v.number(),
    expiresAt: v.number(),
  },
  devOtpOutbox: {
    email: v.string(),
    otp: v.string(),
    type: v.string(),
    createdAt: v.number(),
  },
};

export default defineSchema({
  profiles: defineTable(fields.profiles).index("by_handle", ["handle"]).index("by_authUserId", ["authUserId"]),
  handleAliases: defineTable(fields.handleAliases).index("by_handle", ["handle"]).index("by_profile", ["profileId"]),
  people: defineTable(fields.people).index("by_profile_name", ["profileId", "name"]),
  gifters: defineTable(fields.gifters).index("by_profile", ["profileId"]),
  wishlist: defineTable(fields.wishlist).index("by_profile_ordine", ["profileId", "ordine"]),
  departures: defineTable(fields.departures).index("by_profile", ["profileId"]),
  departureSecrets: defineTable(fields.departureSecrets).index("by_departure", ["departureId"]),
  geocodeDrafts: defineTable(fields.geocodeDrafts).index("by_departure", ["departureId"]).index("by_expires", ["expiresAt"]),
  kmPairs: defineTable(fields.kmPairs).index("by_pair", ["departureId", "venueId"]).index("by_departure", ["departureId"]),
  venues: defineTable(fields.venues).index("by_key", ["nameKey", "cityKey"]).index("by_osm", ["osm"]),
  cities: defineTable(fields.cities).index("by_key", ["key"]),
  venueSearchCache: defineTable(fields.venueSearchCache).index("by_keyHash", ["keyHash"]),
  entries: defineTable(fields.entries)
    .index("by_profile_sortKey", ["profileId", "sortKey"])
    .index("by_profile_departure", ["profileId", "departureId"])
    .index("by_profile_venue", ["profileId", "venueId"]),
  activity: defineTable(fields.activity).index("by_profile_at", ["profileId", "at"]).index("by_batch", ["batchId"]),
  chatThreads: defineTable(fields.chatThreads)
    .index("by_threadId", ["threadId"])
    .index("by_profile_visibility_updatedAt", ["profileId", "visibility", "updatedAt"])
    .index("by_expires", ["expiresAt"]),
  devOtpOutbox: defineTable(fields.devOtpOutbox).index("by_email", ["email"]),
});
