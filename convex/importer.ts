/* ──────────────────────────────────────────────────────────────
   Import CSV/JSON (PIANO §5.10, traguardo 7). Il formato lo legge
   shared/import.ts; qui si controllano i riferimenti e si scrive.

   - `preview` (dashboard): valida TUTTE le righe, formato e riferimenti,
     senza scrivere niente; dice quante voci, quali errori (per riga, senza
     ripetere valori) e quali persone e "regalato da" nasceranno.
   - `apply` (import_concerts): rifà la stessa validazione e, solo se è
     tutto valido, scrive a lotti (una mutation per lotto) con UN solo
     `batchId`. Sopra CONFIRM_IMPORT_ROWS righe vuole `confirm: true`.
     Se un lotto fallisce a metà l'import si ferma e risponde "importate N
     di M, annullabili": Annulla per batchId toglie anche un lotto parziale.
   - Persone e "regalato da" sconosciuti nascono nello stesso lotto (e si
     annullano con lui): all'onboarding l'elenco è ancora vuoto. Anche le
     venue fuori catalogo nascono, col nome scritto (lib/venueUtente.ts,
     fuori dal lotto: il catalogo non si annulla); l'anteprima le elenca.
     Le partenze invece devono esistere: le crea il proprietario
     (#partenze o add_departure).
   - Un agente consuma `agentWrites`: 1 per lotto.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { analizzaImport, serveConferma, type ErroreRiga, type VoceImport } from "../shared/import.ts";
import type { EntryInput } from "../shared/schema/entry.ts";
import { CONFIRM_IMPORT_ROWS, importaConcertiInput } from "../shared/schema/importFormat.ts";
import { istantanea, logActivity, nuovoBatch } from "./lib/activity.ts";
import { internalMutation, internalQuery, limitaAgente, ownerAction, ownerQuery } from "./lib/builders.ts";
import { codiceDi, errore } from "./lib/errors.ts";
import { campiKm } from "./lib/km.ts";
import { creaMancanti } from "./lib/mancanti.ts";
import { caricaRefs, campiDaInput, chiave, venuePerNome } from "./lib/refs.ts";
import { sembraIndirizzoCivico } from "../shared/lib/nomi.ts";

/** Voci per mutation: ogni voce legge i riferimenti e scrive concerto e registro. */
export const LOTTO_IMPORT = 25;
const MAX_ERRORI = 20;

/* ── riferimenti ──────────────────────────────────────────────── */

interface Verifica {
  errori: ErroreRiga[];
  nuovePersone: string[];
  nuoviRegali: string[];
  /** «Nome (Città)» delle venue che nasceranno. */
  nuoveVenue: string[];
}

const nomiDi = (e: EntryInput) => (e.kind === "concert" ? e.with : e.concerts.flatMap(c => c.with));

/** I riferimenti di ogni voce: le partenze devono esistere, persone, "regalato da" e venue possono nascere. */
async function verificaRiferimenti(ctx: QueryCtx, profileId: Id<"profiles">, voci: VoceImport[]): Promise<Verifica> {
  const refs = await caricaRefs(ctx, profileId);
  const errori: ErroreRiga[] = [];
  const persone = new Map<string, string>();
  const regali = new Map<string, string>();
  const venue = new Map<string, string>();
  const venueViste = new Set<string>();
  for (const { righe, entry } of voci) {
    for (const n of nomiDi(entry)) if (!refs.people.has(chiave(n))) persone.set(chiave(n), n);
    if (entry.giftFrom && !refs.gifters.has(chiave(entry.giftFrom))) regali.set(chiave(entry.giftFrom), entry.giftFrom);
    if (entry.from && !refs.departures.has(chiave(entry.from))) {
      errori.push({
        riga: righe[0], campo: "partenza",
        messaggio: `partenza sconosciuta: aggiungila in #partenze (o con add_departure). Partenze valide: ${refs.departureNames.join(", ") || "nessuna"}`,
      });
    }
    const kv = `${chiave(entry.venue)}\u0000${chiave(entry.city)}`;
    if (!venueViste.has(kv)) {
      venueViste.add(kv);
      if (!(await venuePerNome(ctx, entry.venue, entry.city))) {
        // il catalogo è pubblico: un indirizzo non ci entra (lib/venueUtente.ts)
        if (sembraIndirizzoCivico(entry.venue)) {
          errori.push({ riga: righe[0], campo: "venue", messaggio: "venue: sembra un indirizzo (via e numero civico); scrivi il nome del locale, il catalogo delle venue è pubblico" });
        } else venue.set(kv, `${entry.venue.trim()} (${entry.city.trim()})`);
      }
    }
  }
  return { errori, nuovePersone: [...persone.values()], nuoviRegali: [...regali.values()], nuoveVenue: [...venue.values()] };
}

