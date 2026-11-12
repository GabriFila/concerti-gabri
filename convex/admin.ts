/* ──────────────────────────────────────────────────────────────
   Amministrazione (PIANO §5.6).

   La vista admin in sola lettura (DECISIONI «Vista admin», 2026-11-12):
   `profili`, `profilo` e `registraAccesso` nascono da adminQuery /
   adminMutation (lib/builders.ts): solo la sessione di un utente in
   ADMIN_USER_IDS, chiunque altro (token agente e `as: "oracolo"`
   compresi) riceve `not_found`. Danno handle, stato, conteggi, il registro
   e i metadati delle chat; MAI email, indirizzi o coordinate delle
   partenze (le partenze sono nome e "indirizzo impostato sì/no", dal
   campo `hasAddress`), chiavi, token o hash, il testo delle chat private.
   I `returns` espliciti fanno da elenco chiuso: un campo in più non esce.
   `registraAccesso` è l'unica scrittura: una riga in `adminAccessi` per
   pagina aperta, fuori da `activity` (che è dell'utente e alimenta
   l'«Annulla»).

   Il resto sono funzioni interne, cioè `convex run` con la chiave admin
   del deployment.

   `claimProfile({handle, email})` lega un profilo senza proprietario (il
   seed di `gabrifila`) all'account di chi ha fatto il primo login con
   quell'email, in un'unica mutation:
   - l'utente si trova per email nel componente Better Auth;
   - il suo profilo `onboarding` vuoto, creato dal primo login, si cancella;
     se quel profilo ha già un handle o dei dati, si rifiuta (niente
     perdite silenziose);
   - il profilo del seed riceve `authUserId`.
   Rilanciarla sullo stesso account non cambia niente.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import { z } from "zod";
import { nessunInput } from "../shared/schema/campi.ts";
import { VISTE_ADMIN } from "../shared/schema/tables.ts";
import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { adminMutation, adminQuery, internalMutation, internalQuery } from "./lib/builders.ts";
import { ETICHETTE_ATTORE, profileOfUser } from "./lib/owner.ts";

/** true se il profilo ha almeno un dato suo (concerti, persone, partenze, regali, wishlist, registro, chat, alias). */
async function haDati(ctx: MutationCtx, profileId: Id<"profiles">): Promise<boolean> {
  const db = ctx.db;
  const trovati = await Promise.all([
    db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", profileId)).first(),
    db.query("people").withIndex("by_profile_name", q => q.eq("profileId", profileId)).first(),
    db.query("departures").withIndex("by_profile", q => q.eq("profileId", profileId)).first(),
    db.query("gifters").withIndex("by_profile", q => q.eq("profileId", profileId)).first(),
    db.query("wishlist").withIndex("by_profile_ordine", q => q.eq("profileId", profileId)).first(),
    db.query("activity").withIndex("by_profile_at", q => q.eq("profileId", profileId)).first(),
    db.query("chatThreads").withIndex("by_profile_visibility_updatedAt", q => q.eq("profileId", profileId)).first(),
    db.query("handleAliases").withIndex("by_profile", q => q.eq("profileId", profileId)).first(),
  ]);
  return trovati.some(Boolean);
}

export const claimProfile = internalMutation({
  args: { handle: v.string(), email: v.string() },
  returns: v.object({ profileId: v.id("profiles"), giaLegato: v.boolean() }),
  handler: async (ctx, { handle, email }) => {
    const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email.trim().toLowerCase() }],
    })) as { _id: string } | null;
    if (!user) throw new Error("claimProfile: nessun utente con questa email (serve prima un login)");

    const target = await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", handle)).first();
    if (!target) throw new Error("claimProfile: nessun profilo con questo handle");
    if (target.authUserId === user._id) return { profileId: target._id, giaLegato: true };
    if (target.authUserId) throw new Error("claimProfile: il profilo è già legato a un altro account");

    const suo = await profileOfUser(ctx, user._id);
    if (suo) {
      if (suo.status !== "onboarding" || suo.handle || (await haDati(ctx, suo._id))) {
        throw new Error("claimProfile: l'account ha già un profilo con handle o dati; non lo cancello");
      }
      await ctx.db.delete(suo._id);
    }
    await ctx.db.patch(target._id, { authUserId: user._id });
    return { profileId: target._id, giaLegato: false };
  },
});

