/* ──────────────────────────────────────────────────────────────
   Partenze (PIANO §5.5). Il nome è pubblico; indirizzo e coordinate stanno
   in `departureSecrets` e non escono MAI: né in query pubbliche, né agli
   agenti, né nei log, né negli argomenti dello scheduler (solo id).
   `departureSecrets`, `geocodeDrafts` e `kmPairs` compaiono solo qui e in
   convex/lib/km.ts (convex/privacy.test.ts). T5 completa i flussi di
   conferma e correzione nella dashboard: `addresses` (me.departureAddresses
   del piano) dà al solo proprietario, solo dalla dashboard, il TESTO degli
   indirizzi; la correzione è al massimo una al giorno per partenza
   (`lastCorrectionAt` più il limite `addressCorrection`); l'eliminazione
   dell'account (convex/account.ts) passa dagli helper in fondo.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import { nessunInput } from "../shared/schema/campi.ts";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { aggiungiPartenzaInput, cancellaPartenzaInput, confermaIndirizzoInput, rinominaPartenzaInput } from "../shared/schema/departure.ts";
import { istantanea, logActivity, nuovoBatch } from "./lib/activity.ts";
import { internalMutation, internalQuery, ownerMutation, ownerQuery } from "./lib/builders.ts";
import { errore } from "./lib/errors.ts";
import { cancellaSegretiPartenza, estraiPerPartenza, haversineKm, kmSalvato } from "./lib/km.ts";
import { getOwned } from "./lib/owner.ts";
import { chiave, departuresOf } from "./lib/refs.ts";
import { rateLimiter } from "./rateLimits.ts";

const DRAFT_TTL = 30 * 60_000;
const LOTTO = 100;
/** Tra due correzioni dell'indirizzo di una partenza passa almeno un giorno. */
export const CORREZIONE_OGNI_MS = 24 * 3600_000;
/** Due punti a meno di 50 m sono lo stesso indirizzo (conferma ripetuta, non una correzione). */
export const STESSO_PUNTO_KM = 0.05;

async function nomeLibero(ctx: MutationCtx, profileId: Id<"profiles">, name: string, self?: Id<"departures">) {
  if ((await departuresOf(ctx, profileId)).some(d => d._id !== self && chiave(d.name) === chiave(name))) {
    throw errore("conflitto", "esiste già una partenza con questo nome", { campo: "name" });
  }
}

export const list = ownerQuery({
  catalogOp: "list_departures",
  input: nessunInput,
  handler: async (ctx, owner) => ({
    departures: (await departuresOf(ctx, owner.profile._id)).map(d => ({
      id: d._id as string,
      name: d.name,
      stato: d.hasAddress ? ("impostato" as const) : ("mancante" as const),
    })),
  }),
});

export const add = ownerMutation({
  catalogOp: "add_departure",
  input: aggiungiPartenzaInput,
  handler: async (ctx, owner, { name }) => {
    await nomeLibero(ctx, owner.profile._id, name);
    const id = await ctx.db.insert("departures", { profileId: owner.profile._id, name, hasAddress: false, legacy: false, createdAt: Date.now() });
    await logActivity(ctx, owner, { op: "create", table: "departures", docId: id, summary: `partenza aggiunta: ${name}`, after: istantanea(await ctx.db.get(id)) });
    return { id: id as string };
  },
});

export const rename = ownerMutation({
  catalogOp: "rename_departure",
  input: rinominaPartenzaInput,
  handler: async (ctx, owner, { id, name }) => {
    const d = await getOwned(ctx, owner, "departures", id);
    await nomeLibero(ctx, owner.profile._id, name, d._id);
    await ctx.db.patch(d._id, { name });
    await logActivity(ctx, owner, { op: "update", table: "departures", docId: d._id, summary: `partenza rinominata: ${d.name} → ${name}`, before: istantanea(d), after: istantanea(await ctx.db.get(d._id)) });
    return { ok: true as const };
  },
});