/** Un errore con le righe sbagliate (al massimo 20), senza valori. */
function erroreRighe(errori: ErroreRiga[], righe: number) {
  const elenco = errori.slice(0, MAX_ERRORI).map(e => (e.riga ? `riga ${e.riga}: ${e.messaggio}` : e.messaggio));
  const altri = errori.length > MAX_ERRORI ? ` (e altri ${errori.length - MAX_ERRORI})` : "";
  return errore("input_non_valido", `import non valido: ${errori.length} errori su ${righe} righe${altri}; nessuna riga importata`, { righe: elenco });
}

/** Valori Convex puliti (niente chiavi undefined) per gli argomenti delle funzioni interne. */
const pulite = (voci: VoceImport[]) => JSON.parse(JSON.stringify(voci)) as VoceImport[];

/* ── anteprima (dashboard) ───────────────────────────────────── */

export const preview = ownerQuery({
  dashboardOnly: "anteprima dell'upload nella dashboard: gli agenti usano import_concerts, che valida tutto prima di scrivere",
  input: importaConcertiInput,
  handler: async (ctx, owner, { formato, contenuto }) => {
    const analisi = analizzaImport(formato, contenuto);
    const verifica = await verificaRiferimenti(ctx, owner.profile._id, analisi.voci);
    const errori = [...analisi.errori, ...verifica.errori].sort((a, b) => a.riga - b.riga);
    return {
      righe: analisi.righe,
      voci: analisi.voci.length,
      festival: analisi.voci.filter(x => x.entry.kind === "festival").length,
      concerti: analisi.voci.reduce((n, x) => n + (x.entry.kind === "concert" ? 1 : x.entry.concerts.length), 0),
      errori: errori.slice(0, 200),
      nuovePersone: verifica.nuovePersone,
      nuoviRegali: verifica.nuoviRegali,
      nuoveVenue: verifica.nuoveVenue,
      serveConferma: serveConferma(analisi.righe),
      sogliaConferma: CONFIRM_IMPORT_ROWS,
    };
  },
});

/* ── import ──────────────────────────────────────────────────── */

export const verifica = internalQuery({
  args: { profileId: v.id("profiles"), voci: v.any() },
  handler: async (ctx, { profileId, voci }): Promise<Verifica> => await verificaRiferimenti(ctx, profileId, voci as VoceImport[]),
});

const etichetta = (e: EntryInput) => `${e.kind === "festival" ? e.name : e.artist} (${e.date})`;

