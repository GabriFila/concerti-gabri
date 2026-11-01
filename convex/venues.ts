/* ──────────────────────────────────────────────────────────────
   Le venue (DECISIONI «Venue per profilo»): ogni profilo ha le sue, con
   il nome che vuole il proprietario. Una venue nasce:
   - da un candidato di geo.searchVenue (POI OSM o, in mancanza, la
     città) o di geo.cercaIndirizzoVenue (l'indirizzo, per un posto che su
     OSM non c'è): `createFromCandidate`;
   - per nome e città da un concerto (lib/venueUtente.ts), con la
     posizione cercata dopo dal server.
   Si deduplica nel profilo per id OSM e per nome+città; le coordinate
   sono IMMUTABILI una volta scritte. Il flusso delle partenze non chiama
   e non alimenta mai questo modulo.

   Il candidato NON arriva dal chiamante: arriva il suo `ref` (riga della
   cache delle ricerche + indice) e da lì si rileggono coordinate, id OSM,
   città e tipo, che vengono solo da Nominatim. Il chiamante sceglie il
   nome, mai un indirizzo con il numero civico (la pagina è pubblica).
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { aggiungiVenueInput, type CandidatoVenue } from "../shared/schema/venue.ts";
import { CACHE_TTL } from "./geo.ts";
import { logActivity, nuovoBatch } from "./lib/activity.ts";
import { internalMutation, internalQuery, ownerMutation } from "./lib/builders.ts";
import { errore } from "./lib/errors.ts";
import { campiKm, haversineKm, STESSO_POSTO_KM } from "./lib/km.ts";
import { chiave, venuePerNome, venuesOf } from "./lib/refs.ts";
import { controllaNomeVenue } from "./lib/venueUtente.ts";

/** Entro questa distanza una venue omonima del profilo nella stessa città è la stessa (POI diversi dello stesso posto, seed). */
export const STESSO_POSTO_M = STESSO_POSTO_KM * 1000;

/** Distanza in metri; una venue ancora senza posizione (nata per nome) conta come lo stesso posto. */
const distanzaM = (v: { lng?: number; lat?: number }, c: { lng: number; lat: number }) =>
  v.lng === undefined || v.lat === undefined ? 0 : haversineKm([v.lng, v.lat], [c.lng, c.lat]) * 1000;

async function cittaNelCatalogo(ctx: MutationCtx, city: string, lng: number, lat: number) {
  const c = await ctx.db.query("cities").withIndex("by_key", q => q.eq("key", chiave(city))).first();
  if (!c) await ctx.db.insert("cities", { name: city, key: chiave(city), lng, lat });
}

/** Il candidato indicato da un `ref`, riletto dalla cache delle ricerche (o not_found). */
async function candidatoDa(ctx: MutationCtx, ref: string): Promise<CandidatoVenue> {
  const [riga, indice] = ref.split(":");
  const id = ctx.db.normalizeId("venueSearchCache", riga);
  const cache = id ? await ctx.db.get(id) : null;
  const c = cache && cache.fetchedAt >= Date.now() - CACHE_TTL ? cache.results[Number(indice)] : undefined;
  if (!c) throw errore("not_found", "candidato scaduto o inesistente: cerca di nuovo la venue con search_venue", { campo: "ref" });
  return c;
}

/** Concerti in attesa ricalcolati per lotto di posizione. */
const MAX_IN_ATTESA = 500;

type Posizione = { lng: number; lat: number; osm?: string; tipo: "poi" | "citta" | "indirizzo" };

/**
 * Scrive la posizione di una venue che non ce l'ha ancora (una volta sola) e
 * calcola i km dei concerti che la aspettavano (attività `sistema`).
 */
async function scriviPosizione(ctx: MutationCtx, venueId: Id<"venues">, p: Posizione) {
  const ven = await ctx.db.get(venueId);
  if (!ven || ven.lng !== undefined) return;
  await ctx.db.patch(venueId, {
    lng: p.lng,
    lat: p.lat,
    posizione: p.tipo === "citta" ? "citta" : "poi",
    ...(p.osm && p.tipo === "poi" ? { osm: p.osm } : {}),
  });
  if (p.tipo === "citta") await cittaNelCatalogo(ctx, ven.city, p.lng, p.lat);
  const batchId = nuovoBatch();
  for (const e of await ctx.db.query("entries").withIndex("by_venue", q => q.eq("venueId", venueId)).take(MAX_IN_ATTESA)) {
    if (!e.kmPending || !e.departureId) continue;
    const km = await campiKm(ctx, { profileId: e.profileId, departureId: e.departureId, venueId });
    if (km.kmPending) continue;
    await ctx.db.patch(e._id, { km: km.km, kmSource: km.kmSource, kmPending: undefined });
    const profile = await ctx.db.get(e.profileId);
    if (profile) {
      await logActivity(ctx, { profile, actor: { via: "sistema", label: "Sistema" } }, {
        op: "update", table: "entries", docId: e._id, batchId, summary: `km calcolati (${ven.name})`,
      });
    }
  }
}

