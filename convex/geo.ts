/* ──────────────────────────────────────────────────────────────
   Geocoding con OpenStreetMap Nominatim, solo lato server (DECISIONI,
   PIANO §1.23, §5.5).

   - Una coda globale col rate limiter Convex: 1 richiesta al secondo
     (`nominatimGlobal`, con `reserve`), più i limiti per profilo e per
     attore (`geocodeProfile`, `geocodeActor`).
   - User-Agent che identifica l'app; `NOMINATIM_URL` intercambiabile.
   - Venue: `layer=poi`, si scartano house/building/road/residential; senza
     POI si ripiega sulla città (`featureType=city`), mai su una via. La
     cache condivisa vale SOLO per le venue: chiave = SHA-256 della ricerca
     normalizzata, mai il testo in chiaro.
   - Partenze: niente cache, niente log; i candidati vanno nella tabella
     privata via internal.departures.saveDraft e al browser arrivano solo
     indice ed etichetta (solo dashboard). Le coordinate non escono mai.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { geocodificaPartenzaInput } from "../shared/schema/departure.ts";
import { cercaVenueInput, rifCandidato, type CandidatoProposto, type CandidatoVenue } from "../shared/schema/venue.ts";
import { internalMutation, internalQuery, ownerAction } from "./lib/builders.ts";
import { errore } from "./lib/errors.ts";
import type { Owner } from "./lib/owner.ts";
import { chiave } from "./lib/refs.ts";
import { rateLimiter } from "./rateLimits.ts";

export const USER_AGENT = "concerti-gabri/1.0 (+https://concerti.gabrifila.me)";
export const NOMINATIM_DEFAULT = "https://nominatim.openstreetmap.org";
export const ATTRIBUZIONE = "© OpenStreetMap contributors";
export const CACHE_TTL = 90 * 24 * 3600_000;

/** Tipi OSM che non sono mai una venue (indirizzi, edifici, strade). */
export const NON_POI = new Set(["house", "building", "road", "residential", "highway", "street", "postcode"]);

export interface RisultatoNominatim {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  osm_type?: string;
  osm_id?: number;
  category?: string;
  class?: string;
  type?: string;
  addresstype?: string;
  address?: Record<string, string>;
}

/** La coda globale: aspetta il proprio turno (1/s) oppure geocoder_busy. */
async function turnoNominatim(ctx: ActionCtx) {
  const r = await rateLimiter.limit(ctx, "nominatimGlobal", { reserve: true });
  if (!r.ok) throw errore("geocoder_busy", "il servizio di ricerca è occupato: riprova tra poco");
  if (r.retryAfter) await new Promise(res => setTimeout(res, r.retryAfter));
}

/** Una richiesta a Nominatim /search (jsonv2). Nessun log della query. */
export async function nominatim(ctx: ActionCtx, params: Record<string, string>, opts: { base?: string } = {}): Promise<RisultatoNominatim[]> {
  await turnoNominatim(ctx);
  const base = opts.base || process.env.NOMINATIM_URL || NOMINATIM_DEFAULT;
  const url = new URL("/search", base);
  const all = { format: "jsonv2", limit: "8", addressdetails: "1", "accept-language": "it", ...params };
  for (const [k, val] of Object.entries(all)) url.searchParams.set(k, val);
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  } catch {
    throw errore("geocoder_unavailable", "il servizio di ricerca non risponde: riprova");
  }
  if (!res.ok) throw errore("geocoder_unavailable", "il servizio di ricerca non risponde: riprova", { status: res.status });
  const body = await res.json().catch(() => null);
  return Array.isArray(body) ? (body as RisultatoNominatim[]) : [];
}

export const isPoi = (r: RisultatoNominatim) =>
  !NON_POI.has(r.addresstype ?? "") && !NON_POI.has(r.class ?? r.category ?? "") && !NON_POI.has(r.type ?? "");

const cittaDi = (r: RisultatoNominatim) =>
  r.address?.city ?? r.address?.town ?? r.address?.village ?? r.address?.municipality ?? r.address?.county ?? "";

const osmId = (r: RisultatoNominatim) => (r.osm_type && r.osm_id ? `${r.osm_type[0].toUpperCase()}${r.osm_id}` : undefined);

