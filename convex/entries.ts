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

   Aperture (DECISIONI «Aperture»): un concerto con `aperturaDi` prende data,
   venue e partenza dal suo headliner e non ha km suoi; quando l'headliner
   cambia serata le aperture lo seguono nello stesso lotto, e quando se ne va
   restano scollegate (lib/aperture.ts).
   ────────────────────────────────────────────────────────────── */

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { isPlanned, todayKey } from "../shared/lib/dates.ts";
import { mancanoDi, type EventoPerMancano } from "../shared/lib/mancano.ts";
import { nessunInput } from "../shared/schema/campi.ts";
import {
  cancellaConcertoInput, elencaConcertiInput, entryInput, leggiConcertoInput, modificaConcertiInput, modificaConcertoInput,
} from "../shared/schema/entry.ts";
import { daProposta, nomiDa, salvaSchedaInput, type EntryPatch, type EventoEsterno, type RisultatoScheda } from "../shared/schema/proposta.ts";
import { istantanea, logActivity, nuovoBatch } from "./lib/activity.ts";
import { limitaAgente, ownerMutation, ownerQuery } from "./lib/builders.ts";
import { ConvexError } from "convex/values";
import { errore } from "./lib/errors.ts";
import { orfanaFoto } from "./lib/foto.ts";
import { allineaAperture, apertureDi, conSerata, scollegaAperture, serataCambiata } from "./lib/aperture.ts";
import { campiKm } from "./lib/km.ts";
import { creaMancanti } from "./lib/mancanti.ts";
import { getOwned, type Owner } from "./lib/owner.ts";
import {
  caricaRefs, campiDaInput, controllaSerata, esterno, headlinerDa, nomiPerEsterno, nuovoCid, partenzaDa, personeDa, regaloDa, tempoDi, venuesOf, type Refs,
} from "./lib/refs.ts";
import { venueOCrea } from "./lib/venueUtente.ts";

const etichetta = (e: { kind: string; artist?: string; name?: string; date: string }) => `${e.kind === "festival" ? e.name : e.artist} (${e.date})`;

/**
 * Cosa manca a un evento passato, come nel riquadro «Da completare» di
 * #concerti e negli avvisi della pagina: voto, posizione, canzoni note (per
 * concerto, anche nei festival) e partenza. [] se è in programma o completo.
 */
function mancanoDa(e: EventoPerMancano, today: number): string[] {
  return isPlanned(e, today) ? [] : mancanoDi(e, today, { prezzo: false });
}

async function inserisci(ctx: MutationCtx, owner: Owner, campi: Awaited<ReturnType<typeof campiDaInput>>, batchId?: string) {
  // un'apertura non ha km suoi: il viaggio è della serata (dell'headliner)
  const km = "aperturaDiId" in campi && campi.aperturaDiId ? {} : await campiKm(ctx, { profileId: owner.profile._id, departureId: campi.departureId, venueId: campi.venueId });
  const doc = Object.fromEntries(
    Object.entries({ ...campi, ...km, profileId: owner.profile._id, updatedAt: Date.now() }).filter(([, x]) => x !== undefined),
  ) as Omit<Doc<"entries">, "_id" | "_creationTime">;
  const id = await ctx.db.insert("entries", doc);
  const nuovo = await ctx.db.get(id);
  const activityId = await logActivity(ctx, owner, { op: "create", table: "entries", docId: id, batchId, summary: `aggiunto: ${etichetta(doc)}`, after: istantanea(nuovo) });
  return { id, kmPending: !!nuovo?.kmPending, activityId };
}

/**
 * L'headliner dopo la patch, se il concerto è (o diventa) un'apertura:
 * `aperturaDi` nuovo si risolve per nome e data, null scollega, assente
 * lascia il collegamento com'è. Un headliner con aperture non può diventare
 * a sua volta un'apertura.
 */
async function headlinerDopo(ctx: MutationCtx, owner: Owner, e: Doc<"entries">, patch: EntryPatch): Promise<Doc<"entries"> | undefined> {
  const nome = (patch as { aperturaDi?: string | null }).aperturaDi;
  if (nome === null) return undefined;
  if (nome === undefined) return e.aperturaDiId ? ((await ctx.db.get(e.aperturaDiId)) ?? undefined) : undefined;
  if (e.kind !== "concert") throw errore("input_non_valido", "aperturaDi: un festival non ha aperture e non apre altri concerti", { campo: "aperturaDi" });
  const v = await ctx.db.get(e.venueId);
  const h = await headlinerDa(ctx, owner.profile._id, nome, { date: patch.date ?? e.date, venue: patch.venue ?? v?.name, city: patch.city ?? v?.city }, { self: e._id });
  if (h._id !== e.aperturaDiId && (await apertureDi(ctx, e._id)).length) {
    throw errore("input_non_valido", "aperturaDi: questo concerto ha già delle aperture, quindi non può essere a sua volta un'apertura; scollegale prima", { campo: "aperturaDi" });
  }
  return h;
}