export const remove = ownerMutation({
  catalogOp: "delete_departure",
  input: cancellaPartenzaInput,
  handler: async (ctx, owner, { id }) => {
    const d = await getOwned(ctx, owner, "departures", id);
    const usati = await ctx.db
      .query("entries")
      .withIndex("by_profile_departure", q => q.eq("profileId", owner.profile._id).eq("departureId", d._id))
      .collect();
    if (usati.length) {
      throw errore("in_uso", `la partenza è usata da ${usati.length} concerti: cambiala lì prima di cancellarla`, {
        concerti: usati.slice(0, 20).map(e => `${e.date} · ${e.artist ?? e.name ?? ""}`),
      });
    }
    await cancellaSegreti(ctx, d._id);
    await ctx.db.delete(d._id);
    await logActivity(ctx, owner, { op: "delete", table: "departures", docId: d._id, summary: `partenza cancellata: ${d.name}`, before: istantanea(d) });
    return { ok: true as const };
  },
});

/* ── indirizzo: solo dashboard ────────────────────────────────── */

/** Candidati della geocodifica (da geo.geocodeDeparture): restano privati qui. */
export const saveDraft = internalMutation({
  args: { profileId: v.id("profiles"), departureId: v.id("departures"), candidates: v.array(v.object({ label: v.string(), lng: v.number(), lat: v.number() })) },
  handler: async (ctx, a) => {
    const d = await ctx.db.get(a.departureId);
    if (!d || d.profileId !== a.profileId) throw errore("not_found", "non trovato");
    for (const old of await ctx.db.query("geocodeDrafts").withIndex("by_departure", q => q.eq("departureId", a.departureId)).collect()) {
      await ctx.db.delete(old._id);
    }
    await ctx.db.insert("geocodeDrafts", { ...a, expiresAt: Date.now() + DRAFT_TTL });
    return null;
  },
});

/** La partenza di un proprietario (per le action di geo). */
export const ownedDeparture = internalQuery({
  args: { profileId: v.id("profiles"), departureId: v.string() },
  handler: async (ctx, { profileId, departureId }) => {
    const id = ctx.db.normalizeId("departures", departureId);
    const d = id ? await ctx.db.get(id) : null;
    return d && d.profileId === profileId ? { id: d._id, name: d.name } : null;
  },
});