export function candidatoPoi(r: RisultatoNominatim): CandidatoVenue | null {
  const city = cittaDi(r);
  const lng = Number(r.lon);
  const lat = Number(r.lat);
  if (!city || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { osm: osmId(r), name: (r.name || r.display_name.split(",")[0]).slice(0, 120), city: city.slice(0, 80), lng, lat, featureType: "poi", label: r.display_name.slice(0, 300) };
}

export function candidatoCitta(r: RisultatoNominatim): CandidatoVenue | null {
  const lng = Number(r.lon);
  const lat = Number(r.lat);
  const city = (r.name || cittaDi(r)).slice(0, 80);
  if (!city || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { osm: osmId(r), name: city, city, lng, lat, featureType: "city", label: r.display_name.slice(0, 300) };
}

/** Chiave della cache: SHA-256 (hex) della ricerca normalizzata. */
export async function chiaveCache(query: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(chiave(query)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function limitiGeocoding(ctx: ActionCtx, owner: Owner) {
  const p = await rateLimiter.limit(ctx, "geocodeProfile", { key: owner.profile._id });
  if (!p.ok) throw errore("limite_superato", "troppe ricerche in un'ora: riprova più tardi", { retryAfter: Math.ceil(p.retryAfter / 1000) });
  const a = await rateLimiter.limit(ctx, "geocodeActor", { key: `${owner.actor.via}:${owner.actor.userId}:${owner.actor.clientId ?? owner.actor.keyId ?? ""}` });
  if (!a.ok) throw errore("limite_superato", "troppe ricerche in un'ora: riprova più tardi", { retryAfter: Math.ceil(a.retryAfter / 1000) });
}

const caricaProfilo = async (ctx: ActionCtx, userId: string): Promise<Doc<"profiles"> | null> =>
  await ctx.runQuery(internal.profiles.byAuthUser, { authUserId: userId });

/** Ricerca di venue: cache hashata, poi Nominatim (POI o città). `id` = la riga di cache dei risultati. */
export async function cercaVenue(ctx: ActionCtx, query: string): Promise<{ id: string; results: CandidatoVenue[] }> {
  const keyHash = await chiaveCache(query);
  const cached: { id: string; results: CandidatoVenue[] } | null = await ctx.runQuery(internal.geo.cacheGet, { keyHash });
  if (cached) return cached;
  const poi = (await nominatim(ctx, { q: query, layer: "poi" })).filter(isPoi).map(candidatoPoi).filter((c): c is CandidatoVenue => c !== null);
  let results = poi;
  if (!results.length) {
    results = (await nominatim(ctx, { q: query, featureType: "city", limit: "3" })).map(candidatoCitta).filter((c): c is CandidatoVenue => c !== null);
  }
  const id: string = await ctx.runMutation(internal.geo.cachePut, { keyHash, results });
  return { id, results };
}

/**
 * I candidati per il chiamante, ciascuno col suo `ref` (riga di cache +
 * indice): add_venue accetta solo quello e rilegge tutto dalla cache.
 */
export const searchVenue = ownerAction({
  catalogOp: "search_venue",
  input: cercaVenueInput,
  loadProfile: caricaProfilo,
  handler: async (ctx, owner, { query }): Promise<{ catalogo: { id: string; name: string; city: string }[]; candidati: CandidatoProposto[]; attribuzione: string }> => {
    const catalogo: { id: string; name: string; city: string }[] = await ctx.runQuery(internal.venues.cercaNelCatalogo, { query });
    await limitiGeocoding(ctx, owner);
    const { id, results } = await cercaVenue(ctx, query);
    return { catalogo, candidati: results.map((c, i) => ({ ...c, ref: rifCandidato(id, i) })), attribuzione: ATTRIBUZIONE };
  },
});

export const geocodeDeparture = ownerAction({
  dashboardOnly: "indirizzi (SPEC)",
  input: geocodificaPartenzaInput,
  loadProfile: caricaProfilo,
  handler: async (ctx, owner, { departureId, address }): Promise<{ candidati: { indice: number; etichetta: string }[]; attribuzione: string }> => {
    const d: { id: Id<"departures">; name: string } | null = await ctx.runQuery(internal.departures.ownedDeparture, { profileId: owner.profile._id, departureId });
    if (!d) throw errore("not_found", "non trovato");
    await limitiGeocoding(ctx, owner);
    // niente cache e niente log: l'indirizzo non lascia questa action
    const risultati = await nominatim(ctx, { q: address, limit: "5" });
    const candidates = risultati
      .map(r => ({ label: r.display_name.slice(0, 300), lng: Number(r.lon), lat: Number(r.lat) }))
      .filter(c => Number.isFinite(c.lng) && Number.isFinite(c.lat));
    await ctx.runMutation(internal.departures.saveDraft, { profileId: owner.profile._id, departureId: d.id, candidates });
    return { candidati: candidates.map((c, indice) => ({ indice, etichetta: c.label })), attribuzione: ATTRIBUZIONE };
  },
});

const risultatoV = v.object({
  osm: v.optional(v.string()),
  name: v.string(),
  city: v.string(),
  lng: v.number(),
  lat: v.number(),
  featureType: v.union(v.literal("poi"), v.literal("city")),
  label: v.string(),
});

export const cacheGet = internalQuery({
  args: { keyHash: v.string() },
  handler: async (ctx, { keyHash }) => {
    const c = await ctx.db.query("venueSearchCache").withIndex("by_keyHash", q => q.eq("keyHash", keyHash)).first();
    if (!c || c.fetchedAt < Date.now() - CACHE_TTL) return null;
    return { id: c._id as string, results: c.results.map(r => ({ ...r })) };
  },
});

export const cachePut = internalMutation({
  args: { keyHash: v.string(), results: v.array(risultatoV) },
  handler: async (ctx, { keyHash, results }) => {
    for (const old of await ctx.db.query("venueSearchCache").withIndex("by_keyHash", q => q.eq("keyHash", keyHash)).collect()) await ctx.db.delete(old._id);
    return (await ctx.db.insert("venueSearchCache", { keyHash, results, fetchedAt: Date.now() })) as string;
  },
});
