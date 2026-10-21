/* Persone (compagni): elenco privato per profilo; nei concerti sono id. */

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { nessunInput } from "../shared/schema/campi.ts";
import { aggiungiPersonaInput, cancellaPersonaInput, rinominaPersonaInput, unisciPersoneInput } from "../shared/schema/people.ts";
import { istantanea, logActivity, nuovoBatch } from "./lib/activity.ts";
import { ownerMutation, ownerQuery } from "./lib/builders.ts";
import { errore } from "./lib/errors.ts";
import { getOwned } from "./lib/owner.ts";
import { chiave, peopleOf } from "./lib/refs.ts";

const usa = (e: Doc<"entries">, id: Id<"people">) =>
  (e.with ?? []).includes(id) || (e.concerts ?? []).some(c => c.with.includes(id));

async function entriesOf(ctx: MutationCtx, profileId: Id<"profiles">) {
  return await ctx.db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", profileId)).collect();
}

async function nomeLibero(ctx: MutationCtx, profileId: Id<"profiles">, name: string, self?: Id<"people">) {
  const tutti = await peopleOf(ctx, profileId);
  if (tutti.some(p => p._id !== self && chiave(p.name) === chiave(name))) {
    throw errore("conflitto", "esiste già una persona con questo nome", { campo: "name" });
  }
}

export const list = ownerQuery({
  catalogOp: "list_people",
  input: nessunInput,
  handler: async (ctx, owner) => {
    const people = await peopleOf(ctx, owner.profile._id);
    const entries = await ctx.db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", owner.profile._id)).collect();
    return {
      people: people.map(p => ({ id: p._id as string, name: p.name, concerti: entries.filter(e => usa(e, p._id)).length })),
    };
  },
});

export const add = ownerMutation({
  catalogOp: "add_person",
  input: aggiungiPersonaInput,
  handler: async (ctx, owner, { name }) => {
    await nomeLibero(ctx, owner.profile._id, name);
    const id = await ctx.db.insert("people", { profileId: owner.profile._id, name });
    await logActivity(ctx, owner, { op: "create", table: "people", docId: id, summary: `persona aggiunta: ${name}`, after: istantanea(await ctx.db.get(id)) });
    return { id: id as string };
  },
});

export const rename = ownerMutation({
  catalogOp: "rename_person",
  input: rinominaPersonaInput,
  handler: async (ctx, owner, { id, name }) => {
    const p = await getOwned(ctx, owner, "people", id);
    await nomeLibero(ctx, owner.profile._id, name, p._id);
    await ctx.db.patch(p._id, { name });
    await logActivity(ctx, owner, { op: "update", table: "people", docId: p._id, summary: `persona rinominata: ${p.name} → ${name}`, before: istantanea(p), after: istantanea(await ctx.db.get(p._id)) });
    return { ok: true as const };
  },
});

export const merge = ownerMutation({
  catalogOp: "merge_person",
  input: unisciPersoneInput,
  handler: async (ctx, owner, { from, into }) => {
    const a = await getOwned(ctx, owner, "people", from);
    const b = await getOwned(ctx, owner, "people", into);
    if (a._id === b._id) throw errore("input_non_valido", "from e into sono la stessa persona", { campo: "into" });
    const batchId = nuovoBatch();
    const sost = (ids: Id<"people">[]) => [...new Set(ids.map(x => (x === a._id ? b._id : x)))];
    for (const e of await entriesOf(ctx, owner.profile._id)) {
      if (!usa(e, a._id)) continue;
      const patch: Partial<Doc<"entries">> = { updatedAt: Date.now() };
      if (e.with) patch.with = sost(e.with);
      if (e.concerts) patch.concerts = e.concerts.map(c => ({ ...c, with: sost(c.with) }));
      await ctx.db.patch(e._id, patch);
      await logActivity(ctx, owner, { op: "update", table: "entries", docId: e._id, batchId, summary: `unione di persone: ${a.name} → ${b.name}`, before: istantanea(e), after: istantanea(await ctx.db.get(e._id)) });
    }
    await ctx.db.delete(a._id);
    await logActivity(ctx, owner, { op: "delete", table: "people", docId: a._id, batchId, summary: `persona unita a ${b.name}: ${a.name}`, before: istantanea(a) });
    return { ok: true as const };
  },
});

export const remove = ownerMutation({
  catalogOp: "delete_person",
  input: cancellaPersonaInput,
  handler: async (ctx, owner, { id }) => {
    const p = await getOwned(ctx, owner, "people", id);
    const usati = (await entriesOf(ctx, owner.profile._id)).filter(e => usa(e, p._id));
    if (usati.length) {
      throw errore("in_uso", `la persona è in ${usati.length} concerti: toglila prima o uniscila a un'altra`, {
        concerti: usati.slice(0, 20).map(e => `${e.date} · ${e.artist ?? e.name ?? ""}`),
      });
    }
    await ctx.db.delete(p._id);
    await logActivity(ctx, owner, { op: "delete", table: "people", docId: p._id, summary: `persona cancellata: ${p.name}`, before: istantanea(p) });
    return { ok: true as const };
  },
});