/* ── vista admin (sola lettura) ─────────────────────────────────── */

const MOTIVO = "vista admin in sola lettura (/admin), solo per gli utenti in ADMIN_USER_IDS";

/** Fin dove si contano le chat di un profilo per visibilità (ogni thread si legge intero, messaggi compresi). */
export const TETTO_CHAT = 200;
/** Le righe del registro e i thread mostrati nel dettaglio. */
export const RIGHE_REGISTRO = 50;
export const THREAD_DETTAGLIO = 50;

const visibilita = v.union(v.literal("pubblica"), v.literal("proprietario"));
const nullable = <T extends Parameters<typeof v.union>[0]>(x: T) => v.union(x, v.null());

const campiProfilo = {
  _id: v.id("profiles"),
  handle: nullable(v.string()),
  displayName: nullable(v.string()),
  status: v.union(v.literal("onboarding"), v.literal("active")),
  _creationTime: v.number(),
  ultimaAttivita: nullable(v.number()),
  conteggi: v.object({
    eventi: v.number(),
    concerti: v.number(),
    persone: v.number(),
    foto: v.number(),
    wishlist: v.number(),
    chatPubbliche: v.number(),
    chatPrivate: v.number(),
    /** true se una delle due visibilità ha più di TETTO_CHAT thread (il numero è il tetto) */
    chatOltre: v.boolean(),
  }),
  // solo il nome e se l'indirizzo c'è (departures.hasAddress): l'indirizzo non si legge mai
  partenze: v.array(v.object({ nome: v.string(), indirizzo: v.boolean() })),
  sezioniNascoste: v.array(v.string()),
};
const voceProfilo = v.object(campiProfilo);

const voceRegistro = v.object({
  at: v.number(),
  autore: v.string(),
  via: v.union(v.literal("dashboard"), v.literal("oracolo"), v.literal("mcp"), v.literal("apikey"), v.literal("sistema")),
  op: v.string(),
  riassunto: v.string(),
  annullata: v.boolean(),
});

/** I metadati di un thread: titolo e autore solo per i pubblici (già pubblici su chat.listThreads), mai i messaggi. */
const voceThread = v.object({
  visibility: visibilita,
  messaggi: v.number(),
  creata: v.number(),
  aggiornata: v.number(),
  scade: v.number(),
  titolo: v.optional(v.string()),
  autore: v.optional(v.string()),
});

const dettaglioProfilo = v.object({ ...campiProfilo, registro: v.array(voceRegistro), chat: v.array(voceThread) });

/** I concerti di una riga, come flatConcerts: un concerto è sé stesso, un festival i suoi concerti. */
export const concertiDi = (righe: Doc<"entries">[]) => righe.reduce((n, e) => n + (e.kind === "festival" ? (e.concerts?.length ?? 0) : 1), 0);

const vivo = (t: Doc<"chatThreads">, now: number) => t.expiresAt > now && t.messages.length > 0;

/** Le chat vive di un profilo per visibilità, dalla più recente, al massimo TETTO_CHAT + 1 lette. */
async function chatDi(ctx: QueryCtx, profileId: Id<"profiles">, visibility: Doc<"chatThreads">["visibility"], now: number) {
  const righe = await ctx.db
    .query("chatThreads")
    .withIndex("by_profile_visibility_updatedAt", q => q.eq("profileId", profileId).eq("visibility", visibility))
    .order("desc")
    .take(TETTO_CHAT + 1);
  const oltre = righe.length > TETTO_CHAT;
  return { vive: righe.slice(0, TETTO_CHAT).filter(t => vivo(t, now)), oltre };
}

