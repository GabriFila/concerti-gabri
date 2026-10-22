/* ──────────────────────────────────────────────────────────────
   Registro attività e Annulla (PIANO §1.30, §5.7).

   - Ogni scrittura chiama `logActivity` nella stessa transazione, con le
     istantanee prima/dopo delle sole tabelle pubbliche.
   - Annulla applica l'inverso solo se il documento coincide ancora con
     `after`, ignorando km, kmPending, kmSource (e i campi di sistema);
     altrimenti "modificato dopo". I lotti (`batchId`) si annullano insieme.
     Annullare è a sua volta un'attività: annullarla rifà l'operazione.
     Le attività `sistema` e il catalogo condiviso delle venue non si
     annullano.
   - Annulla rispetta le stesse regole delle funzioni: niente persone,
     partenze o "regalato da" cancellati mentre un concerto li usa (`in_uso`),
     nomi unici, handle solo se disponibile (con gli alias, lib/handles.ts).
     Una partenza ricreata torna SENZA indirizzo e con le sue coppie km.
   ────────────────────────────────────────────────────────────── */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { codiceDi, errore } from "./errors.ts";
import { cambiaHandle } from "./handles.ts";
import { campiKm, cancellaSegretiPartenza, rimappaCoppie } from "./km.ts";
import type { Actor, Owner } from "./owner.ts";
import { chiave, departuresOf, giftersOf, peopleOf } from "./refs.ts";

export type TabellaRegistro = "entries" | "people" | "gifters" | "departures" | "profiles" | "wishlist" | "venues";
/** "logo": cambio di logo di un "regalato da", registrato ma non annullabile (convex/activity.ts). */
export type Op = "create" | "update" | "delete" | "replace" | "logo";

export interface Voce {
  op: Op;
  table: TabellaRegistro;
  docId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  batchId?: string;
}

const IGNORATI = new Set(["_id", "_creationTime", "km", "kmPending", "kmSource", "updatedAt"]);

/** Solo i campi pubblici e confrontabili di un documento. */
export function istantanea<T extends Record<string, unknown>>(doc: T | null | undefined): Record<string, unknown> | undefined {
  if (!doc) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(doc)) if (val !== undefined) out[k] = val;
  return out;
}

function pulito(doc: unknown): unknown {
  if (Array.isArray(doc)) return doc.map(pulito);
  if (doc && typeof doc === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(doc as object).sort()) {
      const val = (doc as Record<string, unknown>)[k];
      if (IGNORATI.has(k) || val === undefined) continue;
      out[k] = pulito(val);
    }
    return out;
  }
  return doc;
}

/** Uguaglianza ignorando km, kmPending, kmSource e i campi di sistema. */
export const uguali = (a: unknown, b: unknown) => JSON.stringify(pulito(a)) === JSON.stringify(pulito(b));

export async function logActivity(ctx: MutationCtx, owner: Owner | { profile: Doc<"profiles">; actor: Pick<Actor, "via" | "label"> }, voce: Voce & { undoOf?: Id<"activity"> }) {
  return await ctx.db.insert("activity", {
    profileId: owner.profile._id,
    at: Date.now(),
    actor: { via: owner.actor.via, label: owner.actor.label },
    op: voce.op,
    table: voce.table,
    docId: voce.docId,
    batchId: voce.batchId,
    summary: voce.summary,
    before: voce.before,
    after: voce.after,
    undoOf: voce.undoOf,
  });
}

