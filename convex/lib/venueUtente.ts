/* ──────────────────────────────────────────────────────────────
   Una venue scritta per nome dal proprietario (scheda, modulo, MCP,
   import): se nome+città non sono nel catalogo condiviso, la venue nasce
   qui così com'è stata scritta (source "utente", DECISIONI «Venue per
   nome»), senza coordinate. La posizione la cerca subito dopo il server
   su OpenStreetMap con «nome, città» (geo.posizioneVenue): il luogo se
   c'è, altrimenti il centro della città; mai un punto scelto da chi
   scrive. Per questo riusare una venue per nome+città resta sicuro: chi
   scrive lo stesso nome nella stessa città ottiene la stessa ricerca.

   La creazione si registra fuori dal lotto della scrittura (come
   add_venue): il catalogo condiviso non si annulla, e Annulla sul
   concerto toglie il concerto e lascia la venue.
   ────────────────────────────────────────────────────────────── */

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { sembraIndirizzoCivico } from "../../shared/lib/nomi.ts";
import { rateLimiter } from "../rateLimits.ts";
import { logActivity } from "./activity.ts";
import { errore } from "./errors.ts";
import type { AutoreLotto } from "./mancanti.ts";
import { chiave, venuePerNome } from "./refs.ts";

/** La venue con questo nome e città: quella del catalogo, o una nuova con la posizione da cercare. */
export async function venueOCrea(ctx: MutationCtx, autore: AutoreLotto, name: string, city: string): Promise<Id<"venues">> {
  const esistente = await venuePerNome(ctx, name, city);
  if (esistente) return esistente._id;
  const nome = name.trim();
  const citta = city.trim();
  // il catalogo è pubblico: un indirizzo (magari di casa) non ci entra
  if (sembraIndirizzoCivico(nome)) {
    throw errore("input_non_valido", "venue: sembra un indirizzo (via e numero civico); scrivi il nome del locale, il catalogo delle venue è pubblico", { campo: "venue" });
  }
  const r = await rateLimiter.limit(ctx, "venueNuove", { key: autore.profile._id });
  if (!r.ok) throw errore("limite_superato", "troppe venue nuove in un'ora: riprova più tardi", { campo: "venue", retryAfter: Math.ceil(r.retryAfter / 1000) });
  const id = await ctx.db.insert("venues", {
    name: nome,
    city: citta,
    nameKey: chiave(nome),
    cityKey: chiave(citta),
    source: "utente",
    posizione: "attesa",
    createdBy: autore.profile._id,
  });
  // solo l'id allo scheduler: nome e città li rilegge il job
  await ctx.scheduler.runAfter(0, internal.geo.posizioneVenue, { venueId: id, tentativo: 0 });
  await logActivity(ctx, autore, { op: "create", table: "venues", docId: id, summary: `venue aggiunta al catalogo: ${nome} (${citta})` });
  return id;
}