export const confirmAddress = ownerMutation({
  dashboardOnly: "indirizzi (SPEC)",
  input: confermaIndirizzoInput,
  handler: async (ctx, owner, { departureId, indice }) => {
    const d = await getOwned(ctx, owner, "departures", departureId);
    const draft = await ctx.db.query("geocodeDrafts").withIndex("by_departure", q => q.eq("departureId", d._id)).first();
    if (!draft || draft.expiresAt < Date.now()) throw errore("not_found", "nessun candidato in sospeso: cerca di nuovo l'indirizzo");
    const c = draft.candidates[indice];
    if (!c) throw errore("input_non_valido", "indice: candidato inesistente", { campo: "indice" });
    // lo stesso punto confermato di nuovo (entro STESSO_PUNTO_KM) non è una
    // correzione: niente nuove estrazioni (che darebbero ai visitatori un
    // altro campione del jitter da mediare) e nessun limite consumato; al
    // massimo cambia il testo dell'indirizzo
    const attuale = d.hasAddress
      ? await ctx.db.query("departureSecrets").withIndex("by_departure", q => q.eq("departureId", d._id)).unique()
      : null;
    if (attuale && haversineKm([attuale.lng, attuale.lat], [c.lng, c.lat]) <= STESSO_PUNTO_KM) {
      await ctx.db.delete(draft._id);
      if (attuale.address !== c.label) {
        await ctx.db.patch(attuale._id, { address: c.label });
        await logActivity(ctx, { profile: owner.profile, actor: { via: "sistema", label: "Sistema" } }, {
          op: "update", table: "departures", docId: d._id, summary: `indirizzo di ${d.name} aggiornato`,
        });
      }
      return { ok: true as const, correzione: false, stessoPunto: true };
    }
    const correzione = d.hasAddress;
    if (correzione) {
      if (d.lastCorrectionAt !== undefined && Date.now() - d.lastCorrectionAt < CORREZIONE_OGNI_MS) {
        throw errore("limite_superato", "puoi correggere l'indirizzo di una partenza una volta al giorno", {
          fix: `/${owner.profile.handle}/modifica#partenze`,
          retryAfter: Math.ceil((d.lastCorrectionAt + CORREZIONE_OGNI_MS - Date.now()) / 1000),
        });
      }
      const r = await rateLimiter.limit(ctx, "addressCorrection", { key: d._id });
      if (!r.ok) throw errore("limite_superato", "puoi correggere l'indirizzo di una partenza una volta al giorno", { fix: `/${owner.profile.handle}/modifica#partenze` });
    }
    await scriviSegreto(ctx, { profileId: owner.profile._id, departureId: d._id, address: c.label, lng: c.lng, lat: c.lat });
    await ctx.db.delete(draft._id);
    await ctx.db.patch(d._id, { hasAddress: true, ...(correzione ? { lastCorrectionAt: Date.now() } : {}) });
    // il registro dice che l'indirizzo è cambiato, MAI quale (e non si annulla)
    await logActivity(ctx, { profile: owner.profile, actor: { via: "sistema", label: "Sistema" } }, {
      op: "update", table: "departures", docId: d._id, summary: `indirizzo di ${d.name} aggiornato`,
    });
    await ricalcola(ctx, owner.profile._id, d._id, correzione);
    return { ok: true as const, correzione, stessoPunto: false };
  },
});

/** Scrive (o sostituisce) l'indirizzo privato di una partenza. Anche per devtools. */
export async function scriviSegreto(ctx: MutationCtx, s: { profileId: Id<"profiles">; departureId: Id<"departures">; address: string; lng: number; lat: number }) {
  await cancellaSegreti(ctx, s.departureId, { soloIndirizzo: true });
  await ctx.db.insert("departureSecrets", { ...s, geocodedAt: Date.now() });
}

/** Toglie indirizzo e candidati (e, se non soloIndirizzo, nient'altro: le coppie km restano per sempre). */
export const cancellaSegreti = cancellaSegretiPartenza;

/** Nuove estrazioni (correzione) o coppie dei concerti in attesa, poi riscrittura a lotti. */
export async function ricalcola(ctx: MutationCtx, profileId: Id<"profiles">, departureId: Id<"departures">, correzione: boolean) {
  const toccate = await estraiPerPartenza(ctx, { profileId, departureId, correzione });
  if (!toccate.length) return;
  // solo id negli argomenti dello scheduler (mai lng, lat o address)
  await ctx.scheduler.runAfter(0, internal.departures.riscriviKm, { departureId, batchId: nuovoBatch(), cursor: null });
}

/** Riscrive i km dei concerti di una partenza da kmPairs, a lotti; attività `sistema`. */
export const riscriviKm = internalMutation({
  args: { departureId: v.id("departures"), batchId: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { departureId, batchId, cursor }) => {
    const d = await ctx.db.get(departureId);
    if (!d) return null;
    const page = await ctx.db
      .query("entries")
      .withIndex("by_profile_departure", q => q.eq("profileId", d.profileId).eq("departureId", departureId))
      .paginate({ cursor, numItems: LOTTO });
    const profile = await ctx.db.get(d.profileId);
    for (const e of page.page) {
      const k = await kmSalvato(ctx, departureId, e.venueId);
      if (!k) continue;
      if (e.km === k.km && e.kmSource === k.source && !e.kmPending) continue;
      await ctx.db.patch(e._id, { km: k.km, kmSource: k.source, kmPending: undefined });
      if (profile) {
        await logActivity(ctx, { profile, actor: { via: "sistema", label: "Sistema" } }, {
          op: "update", table: "entries", docId: e._id, batchId, summary: `km ricalcolati (${d.name})`,
        });
      }
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.departures.riscriviKm, { departureId, batchId, cursor: page.continueCursor });
    return null;
  },
});

