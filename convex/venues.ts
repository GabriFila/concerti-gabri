/* ──────────────────────────────────────────────────────────────
   Catalogo venue condiviso (PIANO §5.5.4). Una venue nasce solo da un
   candidato di geo.searchVenue (POI OSM o, in mancanza, la città); si
   deduplica per id OSM e per nome+città; le coordinate sono IMMUTABILI:
   non esiste un modo per modificarle. Il flusso delle partenze non chiama e
   non alimenta mai questo modulo.

   Il candidato NON arriva dal chiamante: arriva il suo `ref` (riga della
   cache delle ricerche + indice, emesso da geo.searchVenue) e da lì si
   rileggono coordinate, id OSM, città e tipo, che vengono solo da
   Nominatim. Il chiamante può scegliere al massimo il nome.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { aggiungiVenueInput, type CandidatoVenue } from "../shared/schema/venue.ts";
import { CACHE_TTL } from "./geo.ts";
import { logActivity } from "./lib/activity.ts";
import { internalQuery, ownerMutation } from "./lib/builders.ts";
import { errore } from "./lib/errors.ts";
import { chiave, venuePerNome } from "./lib/refs.ts";

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
    const nome = name ?? candidate.name;
    // l'id OSM identifica solo un POI: un ripiego sulla città porta l'id del
    // comune, che più venue diverse della stessa città condividerebbero
    const osm = candidate.featureType === "poi" ? candidate.osm : undefined;
    if (osm) {
      const perOsm = await ctx.db.query("venues").withIndex("by_osm", q => q.eq("osm", osm)).first();
      if (perOsm) return { id: perOsm._id as string, esistente: true };
    }
    const perNome = await venuePerNome(ctx, nome, candidate.city);
    if (perNome) return { id: perNome._id as string, esistente: true };
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
    if (candidate.featureType === "city") {
      const c = await ctx.db.query("cities").withIndex("by_key", q => q.eq("key", chiave(candidate.city))).first();
      if (!c) await ctx.db.insert("cities", { name: candidate.city, key: chiave(candidate.city), lng: candidate.lng, lat: candidate.lat });
    }
    // catalogo condiviso: la creazione si registra ma non si annulla (niente istantanee)
    await logActivity(ctx, owner, { op: "create", table: "venues", docId: id, summary: `venue aggiunta al catalogo: ${nome} (${candidate.city})` });
    return { id: id as string, esistente: false };
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