export const nuovoBatch = () => `b${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;

const senzaSistema = (doc: Record<string, unknown>) => {
  const { _id, _creationTime, ...rest } = doc as Record<string, unknown> & { _id?: unknown; _creationTime?: unknown };
  void _id;
  void _creationTime;
  return rest;
};

function sostituisciId(val: unknown, mappa: Map<string, string>): unknown {
  if (typeof val === "string") return mappa.get(val) ?? val;
  if (Array.isArray(val)) return val.map(x => sostituisciId(x, mappa));
  if (val && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(val)) out[k] = sostituisciId(x, mappa);
    return out;
  }
  return val;
}

async function corrente(ctx: MutationCtx, a: Doc<"activity">) {
  if (a.table === "wishlist") {
    const righe = await ctx.db.query("wishlist").withIndex("by_profile_ordine", q => q.eq("profileId", a.profileId)).collect();
    return righe.map(r => r.artist);
  }
  const id = ctx.db.normalizeId(a.table as TabellaRegistro & string as "entries", a.docId);
  return id ? await ctx.db.get(id) : null;
}

/** Ricalcola i campi km di un concerto ripristinato: arrivano dalle coppie salvate (lib/km.ts), quindi identici. */
async function conKm(ctx: MutationCtx, doc: Record<string, unknown>) {
  if (!doc.venueId) return doc;
  const km = await campiKm(ctx, {
    profileId: doc.profileId as Id<"profiles">,
    departureId: doc.departureId as Id<"departures"> | undefined,
    venueId: doc.venueId as Id<"venues">,
  });
  const out = { ...doc };
  delete out.km;
  delete out.kmSource;
  delete out.kmPending;
  return { ...out, ...Object.fromEntries(Object.entries(km).filter(([, x]) => x !== undefined)) };
}

/*
 * Profili e partenze hanno campi gestiti dal sistema (stato dell'onboarding,
 * indirizzo impostato, ultima correzione…). Annulla ripristina e confronta
 * solo i campi che l'utente cambia, così un indirizzo impostato dopo non
 * blocca l'annullamento di un cambio di nome, e annullare non tocca mai
 * `hasAddress` (che dipende dall'indirizzo privato, fuori dal registro).
 */
const CAMPI_ANNULLABILI: Partial<Record<TabellaRegistro, readonly string[]>> = {
  profiles: ["displayName", "forma", "handle", "theme", "layout", "extra"],
  departures: ["name"],
};
const confrontabile = (table: TabellaRegistro, doc: unknown) => {
  const campi = CAMPI_ANNULLABILI[table];
  if (!campi || !doc || typeof doc !== "object") return doc;
  return Object.fromEntries(campi.map(k => [k, (doc as Record<string, unknown>)[k]]));
};

type ConNome = "people" | "departures" | "gifters";
const CAMPO_NOME: Record<ConNome, "name" | "label"> = { people: "name", departures: "name", gifters: "label" };
const NOME_TABELLA: Record<ConNome, string> = { people: "una persona", departures: "una partenza", gifters: "un \"regalato da\"" };
const conNome = (t: TabellaRegistro): t is ConNome => t === "people" || t === "departures" || t === "gifters";

/** Lo stesso controllo dei nomi unici delle funzioni (people/departures/gifters), anche quando si annulla. */
async function nomeLibero(ctx: MutationCtx, table: ConNome, profileId: Id<"profiles">, nome: unknown, self?: string) {
  if (typeof nome !== "string") return;
  const docs: { _id: string; name?: string; label?: string }[] =
    table === "people" ? await peopleOf(ctx, profileId) : table === "departures" ? await departuresOf(ctx, profileId) : await giftersOf(ctx, profileId);
  if (docs.some(d => d._id !== self && chiave(d[CAMPO_NOME[table]] ?? "") === chiave(nome))) {
    throw errore("conflitto", `esiste già ${NOME_TABELLA[table]} con questo nome: rinomina l'altro prima di annullare`);
  }
}

/** Quanti concerti usano una persona, una partenza o un "regalato da" (come i `remove` dei moduli). */
async function concertiCheUsano(ctx: MutationCtx, table: ConNome, profileId: Id<"profiles">, id: string) {
  const entries = await ctx.db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", profileId)).collect();
  return entries.filter(e =>
    table === "people"
      ? (e.with ?? []).includes(id as Id<"people">) || (e.concerts ?? []).some(c => c.with.includes(id as Id<"people">))
      : table === "departures"
        ? e.departureId === id
        : e.giftFromId === id,
  ).length;
}

/** Ripristina i campi del profilo; l'handle passa da cambiaHandle (disponibilità e alias). */
async function ripristinaProfilo(ctx: MutationCtx, id: Id<"profiles">, prima: Record<string, unknown>) {
  const cur = (await ctx.db.get(id))!;
  if (typeof prima.handle === "string" && prima.handle !== cur.handle) {
    try {
      await cambiaHandle(ctx, cur, prima.handle);
    } catch (e) {
      if (codiceDi(e) === "handle_non_disponibile") throw errore("conflitto", "l'handle di prima non è più disponibile: scegline un altro dal profilo");
      throw e;
    }
  }
  const patch: Record<string, unknown> = {};
  for (const k of CAMPI_ANNULLABILI.profiles!) if (k !== "handle") patch[k] = prima[k];
  await ctx.db.patch(id, patch as Partial<Doc<"profiles">>);
}