/** La modifica di un concerto o festival (update_concert e la scheda): restituisce la voce del registro. */
async function modificaEntry(ctx: MutationCtx, owner: Owner, e: Doc<"entries">, patch: EntryPatch, refs: Refs, batchId?: string) {
  const next: Record<string, unknown> = { ...e };
  const togli = (k: string, val: unknown) => {
    if (val === null) delete next[k];
    else if (val !== undefined) next[k] = val;
  };
  // un'apertura: data, venue e partenza sono dell'headliner (scritte uguali o assenti)
  const h = await headlinerDopo(ctx, owner, e, patch);
  if (h) {
    await controllaSerata(ctx, refs, h, { date: patch.date, venue: patch.venue, city: patch.city, from: patch.from });
    Object.assign(next, conSerata({}, h), { aperturaDiId: h._id });
    if (!h.departureId) delete next.departureId;
  } else {
    delete next.aperturaDiId;
    if (patch.date !== undefined) Object.assign(next, { date: patch.date, ...tempoDi(patch.date) });
    if (patch.venue !== undefined || patch.city !== undefined) {
      const v = await ctx.db.get(e.venueId);
      next.venueId = await venueOCrea(ctx, owner, patch.venue ?? v?.name ?? "", patch.city ?? v?.city ?? "");
    }
  }
  if (e.kind === "concert") {
    if (patch.name !== undefined || patch.concerts !== undefined) throw errore("input_non_valido", "name e concerts valgono solo per i festival", { campo: "patch" });
    togli("artist", patch.artist);
    togli("tour", patch.tour);
    if (patch.with !== undefined) next.with = personeDa(refs, patch.with, "patch.with");
    togli("voto", patch.voto);
    togli("vicinanza", patch.vicinanza);
    togli("canzoniNote", patch.canzoniNote);
  } else {
    if (patch.artist !== undefined || patch.tour !== undefined || patch.with !== undefined || patch.voto !== undefined || patch.vicinanza !== undefined || patch.canzoniNote !== undefined) {
      throw errore("input_non_valido", "in un festival artista, tour, compagni e voti stanno in concerts", { campo: "patch" });
    }
    togli("name", patch.name);
    if (patch.concerts !== undefined) {
      next.concerts = patch.concerts.map((c, i) => ({
        cid: e.concerts?.[i]?.cid ?? nuovoCid(),
        artist: c.artist,
        ...(c.tour !== undefined ? { tour: c.tour } : {}),
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
  if (!h && patch.from !== undefined) togli("departureId", patch.from === null ? null : partenzaDa(refs, patch.from));
  if (h) {
    // un'apertura non ha km suoi: il viaggio è della serata
    delete next.km;
    delete next.kmSource;
    delete next.kmPending;
  } else if (next.departureId !== e.departureId || next.venueId !== e.venueId || e.aperturaDiId) {
    // km: solo se cambiano partenza o venue (la coppia decide, sempre la stessa), o se un'apertura si scollega
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
  const dopo = (await ctx.db.get(e._id))!;
  // un headliner che cambia serata se la porta dietro le aperture, nello stesso
  // lotto; le loro voci vengono prima, così Annulla ripristina prima lui
  let lotto = batchId;
  if (e.kind === "concert" && !dopo.aperturaDiId && serataCambiata(e, dopo) && (await apertureDi(ctx, e._id)).length) {
    lotto ??= nuovoBatch();
    await allineaAperture(ctx, owner, dopo, lotto);
  }
  return await logActivity(ctx, owner, { op: "update", table: "entries", docId: e._id, batchId: lotto, summary: `modificato: ${etichetta(e)}`, before: istantanea(e), after: istantanea(dopo) });
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
    const nomi = await nomiPerEsterno(ctx, owner.profile._id, rows);
    let out = rows.map(e => {
      const est = esterno(e, nomi);
      const mancano = mancanoDa(est, today);
      return { ...est, daCompletare: mancano.length > 0, mancano };
    });
    if (f.da_completare) out = out.filter(e => e.daCompletare);
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
    const campi = await campiDaInput(ctx, refs, input, owner);
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

/**
 * La modifica in blocco (bulk_update_concerts): fino a MAX_MODIFICHE_BLOCCO
 * patch come quelle di update_concert, in una transazione e in un solo
 * lotto del registro (un undo le annulla tutte). Tutte o nessuna: al primo
 * errore non si scrive niente, e l'errore dice quale modifica (`indice`,
 * `campo` col prefisso `updates.<i>`). Ogni concerto conta una scrittura nel
 * limite `agentWrites`, come con update_concert.
 */
export const updateMany = ownerMutation({
  catalogOp: "bulk_update_concerts",
  input: modificaConcertiInput,
  handler: async (ctx, owner, { updates }) => {
    if (updates.length > 1) await limitaAgente(ctx, owner, updates.length - 1);
    const batchId = nuovoBatch();
    const refs = await caricaRefs(ctx, owner.profile._id);
    const ids: string[] = [];
    for (const [i, { id, patch }] of updates.entries()) {
      try {
        const e = await getOwned(ctx, owner, "entries", id);
        await modificaEntry(ctx, owner, e, patch, refs, batchId);
        ids.push(e._id as string);
      } catch (err) {
        if (!(err instanceof ConvexError) || !err.data || typeof err.data !== "object") throw err;
        const d = err.data as { code: Parameters<typeof errore>[0]; messaggio: string; campo?: string };
        const campo = d.campo ? (d.campo === "patch" || d.campo.startsWith("patch.") ? d.campo : `patch.${d.campo}`) : d.code === "not_found" ? "id" : undefined;
        throw errore(d.code, `updates.${i}: ${d.messaggio} (nessuna modifica salvata)`, {
          ...(err.data as Record<string, string | number | boolean | string[]>),
          messaggio: undefined,
          code: undefined,
          campo: campo ? `updates.${i}.${campo}` : `updates.${i}`,
          indice: i,
        });
      }
    }
    return { modificati: ids.length, ids, batchId };
  },
});

export const remove = ownerMutation({
  catalogOp: "delete_concert",
  input: cancellaConcertoInput,
  handler: async (ctx, owner, { id }) => {
    const e = await getOwned(ctx, owner, "entries", id);
    // le aperture restano, scollegate, nello stesso lotto: Annulla le ricollega
    const batchId = e.kind === "concert" && (await apertureDi(ctx, e._id)).length ? nuovoBatch() : undefined;
    const scollegate = batchId ? await scollegaAperture(ctx, owner, e, batchId) : 0;
    // le foto aspettano un Annulla per 30 giorni (lib/foto.ts)
    await orfanaFoto(ctx, e._id);
    await ctx.db.delete(e._id);
    // le coppie km restano: riaggiungere il concerto darà lo stesso km
    await logActivity(ctx, owner, { op: "delete", table: "entries", docId: e._id, batchId, summary: `cancellato: ${etichetta(e)}`, before: istantanea(e) });
    return { ok: true as const, ...(scollegate ? { aperture_scollegate: scollegate } : {}) };
  },
});

/**
 * #concerti: le venue del proprietario (ognuno ha le sue), per scegliere
 * quella del concerto nel modulo (nome e città; le coordinate restano alla
 * mappa pubblica). Una venue nuova nasce da geo.searchVenue (o
 * geo.cercaIndirizzoVenue) → venues.createFromCandidate, oppure al
 * salvataggio col nome scritto (lib/venueUtente.ts).
 */
export const venueCatalogo = ownerQuery({
  dashboardOnly: "modulo dei concerti: elenco delle venue del proprietario (gli agenti usano search_venue)",
  input: nessunInput,
  handler: async (ctx, owner) => ({
    venues: (await venuesOf(ctx, owner.profile._id))
      .map(v => ({ id: v._id as string, name: v.name, city: v.city }))
      .sort((a, b) => a.name.localeCompare(b.name, "it") || a.city.localeCompare(b.city, "it")),
  }),
});

/**
 * Il Salva della scheda dell'Oracolo (propose_concert, dopo il sì del
 * proprietario nella chat). Una transazione, un lotto: i nomi nuovi
 * (persone, "regalato da", partenza solo col nome), poi il concerto,
 * aggiunto o modificato, con i km subito (o in attesa della posizione di
 * una venue nuova, che nasce qui fuori dal lotto). Gli errori non ripetono valori. Niente limite `agentWrites`: l'Oracolo non è un agente.
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
    const creati = await creaMancanti(ctx, owner, refs, nomiDa(n), batchId, "dal Tour manager");
    let id: Doc<"entries">["_id"];
    let activityId: string;
    if (n.azione === "aggiungi") {
      const campi = await campiDaInput(ctx, refs, n.input, owner);
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
