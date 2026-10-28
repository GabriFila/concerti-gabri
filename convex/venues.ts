/* ──────────────────────────────────────────────────────────────
   Catalogo venue condiviso (PIANO §5.5.4). Una venue nasce solo da un
   candidato di geo.searchVenue (POI OSM o, in mancanza, la città); si
   deduplica per id OSM e per nome+città; le coordinate sono IMMUTABILI:
   non esiste un modo per modificarle. Il flusso delle partenze non chiama e
   non alimenta mai questo modulo.

   Il candidato NON arriva dal chiamante: arriva il suo `ref` (riga della
   cache delle ricerche + indice, emesso da geo.searchVenue) e da lì si
   rileggono coordinate, id OSM, città e tipo, che vengono solo da
   Nominatim. Il chiamante può scegliere al massimo il nome, e nemmeno
   quello per un POI (nomeVenueAmmesso, shared/schema/venue.ts).

   Nome+città non basta per riusare una venue: si riusa solo se sta entro
   STESSO_POSTO_M dal candidato scelto. Un'omonima altrove è un conflitto,
   mai un riuso silenzioso: altrimenti chi ha occupato per primo il nome
   con un punto vicino a casa di qualcun altro si vedrebbe consegnare il
   concerto di quella persona, e con lui il km pubblico casa → quel punto.

   Le venue scritte per nome (source "utente", lib/venueUtente.ts) nascono
   senza coordinate: `impostaPosizione` le scrive UNA volta, con quelle
   che geo.posizioneVenue ha trovato per «nome, città», e calcola i km dei
   concerti rimasti in attesa. Dopo, anche loro sono immutabili.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { aggiungiVenueInput, nomeConDettaglio, nomeVenueAmmesso, type CandidatoVenue } from "../shared/schema/venue.ts";
import { CACHE_TTL } from "./geo.ts";
import { logActivity, nuovoBatch } from "./lib/activity.ts";
import { internalMutation, internalQuery, ownerMutation } from "./lib/builders.ts";
import { errore } from "./lib/errors.ts";
import { campiKm, haversineKm } from "./lib/km.ts";
import { chiave, venuePerNome } from "./lib/refs.ts";

/** Entro questa distanza un'omonima nella stessa città è la stessa venue (POI diversi dello stesso posto, seed). */
export const STESSO_POSTO_M = 300;

/** Distanza in metri; una venue ancora senza posizione (nata per nome) conta come lo stesso posto. */
const distanzaM = (v: { lng?: number; lat?: number }, c: { lng: number; lat: number }) =>
  v.lng === undefined || v.lat === undefined ? 0 : haversineKm([v.lng, v.lat], [c.lng, c.lat]) * 1000;

/** Un'omonima (nome+città) del catalogo che NON sta nello stesso punto del candidato. */
async function omonimaAltrove(ctx: MutationCtx, nome: string, c: CandidatoVenue) {
  const v = await venuePerNome(ctx, nome, c.city);
  return v && distanzaM(v, c) > STESSO_POSTO_M ? v : null;
}

async function cittaNelCatalogo(ctx: MutationCtx, city: string, lng: number, lat: number) {
  const c = await ctx.db.query("cities").withIndex("by_key", q => q.eq("key", chiave(city))).first();
  if (!c) await ctx.db.insert("cities", { name: city, key: chiave(city), lng, lat });
}

/**
 * Il nome della nuova venue: quello del candidato, oppure quello scelto dal
 * chiamante se nomeVenueAmmesso lo consente. Il dettaglio tra parentesi su un
 * POI vale solo se nella stessa città c'è davvero un'altra venue col nome del POI.
 */
async function nomeDellaVenue(ctx: MutationCtx, c: CandidatoVenue, name: string | undefined): Promise<string> {
  if (name === undefined || nomeVenueAmmesso(c, name)) return name ?? c.name;
  const d = nomeConDettaglio(name);
  if (d && nomeVenueAmmesso(c, name, { conDettaglio: true }) && ((await omonimaAltrove(ctx, c.name, c)) || (await omonimaAltrove(ctx, d.base, c)))) return name;
  throw errore(
    "input_non_valido",
    "name: un luogo di OpenStreetMap tiene il suo nome (togli name). Un dettaglio tra parentesi, es. «Teatro Verdi (Sestri)», si aggiunge solo se nella stessa città c'è già un'altra venue con quel nome",
    { campo: "name" },
  );
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

export const createFromCandidate = ownerMutation({
  catalogOp: "add_venue",
  input: aggiungiVenueInput,
  handler: async (ctx, owner, { ref, name }) => {
    const candidate = await candidatoDa(ctx, ref);
    // l'id OSM identifica solo un POI: un ripiego sulla città porta l'id del
    // comune, che più venue diverse della stessa città condividerebbero
    const osm = candidate.featureType === "poi" ? candidate.osm : undefined;
    if (osm) {
      const perOsm = await ctx.db.query("venues").withIndex("by_osm", q => q.eq("osm", osm)).first();
      if (perOsm) return { id: perOsm._id as string, esistente: true };
    }
    const nome = await nomeDellaVenue(ctx, candidate, name);
    const perNome = await venuePerNome(ctx, nome, candidate.city);
    if (perNome) {
      // stessa venue solo se sta nello stesso punto del candidato scelto
      if (distanzaM(perNome, candidate) <= STESSO_POSTO_M) return { id: perNome._id as string, esistente: true };
      throw errore(
        "conflitto",
        "nel catalogo c'è già una venue con questo nome in questa città, ma in un altro punto: se è la stessa sceglila dal catalogo (search_venue la elenca), " +
          "se è un'altra aggiungi al nome un dettaglio tra parentesi, es. «Teatro Verdi (Sestri)»",
        { campo: "name" },
      );
    }
    const id = await ctx.db.insert("venues", {
      name: nome,
      city: candidate.city,
      nameKey: chiave(nome),
      cityKey: chiave(candidate.city),
      lng: candidate.lng,
      lat: candidate.lat,
      osm,
      source: candidate.featureType === "poi" ? "osm" : "citta",
      createdBy: owner.profile._id,
    });
    if (candidate.featureType === "city") await cittaNelCatalogo(ctx, candidate.city, candidate.lng, candidate.lat);
    // catalogo condiviso: la creazione si registra ma non si annulla (niente istantanee)
    await logActivity(ctx, owner, { op: "create", table: "venues", docId: id, summary: `venue aggiunta al catalogo: ${nome} (${candidate.city})` });
    return { id: id as string, esistente: false };
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

/** Concerti in attesa ricalcolati per lotto di posizione. */
const MAX_IN_ATTESA = 500;

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
    await ctx.db.patch(venueId, { lng: trovata.lng, lat: trovata.lat, posizione: trovata.tipo, ...(trovata.osm && trovata.tipo === "poi" ? { osm: trovata.osm } : {}) });
    if (trovata.tipo === "citta") await cittaNelCatalogo(ctx, ven.city, trovata.lng, trovata.lat);
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
    return null;
  },
});

/** Ricerca nel catalogo per geo.searchVenue (nome o città che contengono la ricerca). */
export const cercaNelCatalogo = internalQuery({
  args: { query: v.string() },
  handler: async (ctx, { query }) => {
    const k = chiave(query);
    const parole = k.split(" ").filter(w => w.length > 2);
    const tutte = await ctx.db.query("venues").take(2000);
    return tutte
      .filter(x => parole.length > 0 && parole.every(w => `${x.nameKey} ${x.cityKey}`.includes(w)))
      .slice(0, 10)
      .map(x => ({ id: x._id as string, name: x.name, city: x.city }));
  },
});
