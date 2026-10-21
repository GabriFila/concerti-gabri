/* ──────────────────────────────────────────────────────────────
   Km dei viaggi (PIANO §1.22, §5.5; ricetta di CLAUDE.md).

   km = round(d · (1.2 + 0.25·e^(−d/20)) · j), con d la distanza
   ortodromica (haversine) tra partenza e venue e j estratto UNA volta sola
   da [0.95, 1.07] con crypto.getRandomValues. Il km di una coppia
   (partenza, venue) si salva nella tabella privata `kmPairs` e da lì si
   riusa per sempre: cancellare e riaggiungere un concerto, Annulla e Rifai,
   danno sempre lo stesso km, e nessuno può accumulare estrazioni per
   mediare via il jitter. Solo la correzione di un indirizzo estrae di nuovo.

   `kmPairs` e `departureSecrets` compaiono solo qui e in convex/departures.ts
   (convex/privacy.test.ts lo verifica).
   ────────────────────────────────────────────────────────────── */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const J_MIN = 0.95;
export const J_MAX = 1.07;

const R = 6371.0088;
const rad = (x: number) => (x * Math.PI) / 180;

/** Distanza ortodromica in km tra due [lng, lat]. */
export function haversineKm([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** La ricetta, deterministica a `j` fisso. */
export const kmDaDistanza = (d: number, j: number): number => Math.round(d * (1.2 + 0.25 * Math.exp(-d / 20)) * j);

/** Un `j` uniforme in [0.95, 1.07] da crypto.getRandomValues (53 bit). */
export function estraiJitter(): number {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const u = (buf[0] * 2 ** 21 + (buf[1] >>> 11)) / 2 ** 53; // [0, 1)
  return J_MIN + u * (J_MAX - J_MIN);
}

export type KmEsito = { km: number; source: "legacy" | "calcolato" } | { pending: true };

async function coppia(ctx: QueryCtx | MutationCtx, departureId: Id<"departures">, venueId: Id<"venues">) {
  return await ctx.db
    .query("kmPairs")
    .withIndex("by_pair", q => q.eq("departureId", departureId).eq("venueId", venueId))
    .unique();
}

async function coordinatePartenza(ctx: QueryCtx | MutationCtx, departureId: Id<"departures">) {
  const s = await ctx.db
    .query("departureSecrets")
    .withIndex("by_departure", q => q.eq("departureId", departureId))
    .unique();
  return s ? ([s.lng, s.lat] as [number, number]) : null;
}

/**
 * Il km di una coppia: riusato da `kmPairs` se c'è; altrimenti, se la partenza
 * ha l'indirizzo, estratto ora e salvato per sempre; altrimenti in attesa.
 */
export async function kmPerCoppia(
  ctx: MutationCtx,
  { profileId, departureId, venueId }: { profileId: Id<"profiles">; departureId: Id<"departures">; venueId: Id<"venues"> },
): Promise<KmEsito> {
  const esistente = await coppia(ctx, departureId, venueId);
  if (esistente) return { km: esistente.km, source: esistente.source };
  const casa = await coordinatePartenza(ctx, departureId);
  if (!casa) return { pending: true };
  const venue = await ctx.db.get(venueId);
  if (!venue) return { pending: true };
  const km = kmDaDistanza(haversineKm(casa, [venue.lng, venue.lat]), estraiJitter());
  await ctx.db.insert("kmPairs", { profileId, departureId, venueId, km, source: "calcolato", drawnAt: Date.now() });
  return { km, source: "calcolato" };
}

/** I campi km di un concerto per (partenza, venue); senza partenza nessun km. */
export async function campiKm(
  ctx: MutationCtx,
  args: { profileId: Id<"profiles">; departureId?: Id<"departures">; venueId: Id<"venues"> },
): Promise<{ km?: number; kmSource?: "legacy" | "calcolato"; kmPending?: boolean }> {
  if (!args.departureId) return { km: undefined, kmSource: undefined, kmPending: undefined };
  const r = await kmPerCoppia(ctx, { profileId: args.profileId, departureId: args.departureId, venueId: args.venueId });
  return "pending" in r ? { km: undefined, kmSource: undefined, kmPending: true } : { km: r.km, kmSource: r.source, kmPending: undefined };
}

/** Seed: una coppia legacy col km di oggi (il valore del concerto più recente). */
export async function salvaCoppiaLegacy(
  ctx: MutationCtx,
  args: { profileId: Id<"profiles">; departureId: Id<"departures">; venueId: Id<"venues">; km: number },
) {
  const esistente = await coppia(ctx, args.departureId, args.venueId);
  if (esistente) {
    if (esistente.source === "legacy" && esistente.km !== args.km) await ctx.db.patch(esistente._id, { km: args.km });
    return;
  }
  await ctx.db.insert("kmPairs", { ...args, source: "legacy", drawnAt: Date.now() });
}

/**
 * Prima volta che una partenza ha l'indirizzo: le coppie esistenti (legacy)
 * restano; si calcolano solo le coppie dei concerti in attesa.
 * Correzione: nuova estrazione per OGNI coppia della partenza.
 * Restituisce le venue le cui coppie sono cambiate o nate.
 */
export async function estraiPerPartenza(
  ctx: MutationCtx,
  { profileId, departureId, correzione }: { profileId: Id<"profiles">; departureId: Id<"departures">; correzione: boolean },
): Promise<Id<"venues">[]> {
  const casa = await coordinatePartenza(ctx, departureId);
  if (!casa) return [];
  const toccate: Id<"venues">[] = [];
  if (correzione) {
    const coppie = await ctx.db.query("kmPairs").withIndex("by_departure", q => q.eq("departureId", departureId)).collect();
    for (const c of coppie) {
      const venue = await ctx.db.get(c.venueId);
      if (!venue) continue;
      const km = kmDaDistanza(haversineKm(casa, [venue.lng, venue.lat]), estraiJitter());
      await ctx.db.patch(c._id, { km, source: "calcolato", drawnAt: Date.now() });
      toccate.push(c.venueId);
    }
  }
  // concerti in attesa di questa partenza: una coppia nuova per venue
  const inAttesa = await ctx.db
    .query("entries")
    .withIndex("by_profile_departure", q => q.eq("profileId", profileId).eq("departureId", departureId))
    .collect();
  for (const e of inAttesa) {
    if (!e.kmPending) continue;
    const r = await kmPerCoppia(ctx, { profileId, departureId, venueId: e.venueId });
    if (!("pending" in r) && !toccate.includes(e.venueId)) toccate.push(e.venueId);
  }
  return toccate;
}

/** Il km salvato di una coppia (per riscrivere i concerti dopo un'estrazione). */
export async function kmSalvato(ctx: QueryCtx | MutationCtx, departureId: Id<"departures">, venueId: Id<"venues">) {
  const c = await coppia(ctx, departureId, venueId);
  return c ? { km: c.km, source: c.source } : null;
}

/** Pulizia (devtools/reset, eliminazione account): le coppie di un profilo. */
export async function cancellaCoppieDelProfilo(ctx: MutationCtx, departureIds: Id<"departures">[]) {
  for (const d of departureIds) {
    for (const c of await ctx.db.query("kmPairs").withIndex("by_departure", q => q.eq("departureId", d)).collect()) {
      await ctx.db.delete(c._id);
    }
  }
}

/** Conteggi per i test e per check-setup: mai i valori. */
export async function contaCoppie(ctx: QueryCtx | MutationCtx, departureIds: Id<"departures">[]) {
  let n = 0;
  for (const d of departureIds) n += (await ctx.db.query("kmPairs").withIndex("by_departure", q => q.eq("departureId", d)).collect()).length;
  return n;
}

/** Toglie indirizzo e candidati di una partenza (se non `soloIndirizzo`); le coppie km restano per sempre. */
export async function cancellaSegretiPartenza(ctx: MutationCtx, departureId: Id<"departures">, { soloIndirizzo = false } = {}) {
  for (const s of await ctx.db.query("departureSecrets").withIndex("by_departure", q => q.eq("departureId", departureId)).collect()) {
    await ctx.db.delete(s._id);
  }
  if (soloIndirizzo) return;
  for (const g of await ctx.db.query("geocodeDrafts").withIndex("by_departure", q => q.eq("departureId", departureId)).collect()) {
    await ctx.db.delete(g._id);
  }
}

/**
 * Annulla della cancellazione di una partenza: la partenza torna con un id
 * nuovo e le sue coppie la seguono, così i km restano quelli estratti allora
 * (riuso per sempre, nessuna estrazione nuova da mediare).
 */
export async function rimappaCoppie(ctx: MutationCtx, da: Id<"departures">, a: Id<"departures">) {
  for (const c of await ctx.db.query("kmPairs").withIndex("by_departure", q => q.eq("departureId", da)).collect()) {
    await ctx.db.patch(c._id, { departureId: a });
  }
}
