/* ──────────────────────────────────────────────────────────────
   Una venue scritta per nome dal proprietario (scheda, modulo, MCP,
   import): se nome+città non sono tra le venue del profilo, la venue
   nasce qui così com'è stata scritta (source "utente", DECISIONI «Venue
   per nome» e «Venue per profilo»), senza coordinate. La posizione la
   cerca subito dopo il server su OpenStreetMap con «nome, città»
   (geo.posizioneVenue): il luogo se c'è, altrimenti il centro della
   città; mai un punto scelto da chi scrive.

   La creazione si registra fuori dal lotto della scrittura (come
   add_venue): Annulla sul concerto toglie il concerto e lascia la venue.
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

/** Il nome di una venue va sulla pagina pubblica: un indirizzo (magari di casa) no. */
export function controllaNomeVenue(nome: string, campo = "venue") {
  if (sembraIndirizzoCivico(nome)) {
    throw errore("input_non_valido", `${campo}: sembra un indirizzo (via e numero civico); scrivi il nome del posto, le venue sono pubbliche sulla pagina`, { campo });
  }
}

/** La venue del profilo con questo nome e città, o una nuova con la posizione da cercare. */
export async function venueOCrea(ctx: MutationCtx, autore: AutoreLotto, name: string, city: string): Promise<Id<"venues">> {
  const esistente = await venuePerNome(ctx, autore.profile._id, name, city);
  if (esistente) return esistente._id;
  const nome = name.trim();
  const citta = city.trim();
  controllaNomeVenue(nome);
  const r = await rateLimiter.limit(ctx, "venueNuove", { key: autore.profile._id });
  if (!r.ok) throw errore("limite_superato", "troppe venue nuove in un'ora: riprova più tardi", { campo: "venue", retryAfter: Math.ceil(r.retryAfter / 1000) });
  const id = await ctx.db.insert("venues", {
    profileId: autore.profile._id,
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
  await logActivity(ctx, autore, { op: "create", table: "venues", docId: id, summary: `venue aggiunta: ${nome} (${citta})` });
  return id;
}
