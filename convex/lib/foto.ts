/* ──────────────────────────────────────────────────────────────
   Le foto di un evento viste dagli altri moduli (convex/foto.ts ha le
   funzioni; qui solo helper, senza export di funzioni Convex).

   Un concerto cancellato non porta via subito le sue foto: restano
   "orfane" (`orfanaDal`), fuori dalla pagina, così «Annulla» le rimette
   al concerto ripristinato (che ha un id nuovo: `rimappaFoto`). Dopo
   ORFANE_PER_MS un cron le cancella con i loro file.
   ────────────────────────────────────────────────────────────── */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Quanto aspetta una foto di un concerto cancellato prima di sparire (con i file). */
export const ORFANE_PER_MS = 30 * 24 * 3600_000;

/** Le foto (non orfane) di un evento, nell'ordine dell'evento. */
export async function fotoDiEvento(ctx: QueryCtx, profileId: Id<"profiles">, entryId: Id<"entries">): Promise<Doc<"foto">[]> {
  const righe = await ctx.db
    .query("foto")
    .withIndex("by_profile_entry", q => q.eq("profileId", profileId).eq("entryId", entryId))
    .collect();
  return righe.filter(f => f.orfanaDal === undefined);
}

/** Il concerto se n'è andato: le sue foto aspettano un Annulla. */
export async function orfanaFoto(ctx: MutationCtx, entryId: Id<"entries">) {
  const adesso = Date.now();
  for (const f of await ctx.db.query("foto").withIndex("by_entry", q => q.eq("entryId", entryId)).collect()) {
    if (f.orfanaDal === undefined) await ctx.db.patch(f._id, { orfanaDal: adesso });
  }
}

/** Annulla ha ricreato il concerto con un id nuovo: le sue foto tornano a lui. */
export async function rimappaFoto(ctx: MutationCtx, vecchio: string, nuovo: Id<"entries">) {
  const id = ctx.db.normalizeId("entries", vecchio);
  if (!id) return;
  for (const f of await ctx.db.query("foto").withIndex("by_entry", q => q.eq("entryId", id)).collect()) {
    await ctx.db.patch(f._id, { entryId: nuovo, orfanaDal: undefined });
  }
}

/** Cancella una foto e i suoi due file. */
export async function cancellaFoto(ctx: MutationCtx, f: Doc<"foto">) {
  for (const s of [f.file, f.miniatura]) if (await ctx.db.system.get(s)) await ctx.storage.delete(s);
  await ctx.db.delete(f._id);
}

/** Se un file di `_storage` è una foto o una miniatura (di chiunque). */
export async function fileDiFoto(ctx: QueryCtx, id: Id<"_storage">): Promise<boolean> {
  return (
    !!(await ctx.db.query("foto").withIndex("by_file", q => q.eq("file", id)).first()) ||
    !!(await ctx.db.query("foto").withIndex("by_miniatura", q => q.eq("miniatura", id)).first())
  );
}

/** L'eliminazione dell'account: al massimo `max` foto del profilo, con i file. Quante ne ha tolte. */
export async function cancellaFotoDelProfilo(ctx: MutationCtx, profileId: Id<"profiles">, max: number): Promise<number> {
  if (max <= 0) return 0;
  const righe = await ctx.db.query("foto").withIndex("by_profile_entry", q => q.eq("profileId", profileId)).take(max);
  for (const f of righe) await cancellaFoto(ctx, f);
  return righe.length;
}