/** Un lotto: persone e "regalato da" mancanti, poi i concerti, tutti con lo stesso batchId. */
export const scriviLotto = internalMutation({
  args: {
    profileId: v.id("profiles"),
    actor: v.object({ via: v.union(v.literal("dashboard"), v.literal("oracolo"), v.literal("mcp"), v.literal("apikey")), label: v.string() }),
    batchId: v.string(),
    voci: v.any(),
  },
  handler: async (ctx, { profileId, actor, batchId, voci }): Promise<number> => {
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.status !== "active") throw errore("no_profile", "il profilo non è più attivo", { fix: "/benvenuto" });
    const owner = { profile, actor };
    const refs = await caricaRefs(ctx, profileId);
    let scritte = 0;
    for (const { entry } of voci as VoceImport[]) {
      // persone e "regalato da" mancanti nascono nel lotto (lib/mancanti.ts), le venue in campiDaInput; le partenze no: devono esistere
      await creaMancanti(ctx, owner, refs, { persone: nomiDi(entry), ...(entry.giftFrom ? { regalo: entry.giftFrom } : {}) }, batchId, "dall'import");
      const campi = await campiDaInput(ctx, refs, entry, owner);
      const km = await campiKm(ctx, { profileId, departureId: campi.departureId, venueId: campi.venueId });
      const doc = Object.fromEntries(
        Object.entries({ ...campi, ...km, profileId, updatedAt: Date.now() }).filter(([, x]) => x !== undefined),
      ) as Omit<Doc<"entries">, "_id" | "_creationTime">;
      const id = await ctx.db.insert("entries", doc);
      await logActivity(ctx, owner, { op: "create", table: "entries", docId: id, batchId, summary: `importato: ${etichetta(entry)}`, after: istantanea(await ctx.db.get(id)) });
      scritte++;
    }
    return scritte;
  },
});

const caricaProfilo = async (ctx: ActionCtx, userId: string): Promise<Doc<"profiles"> | null> =>
  await ctx.runQuery(internal.profiles.byAuthUser, { authUserId: userId });

/** L'esito di import_concerts: `parziale` se un lotto è fallito dopo che altri erano già scritti. */
export interface EsitoImport {
  importate: number;
  totale: number;
  batchId: string;
  personeAggiunte?: number;
  regaliAggiunti?: number;
  venueAggiunte?: number;
  parziale?: true;
  messaggio?: string;
  errore?: { code: string; messaggio: string };
}

export const apply = ownerAction({
  catalogOp: "import_concerts",
  input: importaConcertiInput,
  loadProfile: caricaProfilo,
  handler: async (ctx, owner, { formato, contenuto, confirm }): Promise<EsitoImport> => {
    const analisi = analizzaImport(formato, contenuto);
    if (analisi.errori.length) throw erroreRighe(analisi.errori, analisi.righe);
    if (!analisi.voci.length) throw errore("input_non_valido", "nessun concerto da importare", { campo: "contenuto" });
    const voci = pulite(analisi.voci);
    const controllo: Verifica = await ctx.runQuery(internal.importer.verifica, { profileId: owner.profile._id, voci });
    if (controllo.errori.length) throw erroreRighe(controllo.errori.sort((a, b) => a.riga - b.riga), analisi.righe);
    if (serveConferma(analisi.righe) && confirm !== true) {
      throw errore("input_non_valido", `l'import ha ${analisi.righe} righe (${voci.length} concerti o festival): sopra le ${CONFIRM_IMPORT_ROWS} chiedi conferma all'utente e ripeti con confirm: true`, { campo: "confirm" });
    }

    const batchId = nuovoBatch();
    const actor = { via: owner.actor.via as "dashboard" | "oracolo" | "mcp" | "apikey", label: owner.actor.label };
    let importate = 0;
    for (let i = 0; i < voci.length; i += LOTTO_IMPORT) {
      const lotto = voci.slice(i, i + LOTTO_IMPORT);
      try {
        await limitaAgente(ctx, owner, 1);
        const scritte: number = await ctx.runMutation(internal.importer.scriviLotto, { profileId: owner.profile._id, actor, batchId, voci: lotto });
        importate += scritte;
      } catch (e) {
        if (importate === 0) throw e;
        // i lotti già scritti restano, con il loro batchId: si annullano insieme
        const motivo = (e as { data?: { messaggio?: unknown } }).data?.messaggio;
        return {
          importate,
          totale: voci.length,
          batchId,
          parziale: true,
          messaggio: `importate ${importate} di ${voci.length}, annullabili: annulla il lotto dal registro (#attivita) o con undo`,
          errore: { code: codiceDi(e) ?? "non_disponibile", messaggio: typeof motivo === "string" ? motivo : "errore durante la scrittura" },
        };
      }
    }
    return { importate, totale: voci.length, batchId, personeAggiunte: controllo.nuovePersone.length, regaliAggiunti: controllo.nuoviRegali.length, venueAggiunte: controllo.nuoveVenue.length };
  },
});