/** Annulla una voce (o il suo lotto). Restituisce le voci create dall'annullamento. */
export async function annulla(ctx: MutationCtx, owner: Owner, activityId: Id<"activity">) {
  const voce = await ctx.db.get(activityId);
  if (!voce || voce.profileId !== owner.profile._id) throw errore("not_found", "voce del registro non trovata");
  if (voce.actor.via === "sistema") throw errore("conflitto", "i ricalcoli di sistema non si annullano");
  const lotto = voce.batchId
    ? (await ctx.db.query("activity").withIndex("by_batch", q => q.eq("batchId", voce.batchId)).collect()).filter(a => a.profileId === owner.profile._id)
    : [voce];
  if (lotto.some(a => a.undoneBy)) throw errore("conflitto", "già annullata");
  if (lotto.some(a => a.actor.via === "sistema")) throw errore("conflitto", "i ricalcoli di sistema non si annullano");
  if (lotto.some(a => !annullabile(a))) throw errore("conflitto", "il catalogo condiviso delle venue non si annulla");

  // 1. controllo dei conflitti su tutto il lotto, prima di scrivere
  for (const a of lotto) {
    const t = a.table as TabellaRegistro;
    if (t === "profiles" && a.op !== "update") throw errore("conflitto", "questa voce non si annulla");
    const cur = await corrente(ctx, a);
    const atteso = a.op === "delete" ? null : a.after;
    const ok = a.op === "delete" ? cur === null : cur !== null && uguali(confrontabile(t, cur), confrontabile(t, atteso));
    if (!ok) throw errore("conflitto", "modificato dopo: annulla prima le modifiche successive");
  }

  // 2. applica: prima le ricreazioni (le altre voci possono riferirsi ai
  //    nuovi id), poi le modifiche, per ultime le cancellazioni (così
  //    "in uso" guarda i concerti già ripristinati dallo stesso lotto)
  const batchId = voce.batchId ? nuovoBatch() : undefined;
  const mappa = new Map<string, string>();
  const ordinate = [...lotto].sort((x, y) => (x.at === y.at ? (x._creationTime < y._creationTime ? 1 : -1) : y.at - x.at));
  const prima = [
    ...ordinate.filter(a => a.op === "delete"),
    ...ordinate.filter(a => a.op !== "delete" && a.op !== "create"),
    ...ordinate.filter(a => a.op === "create"),
  ];
  const create: Id<"activity">[] = [];
  for (const a of prima) {
    const table = a.table as TabellaRegistro;
    let nuova: Voce;
    if (table === "wishlist") {
      const prec = (a.before as string[] | undefined) ?? [];
      const righe = await ctx.db.query("wishlist").withIndex("by_profile_ordine", q => q.eq("profileId", owner.profile._id)).collect();
      for (const r of righe) await ctx.db.delete(r._id);
      for (const [i, artist] of prec.entries()) await ctx.db.insert("wishlist", { profileId: owner.profile._id, artist, ordine: i });
      nuova = { op: "replace", table, docId: a.docId, summary: `annullato: ${a.summary}`, before: a.after, after: prec, batchId };
    } else if (a.op === "create") {
      const id = ctx.db.normalizeId(table as "entries", a.docId)!;
      const prec = await ctx.db.get(id);
      if (conNome(table)) {
        // come i remove dei moduli: niente id appesi nei concerti
        const n = await concertiCheUsano(ctx, table, owner.profile._id, a.docId);
        if (n) throw errore("in_uso", `è usato da ${n} concerti: toglilo da lì prima di annullarne la creazione`);
        if (table === "departures") await cancellaSegretiPartenza(ctx, id as unknown as Id<"departures">);
      }
      await ctx.db.delete(id);
      nuova = { op: "delete", table, docId: a.docId, summary: `annullato: ${a.summary}`, before: istantanea(prec as Record<string, unknown>), batchId };
    } else if (a.op === "delete") {
      let doc = sostituisciId(senzaSistema(a.before as Record<string, unknown>), mappa) as Record<string, unknown>;
      if (conNome(table)) await nomeLibero(ctx, table, owner.profile._id, doc[CAMPO_NOME[table]]);
      if (table === "entries") doc = await conKm(ctx, doc);
      if (table === "departures") {
        // l'indirizzo privato se n'è andato con la cancellazione: la partenza
        // torna senza (da reimpostare in #partenze), con le sue coppie km
        doc = { ...doc, hasAddress: false };
        delete doc.lastCorrectionAt;
      }
      const id = await ctx.db.insert(table as "entries", doc as never);
      if (table === "departures") await rimappaCoppie(ctx, a.docId as Id<"departures">, id as unknown as Id<"departures">);
      mappa.set(a.docId, id);
      nuova = { op: "create", table, docId: id, summary: `annullato: ${a.summary}`, after: istantanea((await ctx.db.get(id)) as Record<string, unknown>), batchId };
    } else {
      const id = ctx.db.normalizeId(table as "entries", a.docId)!;
      const before = sostituisciId(senzaSistema(a.before as Record<string, unknown>), mappa) as Record<string, unknown>;
      const prec = await ctx.db.get(id);
      if (table === "profiles") await ripristinaProfilo(ctx, id as unknown as Id<"profiles">, before);
      else if (table === "departures") {
        await nomeLibero(ctx, table, owner.profile._id, before.name, a.docId);
        await ctx.db.patch(id as unknown as Id<"departures">, { name: before.name as string });
      } else {
        if (conNome(table)) await nomeLibero(ctx, table, owner.profile._id, before[CAMPO_NOME[table]], a.docId);
        const doc = table === "entries" ? await conKm(ctx, before) : before;
        await ctx.db.replace(id, doc as never);
      }
      nuova = { op: "update", table, docId: a.docId, summary: `annullato: ${a.summary}`, before: istantanea(prec as Record<string, unknown>), after: istantanea((await ctx.db.get(id)) as Record<string, unknown>), batchId };
    }
    const nuovaId = await logActivity(ctx, owner, { ...nuova, undoOf: a._id });
    await ctx.db.patch(a._id, { undoneBy: nuovaId });
    create.push(nuovaId);
  }
  return create;
}

/** Una voce che si può annullare: non di sistema, non già annullata, non del catalogo condiviso. */
export const annullabile = (a: Pick<Doc<"activity">, "actor" | "undoneBy" | "table">) =>
  !a.undoneBy && a.actor.via !== "sistema" && a.table !== "venues";
