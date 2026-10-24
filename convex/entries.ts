/* ──────────────────────────────────────────────────────────────
   Concerti e festival del proprietario (PIANO §5.2). Gli input usano i
   nomi (shared/schema/entry.ts), tradotti in id da convex/lib/refs.ts; i km
   arrivano da convex/lib/km.ts (coppie per sempre). Ogni scrittura va nel
   registro nella stessa transazione.

   `salvaScheda` è il Salva della scheda dell'Oracolo in scrittura
   (propose_concert, shared/schema/proposta.ts): l'unica funzione
   `oracoloOnly`. In una sola transazione e in un solo lotto crea le persone,
   il "regalato da" e la partenza (solo nome) che mancano, poi aggiunge o
   modifica il concerto con i km subito (scelta di Gabri, DECISIONI «Sonde
   sui km»); un solo Annulla toglie tutto. add/update restano quelle del
   catalogo (MCP, API), con input e output invariati.
   ────────────────────────────────────────────────────────────── */

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { isPlanned, todayKey } from "../shared/lib/dates.ts";
import { nessunInput } from "../shared/schema/campi.ts";
import {
  cancellaConcertoInput, elencaConcertiInput, entryInput, leggiConcertoInput, modificaConcertoInput,
} from "../shared/schema/entry.ts";
import { daProposta, nomiDa, salvaSchedaInput, type EntryPatch, type EventoEsterno, type RisultatoScheda } from "../shared/schema/proposta.ts";
import { istantanea, logActivity, nuovoBatch } from "./lib/activity.ts";
import { ownerMutation, ownerQuery } from "./lib/builders.ts";
import { errore } from "./lib/errors.ts";
import { campiKm } from "./lib/km.ts";
import { creaMancanti } from "./lib/mancanti.ts";
import { getOwned, type Owner } from "./lib/owner.ts";
import {
  caricaRefs, campiDaInput, esterno, nomiPerEsterno, nuovoCid, partenzaDa, personeDa, regaloDa, tempoDi, venueDa, type Refs,
} from "./lib/refs.ts";

const etichetta = (e: { kind: string; artist?: string; name?: string; date: string }) => `${e.kind === "festival" ? e.name : e.artist} (${e.date})`;

/** Un concerto passato senza voto, vicinanza o canzoni note. */
export function daCompletare(e: Doc<"entries">, today: number): boolean {
  if (isPlanned(e, today)) return false;
  const manca = (c: { voto?: number; vicinanza?: number; canzoniNote?: number | string }) =>
    c.voto === undefined || c.vicinanza === undefined || c.canzoniNote === undefined;
  return e.kind === "festival" ? (e.concerts ?? []).some(manca) : manca(e);
}

async function inserisci(ctx: MutationCtx, owner: Owner, campi: Awaited<ReturnType<typeof campiDaInput>>, batchId?: string) {
  const km = await campiKm(ctx, { profileId: owner.profile._id, departureId: campi.departureId, venueId: campi.venueId });
  const doc = Object.fromEntries(
    Object.entries({ ...campi, ...km, profileId: owner.profile._id, updatedAt: Date.now() }).filter(([, x]) => x !== undefined),
  ) as Omit<Doc<"entries">, "_id" | "_creationTime">;
  const id = await ctx.db.insert("entries", doc);
  const nuovo = await ctx.db.get(id);
  const activityId = await logActivity(ctx, owner, { op: "create", table: "entries", docId: id, batchId, summary: `aggiunto: ${etichetta(doc)}`, after: istantanea(nuovo) });
  return { id, kmPending: !!nuovo?.kmPending, activityId };
}