const tipoDi = (c: CandidatoVenue): Posizione["tipo"] => (c.featureType === "city" ? "citta" : c.featureType === "indirizzo" ? "indirizzo" : "poi");

export const createFromCandidate = ownerMutation({
  catalogOp: "add_venue",
  input: aggiungiVenueInput,
  handler: async (ctx, owner, { ref, name }) => {
    const profileId = owner.profile._id;
    const candidate = await candidatoDa(ctx, ref);
    // l'id OSM identifica solo un POI: un ripiego sulla città porta l'id del
    // comune, un indirizzo quello di una casa o di una via
    const osm = candidate.featureType === "poi" ? candidate.osm : undefined;
    if (name !== undefined) controllaNomeVenue(name.trim(), "name");
    if (osm) {
      const perOsm = await ctx.db.query("venues").withIndex("by_profile_osm", q => q.eq("profileId", profileId).eq("osm", osm)).first();
      if (perOsm) return { id: perOsm._id as string, esistente: true, name: perOsm.name, city: perOsm.city };
    }
    if (candidate.featureType === "indirizzo" && !name) {
      throw errore("input_non_valido", "name: per una venue trovata dall'indirizzo serve il nome del posto", { campo: "name" });
    }
    const nome = (name ?? candidate.name).trim();
    if (name === undefined) controllaNomeVenue(nome, "name");
    const perNome = await venuePerNome(ctx, profileId, nome, candidate.city);
    if (perNome) {
      // nata per nome e ancora senza posizione: la prende da qui
      if (perNome.lng === undefined) {
        await scriviPosizione(ctx, perNome._id, { lng: candidate.lng, lat: candidate.lat, osm, tipo: tipoDi(candidate) });
        return { id: perNome._id as string, esistente: true, name: perNome.name, city: perNome.city };
      }
      if (distanzaM(perNome, candidate) <= STESSO_POSTO_M) return { id: perNome._id as string, esistente: true, name: perNome.name, city: perNome.city };
      throw errore(
        "conflitto",
        "hai già una venue con questo nome in questa città, ma in un altro punto: se è la stessa sceglila tra le tue venue, se è un'altra dalle un nome diverso, es. «Teatro Verdi (Sestri)»",
        { campo: "name" },
      );
    }
    const id = await ctx.db.insert("venues", {
      profileId,
      name: nome,
      city: candidate.city,
      nameKey: chiave(nome),
      cityKey: chiave(candidate.city),
      lng: candidate.lng,
      lat: candidate.lat,
      osm,
      source: candidate.featureType === "poi" ? "osm" : candidate.featureType === "city" ? "citta" : "indirizzo",
      createdBy: profileId,
    });
    if (candidate.featureType === "city") await cittaNelCatalogo(ctx, candidate.city, candidate.lng, candidate.lat);
    // la creazione si registra ma non si annulla (niente istantanee); Annulla di un concerto lascia la venue
    await logActivity(ctx, owner, { op: "create", table: "venues", docId: id, summary: `venue aggiunta: ${nome} (${candidate.city})` });
    return { id: id as string, esistente: false, name: nome, city: candidate.city };
  },
});

/** Nome e città di una venue ancora da posizionare (null se ha già la posizione o non c'è più). */
export const daPosizionare = internalQuery({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const ven = await ctx.db.get(venueId);
    return ven && ven.lng === undefined && ven.posizione === "attesa" ? { name: ven.name, city: ven.city } : null;
  },
});


/**
 * La posizione trovata (o no) per una venue nata per nome: si scrive una
 * volta sola; poi i km dei concerti che la aspettavano (attività `sistema`).
 */
export const impostaPosizione = internalMutation({
  args: {
    venueId: v.id("venues"),
    trovata: v.optional(v.object({ lng: v.number(), lat: v.number(), osm: v.optional(v.string()), tipo: v.union(v.literal("poi"), v.literal("citta")) })),
  },
  handler: async (ctx, { venueId, trovata }) => {
    const ven = await ctx.db.get(venueId);
    if (!ven || ven.lng !== undefined) return null;
    if (!trovata) {
      await ctx.db.patch(venueId, { posizione: "non_trovata" });
      return null;
    }
    await scriviPosizione(ctx, venueId, trovata);
    return null;
  },
});

/** Ricerca tra le venue di un profilo per geo.searchVenue (nome o città che contengono la ricerca). */
export const cercaNelCatalogo = internalQuery({
  args: { profileId: v.id("profiles"), query: v.string() },
  handler: async (ctx, { profileId, query }) => {
    const parole = chiave(query).split(" ").filter(w => w.length > 2);
    return (await venuesOf(ctx, profileId))
      .filter(x => parole.length > 0 && parole.every(w => `${x.nameKey} ${x.cityKey}`.includes(w)))
      .slice(0, 10)
      .map(x => ({ id: x._id as string, name: x.name, city: x.city }));
  },
});