/** Cron: candidati scaduti. */
export const cleanupDrafts = internalMutation({
  args: {},
  handler: async ctx => {
    const old = await ctx.db.query("geocodeDrafts").withIndex("by_expires", q => q.lt("expiresAt", Date.now())).take(500);
    for (const g of old) await ctx.db.delete(g._id);
    return null;
  },
});

/**
 * #partenze (me.departureAddresses del piano): per ogni partenza il TESTO
 * dell'indirizzo, quanti concerti la usano e da quando si può correggere.
 * Solo dashboard e solo nel browser (la sezione la carica dopo
 * l'idratazione, fuori dall'SSR). Mai coordinate.
 */
export const addresses = ownerQuery({
  dashboardOnly: "indirizzi (SPEC)",
  input: nessunInput,
  handler: async (ctx, owner) => {
    const entries = await ctx.db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", owner.profile._id)).collect();
    const indirizzi = await indirizziDelProfilo(ctx, owner.profile._id);
    return {
      partenze: (await departuresOf(ctx, owner.profile._id)).map(d => ({
        id: d._id as string,
        name: d.name,
        stato: d.hasAddress ? ("impostato" as const) : ("mancante" as const),
        indirizzo: indirizzi.get(d._id) ?? null,
        legacy: d.legacy,
        concerti: entries.filter(e => e.departureId === d._id).length,
        /** Da quando (ms) si può correggere di nuovo l'indirizzo (il browser lo confronta con l'ora); null = mai corretto. */
        correzioneDa: d.lastCorrectionAt !== undefined ? d.lastCorrectionAt + CORREZIONE_OGNI_MS : null,
      })),
    };
  },
});

/* ── per l'eliminazione e l'export dell'account (convex/account.ts) ── */

/** Il testo degli indirizzi delle partenze di un profilo, per id (mai coordinate). */
export async function indirizziDelProfilo(ctx: QueryCtx, profileId: Id<"profiles">): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const d of await departuresOf(ctx, profileId)) {
    if (!d.hasAddress) continue;
    const s = await ctx.db.query("departureSecrets").withIndex("by_departure", q => q.eq("departureId", d._id)).unique();
    if (s) out.set(d._id, s.address);
  }
  return out;
}

/** Cancella fino a `max` partenze del profilo con indirizzo e candidati; restituisce quante. */
export async function cancellaPartenzeDelProfilo(ctx: MutationCtx, profileId: Id<"profiles">, max: number): Promise<number> {
  const deps = await ctx.db.query("departures").withIndex("by_profile", q => q.eq("profileId", profileId)).take(max);
  for (const d of deps) {
    await cancellaSegreti(ctx, d._id);
    await ctx.db.delete(d._id);
  }
  return deps.length;
}

/**
 * Una pagina delle coppie km, cancellando quelle del profilo: anche le
 * coppie di partenze già cancellate, che restano per sempre (§1.22) e non
 * hanno un indice per profilo.
 */
export async function cancellaCoppieDelProfiloPagina(ctx: MutationCtx, profileId: Id<"profiles">, cursor: string | null) {
  const page = await ctx.db.query("kmPairs").paginate({ cursor, numItems: 500 });
  for (const c of page.page) if (c.profileId === profileId) await ctx.db.delete(c._id);
  return { finito: page.isDone, cursor: page.continueCursor };
}

/** Per i test e devtools: le partenze con stato, mai l'indirizzo. */
export type PartenzaStato = Pick<Doc<"departures">, "_id" | "name" | "hasAddress">;