/** La modifica di un concerto o festival (update_concert e la scheda): restituisce la voce del registro. */
async function modificaEntry(ctx: MutationCtx, owner: Owner, e: Doc<"entries">, patch: EntryPatch, refs: Refs, batchId?: string) {
  const next: Record<string, unknown> = { ...e };
  const togli = (k: string, val: unknown) => {
    if (val === null) delete next[k];
    else if (val !== undefined) next[k] = val;
  };
  if (patch.date !== undefined) Object.assign(next, { date: patch.date, ...tempoDi(patch.date) });
  if (patch.venue !== undefined || patch.city !== undefined) {
    const v = await ctx.db.get(e.venueId);
    next.venueId = await venueDa(ctx, patch.venue ?? v?.name ?? "", patch.city ?? v?.city ?? "");
  }
  if (e.kind === "concert") {
    if (patch.name !== undefined || patch.concerts !== undefined) throw errore("input_non_valido", "name e concerts valgono solo per i festival", { campo: "patch" });
    togli("artist", patch.artist);
    if (patch.with !== undefined) next.with = personeDa(refs, patch.with, "patch.with");
    togli("voto", patch.voto);
    togli("vicinanza", patch.vicinanza);
    togli("canzoniNote", patch.canzoniNote);
  } else {
    if (patch.artist !== undefined || patch.with !== undefined || patch.voto !== undefined || patch.vicinanza !== undefined || patch.canzoniNote !== undefined) {
      throw errore("input_non_valido", "in un festival artista, compagni e voti stanno in concerts", { campo: "patch" });
    }
    togli("name", patch.name);
    if (patch.concerts !== undefined) {
      next.concerts = patch.concerts.map((c, i) => ({
        cid: e.concerts?.[i]?.cid ?? nuovoCid(),
        artist: c.artist,
        with: personeDa(refs, c.with, `patch.concerts.${i}.with`),
        ...(c.voto !== undefined ? { voto: c.voto } : {}),
        ...(c.vicinanza !== undefined ? { vicinanza: c.vicinanza } : {}),
        ...(c.canzoniNote !== undefined ? { canzoniNote: c.canzoniNote } : {}),
        ...(c.date !== undefined ? { date: c.date } : {}),
      }));
    }
  }
  togli("cost", patch.cost);
  togli("gift", patch.gift);
  togli("accredito", patch.accredito);
  togli("comments", patch.comments);
  if (patch.giftFrom !== undefined) togli("giftFromId", patch.giftFrom === null ? null : regaloDa(refs, patch.giftFrom));
  if (patch.from !== undefined) togli("departureId", patch.from === null ? null : partenzaDa(refs, patch.from));
  // km: solo se cambiano partenza o venue (la coppia decide, sempre la stessa)
  if (next.departureId !== e.departureId || next.venueId !== e.venueId) {
    delete next.km;
    delete next.kmSource;
    delete next.kmPending;
    const km = await campiKm(ctx, { profileId: owner.profile._id, departureId: next.departureId as Doc<"entries">["departureId"], venueId: next.venueId as Doc<"entries">["venueId"] });
    for (const [k, val] of Object.entries(km)) if (val !== undefined) next[k] = val;
  }
  next.updatedAt = Date.now();
  const { _id, _creationTime, ...doc } = next as Doc<"entries">;
  void _creationTime;
  await ctx.db.replace(_id, doc);
  return await logActivity(ctx, owner, { op: "update", table: "entries", docId: e._id, batchId, summary: `modificato: ${etichetta(e)}`, before: istantanea(e), after: istantanea(await ctx.db.get(e._id)) });
}

/** La forma esterna (nomi) di un concerto. */
async function esternoDi(ctx: MutationCtx, owner: Owner, e: Doc<"entries">): Promise<EventoEsterno> {
  return esterno(e, await nomiPerEsterno(ctx, owner.profile._id, [e]));
}

export const list = ownerQuery({
  catalogOp: "list_concerts",
  input: elencaConcertiInput,
  handler: async (ctx, owner, f) => {
    const today = todayKey(Date.now());
    let rows = await ctx.db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", owner.profile._id)).collect();
    if (f.anno !== undefined) rows = rows.filter(e => e.y === f.anno);
    if (f.da_completare) rows = rows.filter(e => daCompletare(e, today));
    const nomi = await nomiPerEsterno(ctx, owner.profile._id, rows);
    let out = rows.map(e => ({ ...esterno(e, nomi), daCompletare: daCompletare(e, today) }));
    if (f.artista) {
      const a = f.artista.toLowerCase();
      out = out.filter(e =>
        "concerts" in e ? (e.concerts ?? []).some(c => c.artist.toLowerCase().includes(a)) : (e.artist ?? "").toLowerCase().includes(a),
      );
    }
    return { concerts: out };
  },
});

export const get = ownerQuery({
  catalogOp: "get_concert",
  input: leggiConcertoInput,
  handler: async (ctx, owner, { id }) => {
    const e = await getOwned(ctx, owner, "entries", id);
    return esterno(e, await nomiPerEsterno(ctx, owner.profile._id, [e]));
  },
});

