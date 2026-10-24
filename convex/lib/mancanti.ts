/* ──────────────────────────────────────────────────────────────
   I nomi che mancano nascono nel lotto (`batchId`) della scrittura che li
   usa, e si annullano con lei: persone, "regalato da" e, solo dalla scheda
   dell'Oracolo, la partenza (solo il nome: l'indirizzo si imposta in
   #partenze, fino ad allora i km restano in attesa).

   Lo usano l'import (convex/importer.ts, «dall'import», niente partenze:
   lì devono esistere) e entries.salvaScheda («dall'Oracolo»). Le
   partenze si inseriscono solo in convex/departures.ts
   (`creaPartenzaNelLotto`), che rifiuta i nomi che sembrano indirizzi.
   ────────────────────────────────────────────────────────────── */

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { creaPartenzaNelLotto } from "../departures.ts";
import { istantanea, logActivity } from "./activity.ts";
import type { Actor } from "./owner.ts";
import { chiave, type Refs } from "./refs.ts";

export type AutoreLotto = { profile: Doc<"profiles">; actor: Pick<Actor, "via" | "label"> };

/** I nomi da creare se mancano (per chiave: "Marco R." e "marco r." sono lo stesso). */
export interface NomiDaCreare {
  persone: string[];
  regalo?: string;
  partenza?: string;
}

/** Quello che è nato davvero, con i nomi come scritti. */
export interface Creati {
  persone: string[];
  regalatoDa?: string;
  partenza?: string;
}

/** Crea nel lotto i nomi sconosciuti a `refs` (e li aggiunge a `refs`). `suffisso`: «dall'import», «dall'Oracolo». */
export async function creaMancanti(ctx: MutationCtx, owner: AutoreLotto, refs: Refs, nomi: NomiDaCreare, batchId: string, suffisso: string): Promise<Creati> {
  const profileId = owner.profile._id;
  const creati: Creati = { persone: [] };
  for (const name of nomi.persone) {
    if (refs.people.has(chiave(name))) continue;
    const id = await ctx.db.insert("people", { profileId, name });
    refs.people.set(chiave(name), id);
    refs.peopleNames.push(name);
    creati.persone.push(name);
    await logActivity(ctx, owner, { op: "create", table: "people", docId: id, batchId, summary: `persona aggiunta ${suffisso}: ${name}`, after: istantanea(await ctx.db.get(id)) });
  }
  if (nomi.regalo && !refs.gifters.has(chiave(nomi.regalo))) {
    const label = nomi.regalo;
    const id = await ctx.db.insert("gifters", { profileId, label });
    refs.gifters.set(chiave(label), id);
    refs.gifterNames.push(label);
    creati.regalatoDa = label;
    await logActivity(ctx, owner, { op: "create", table: "gifters", docId: id, batchId, summary: `"regalato da" aggiunto ${suffisso}: ${label}`, after: istantanea(await ctx.db.get(id)) });
  }
  if (nomi.partenza && !refs.departures.has(chiave(nomi.partenza))) {
    const name = nomi.partenza;
    const id = await creaPartenzaNelLotto(ctx, owner, name, batchId, suffisso);
    refs.departures.set(chiave(name), id);
    refs.departureNames.push(name);
    creati.partenza = name;
  }
  return creati;
}