/** I campi di un profilo per la vista admin (e le sue chat, che il dettaglio riusa). */
async function schedaProfilo(ctx: QueryCtx, p: Doc<"profiles">, now: number) {
  const id = p._id;
  const [entries, persone, foto, wishlist, partenze, ultima, pubbliche, private_] = await Promise.all([
    ctx.db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", id)).collect(),
    ctx.db.query("people").withIndex("by_profile_name", q => q.eq("profileId", id)).collect(),
    ctx.db.query("foto").withIndex("by_profile_entry", q => q.eq("profileId", id)).collect(),
    ctx.db.query("wishlist").withIndex("by_profile_ordine", q => q.eq("profileId", id)).collect(),
    ctx.db.query("departures").withIndex("by_profile", q => q.eq("profileId", id)).collect(),
    ctx.db.query("activity").withIndex("by_profile_at", q => q.eq("profileId", id)).order("desc").first(),
    chatDi(ctx, id, "pubblica", now),
    chatDi(ctx, id, "proprietario", now),
  ]);
  const scheda = {
    _id: id,
    handle: p.handle ?? null,
    displayName: p.displayName ?? null,
    status: p.status,
    _creationTime: p._creationTime,
    ultimaAttivita: ultima?.at ?? null,
    conteggi: {
      eventi: entries.length,
      concerti: concertiDi(entries),
      persone: persone.length,
      foto: foto.length,
      wishlist: wishlist.length,
      chatPubbliche: pubbliche.vive.length,
      chatPrivate: private_.vive.length,
      chatOltre: pubbliche.oltre || private_.oltre,
    },
    partenze: partenze.map(d => ({ nome: d.name, indirizzo: d.hasAddress })),
    sezioniNascoste: [...p.layout.nascoste],
  };
  return { scheda, chat: [...pubbliche.vive, ...private_.vive] };
}

const handleInput = z.string().trim().toLowerCase().max(64).describe("Handle della pagina");

export const profili = adminQuery({
  adminOnly: MOTIVO,
  input: nessunInput,
  returns: v.array(voceProfilo),
  handler: async ctx => {
    const now = Date.now();
    const tutti = await ctx.db.query("profiles").order("desc").collect();
    return await Promise.all(tutti.map(async p => (await schedaProfilo(ctx, p, now)).scheda));
  },
});

export const profilo = adminQuery({
  adminOnly: MOTIVO,
  input: z.object({ handle: handleInput }).describe("Il dettaglio di un profilo"),
  returns: nullable(dettaglioProfilo),
  handler: async (ctx, _admin, { handle }) => {
    const p = handle ? await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", handle)).first() : null;
    if (!p) return null;
    const now = Date.now();
    const { scheda, chat } = await schedaProfilo(ctx, p, now);
    const registro = await ctx.db.query("activity").withIndex("by_profile_at", q => q.eq("profileId", p._id)).order("desc").take(RIGHE_REGISTRO);
    const perVisibilita = (vis: Doc<"chatThreads">["visibility"]) => chat.filter(t => t.visibility === vis).slice(0, THREAD_DETTAGLIO);
    return {
      ...scheda,
      registro: registro.map(a => ({
        at: a.at,
        // come activity.list: le voci di prima del cambio di nome hanno ancora «Oracolo» salvato
        autore: a.actor.via === "oracolo" ? ETICHETTE_ATTORE.oracolo : a.actor.label,
        via: a.actor.via,
        op: a.op,
        riassunto: a.summary,
        annullata: !!a.undoneBy,
      })),
      chat: [...perVisibilita("pubblica"), ...perVisibilita("proprietario")].map(t => ({
        visibility: t.visibility,
        messaggi: t.messages.length,
        creata: t._creationTime,
        aggiornata: t.updatedAt,
        scade: t.expiresAt,
        // il titolo di un thread privato nasce dalla prima domanda al Tour manager: non esce
        ...(t.visibility === "pubblica" ? { titolo: t.title, ...(t.author ? { autore: t.author } : {}) } : {}),
      })),
    };
  },
});

/** Una riga in `adminAccessi` per pagina aperta della vista admin (la chiama la pagina, una volta). */
export const registraAccesso = adminMutation({
  adminOnly: MOTIVO,
  input: z.object({ vista: z.enum(VISTE_ADMIN), handle: handleInput.optional() }).describe("La pagina admin aperta"),
  returns: v.null(),
  handler: async (ctx, admin, { vista, handle }) => {
    const p = vista === "profilo" && handle ? await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", handle)).first() : null;
    await ctx.db.insert("adminAccessi", { authUserId: admin.authUserId, vista, ...(p ? { profileId: p._id } : {}), at: Date.now() });
    return null;
  },
});

/**
 * Per attivare la vista admin su un deployment: l'`authUserId` del profilo
 * con questo handle, o null. Solo `convex run` (interna); il risultato va
 * dritto in `convex env set ADMIN_USER_IDS`, senza finire in un file.
 */
export const authUserIdDi = internalQuery({
  args: { handle: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { handle }) => {
    const p = await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", handle.trim().toLowerCase())).first();
    return p?.authUserId ?? null;
  },
});