export const add = ownerMutation({
  catalogOp: "add_concert",
  input: entryInput,
  handler: async (ctx, owner, input) => {
    const refs = await caricaRefs(ctx, owner.profile._id);
    const campi = await campiDaInput(ctx, refs, input);
    const { id, kmPending } = await inserisci(ctx, owner, campi);
    return {
      id: id as string,
      ...(kmPending ? { avviso: "departure_address_missing", fix: `/${owner.profile.handle}/modifica#partenze` } : {}),
    };
  },
});

export const update = ownerMutation({
  catalogOp: "update_concert",
  input: modificaConcertoInput,
  handler: async (ctx, owner, { id, patch }) => {
    const e = await getOwned(ctx, owner, "entries", id);
    const refs = await caricaRefs(ctx, owner.profile._id);
    await modificaEntry(ctx, owner, e, patch, refs);
    return { id: e._id as string };
  },
});

export const remove = ownerMutation({
  catalogOp: "delete_concert",
  input: cancellaConcertoInput,
  handler: async (ctx, owner, { id }) => {
    const e = await getOwned(ctx, owner, "entries", id);
    await ctx.db.delete(e._id);
    // le coppie km restano: riaggiungere il concerto darà lo stesso km
    await logActivity(ctx, owner, { op: "delete", table: "entries", docId: e._id, summary: `cancellato: ${etichetta(e)}`, before: istantanea(e) });
    return { ok: true as const };
  },
});

/**
 * #concerti: le venue del catalogo condiviso, per scegliere quella del
 * concerto nel modale (nome e città; le coordinate restano alla mappa
 * pubblica). Una venue nuova si aggiunge con geo.searchVenue →
 * venues.createFromCandidate.
 */
export const venueCatalogo = ownerQuery({
  dashboardOnly: "modale dei concerti: elenco del catalogo venue (gli agenti usano search_venue)",
  input: nessunInput,
  handler: async ctx => ({
    venues: (await ctx.db.query("venues").take(5000))
      .map(v => ({ id: v._id as string, name: v.name, city: v.city }))
      .sort((a, b) => a.name.localeCompare(b.name, "it") || a.city.localeCompare(b.city, "it")),
  }),
});

/**
 * Il Salva della scheda dell'Oracolo (propose_concert, dopo il sì del
 * proprietario nella chat). Una transazione, un lotto: i nomi nuovi
 * (persone, "regalato da", partenza solo col nome), poi il concerto,
 * aggiunto o modificato, con i km subito. Gli errori non ripetono valori;
 * una venue che non è nel catalogo è `nome_sconosciuto` (campo venue) e non
 * scrive niente. Niente limite `agentWrites`: l'Oracolo non è un agente.
 */
export const salvaScheda = ownerMutation({
  oracoloOnly: "scheda dell'Oracolo in scrittura: concerto e nomi nuovi in un solo lotto, dopo il Salva del proprietario",
  input: salvaSchedaInput,
  handler: async (ctx, owner, { proposta }): Promise<RisultatoScheda> => {
    const batchId = nuovoBatch();
    const refs = await caricaRefs(ctx, owner.profile._id);
    const e = proposta.id ? await getOwned(ctx, owner, "entries", proposta.id) : undefined;
    const prima = e ? await esternoDi(ctx, owner, e) : undefined;
    const n = daProposta(proposta, prima);
    if (!n.ok) {
      const [x] = n.errori;
      throw errore("input_non_valido", `scheda non valida — ${x.campo}: ${x.messaggio}`, { campo: x.campo });
    }
    const creati = await creaMancanti(ctx, owner, refs, nomiDa(n), batchId, "dall'Oracolo");
    let id: Doc<"entries">["_id"];
    let activityId: string;
    if (n.azione === "aggiungi") {
      const campi = await campiDaInput(ctx, refs, n.input);
      ({ id, activityId } = await inserisci(ctx, owner, campi, batchId));
    } else {
      if (!Object.keys(n.patch).length) throw errore("input_non_valido", "scheda non valida: nessuna modifica rispetto al concerto salvato", { campo: "id" });
      id = e!._id;
      activityId = await modificaEntry(ctx, owner, e!, n.patch, refs, batchId);
    }
    const dopo = await esternoDi(ctx, owner, (await ctx.db.get(id))!);
    return {
      azione: n.azione === "aggiungi" ? "aggiunto" : "modificato",
      id: id as string,
      activityId,
      ...(prima ? { prima } : {}),
      dopo,
      creati,
    };
  },
});
