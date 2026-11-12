/* ──────────────────────────────────────────────────────────────
   Le aperture (opening act, DECISIONI «Aperture»): un concerto con
   `aperturaDiId` è l'apertura di un altro concerto della stessa serata.

   - Data, venue e partenza sono sempre quelle dell'headliner: le impone
     ogni scrittura (refs.ts `campiDaInput`, entries.ts `modificaEntry`) e
     qui `allineaAperture` le propaga quando cambiano sull'headliner.
   - Niente km: il viaggio è della serata, quindi l'apertura non ha
     km/kmSource/kmPending (e i ricalcoli di sistema la saltano).
   - Cancellare l'headliner scollega le aperture (`scollegaAperture`): restano
     concerti normali con data, venue e partenza della serata e i km della
     stessa coppia salvata in lib/km.ts (nessuna estrazione nuova), nello stesso lotto
     della cancellazione, così Annulla le ricollega.
   - Annulla: un'apertura ripristinata si riallinea al suo headliner
     (`riallineaApertura`), e un headliner non torna a una serata diversa da
     quella delle aperture collegate dopo (`controllaAperture`).
   ────────────────────────────────────────────────────────────── */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { istantanea, logActivity } from "./activity.ts";
import { errore } from "./errors.ts";
import { campiKm } from "./km.ts";
import type { Owner } from "./owner.ts";
import { serataDi } from "./refs.ts";

type Ctx = QueryCtx | MutationCtx;

/** Le aperture collegate a un headliner. */
export async function apertureDi(ctx: Ctx, headlinerId: Id<"entries">) {
  return await ctx.db.query("entries").withIndex("by_apertura", q => q.eq("aperturaDiId", headlinerId)).collect();
}

const CAMPI_KM = ["km", "kmSource", "kmPending"] as const;

/** Un documento d'apertura con la serata dell'headliner e senza km. */
export function conSerata<T extends Record<string, unknown>>(doc: T, h: Doc<"entries">): T {
  const out: Record<string, unknown> = { ...doc, ...serataDi(h) };
  for (const k of CAMPI_KM) delete out[k];
  if (out.departureId === undefined) delete out.departureId;
  return out as T;
}

/** true se data, venue o partenza di due versioni di un concerto differiscono. */
export const serataCambiata = (a: Pick<Doc<"entries">, "date" | "venueId" | "departureId">, b: Pick<Doc<"entries">, "date" | "venueId" | "departureId">) =>
  a.date !== b.date || a.venueId !== b.venueId || a.departureId !== b.departureId;

const senzaSistema = (d: Doc<"entries">) => {
  const { _id, _creationTime, ...doc } = d;
  void _id;
  void _creationTime;
  return doc;
};

/**
 * L'headliner ha cambiato serata: ogni apertura prende la sua nuova data,
 * venue e partenza, con una voce del registro nel lotto `batchId`. Va
 * chiamata PRIMA di registrare la modifica dell'headliner: Annulla rifà le
 * voci dalla più recente, quindi ripristina prima l'headliner e poi le
 * aperture, che si riallineano a lui.
 */
export async function allineaAperture(ctx: MutationCtx, owner: Owner, h: Doc<"entries">, batchId: string) {
  for (const a of await apertureDi(ctx, h._id)) {
    if (!serataCambiata(a, h)) continue;
    await ctx.db.replace(a._id, { ...conSerata(senzaSistema(a), h), updatedAt: Date.now() });
    await logActivity(ctx, owner, {
      op: "update", table: "entries", docId: a._id, batchId,
      summary: `serata allineata all'headliner: ${a.artist ?? "?"} (${h.date})`,
      before: istantanea(a), after: istantanea(await ctx.db.get(a._id)),
    });
  }
}

/**
 * L'headliner se ne va: le sue aperture restano concerti normali, scollegati,
 * con data, venue e partenza della serata e i km della stessa coppia
 * (partenza, venue) salvata in lib/km.ts. Voci nel lotto `batchId`, prima della
 * cancellazione.
 */
export async function scollegaAperture(ctx: MutationCtx, owner: Owner, h: Doc<"entries">, batchId: string) {
  const aperture = await apertureDi(ctx, h._id);
  for (const a of aperture) {
    const { aperturaDiId, ...resto } = senzaSistema(a);
    void aperturaDiId;
    const km = await campiKm(ctx, { profileId: a.profileId, departureId: a.departureId, venueId: a.venueId });
    const doc = Object.fromEntries(Object.entries({ ...resto, ...km, updatedAt: Date.now() }).filter(([, x]) => x !== undefined));
    await ctx.db.replace(a._id, doc as Omit<Doc<"entries">, "_id" | "_creationTime">);
    await logActivity(ctx, owner, {
      op: "update", table: "entries", docId: a._id, batchId,
      summary: `scollegata dall'headliner cancellato: ${a.artist ?? "?"} (${a.date})`,
      before: istantanea(a), after: istantanea(await ctx.db.get(a._id)),
    });
  }
  return aperture.length;
}

/** L'headliner valido di un documento d'apertura (stesso profilo, concerto singolo, non un'apertura) o un conflitto. */
async function headlinerValido(ctx: MutationCtx, doc: Record<string, unknown>) {
  const id = ctx.db.normalizeId("entries", String(doc.aperturaDiId));
  const h = id ? await ctx.db.get(id) : null;
  if (!h || h.profileId !== doc.profileId || h.kind !== "concert" || h.aperturaDiId) {
    throw errore("conflitto", "il concerto di cui era l'apertura non c'è più o non è più un concerto singolo: annulla prima quella modifica");
  }
  return h;
}

/** Annulla: un'apertura ripristinata torna nella serata del suo headliner, senza km. */
export async function riallineaApertura(ctx: MutationCtx, doc: Record<string, unknown>) {
  return conSerata(doc, await headlinerValido(ctx, doc));
}

/**
 * Annulla: dopo il ripristino, ogni apertura collegata a questo concerto è
 * nella sua serata. Se no (un'apertura collegata dopo la modifica che si
 * annulla) è un conflitto, e la transazione non scrive niente.
 */
export async function controllaAperture(ctx: MutationCtx, id: Id<"entries">) {
  const h = await ctx.db.get(id);
  if (!h) return;
  const aperture = await apertureDi(ctx, id);
  if (!aperture.length) return;
  if (h.kind !== "concert" || h.aperturaDiId || aperture.some(a => serataCambiata(a, h))) {
    throw errore("conflitto", `modificato dopo: ${aperture.length === 1 ? "un'apertura è stata collegata" : `${aperture.length} aperture sono state collegate`} a questo concerto; scollegale o annulla prima quelle modifiche`);
  }
}
