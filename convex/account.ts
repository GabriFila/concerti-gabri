/* ──────────────────────────────────────────────────────────────
   Account (#account, T5; PIANO §1.31, §5.9). Tutto solo dalla dashboard.

   - `esporta` (account.export del piano): i dati del profilo in JSON
     (`fileEsportato` di shared/schema/dashboard.ts). Il campo `concerti` è
     nel formato dell'import JSON (`importJson` di
     shared/schema/importFormat.ts); in più persone, partenze col TESTO
     dell'indirizzo, "regalato da", wishlist, profilo e conversazioni
     dell'Oracolo. Mai coordinate, `ipHmac`, `writeKeyHash` o `authUserId`.
   - `elimina` (account.delete del piano): si conferma riscrivendo l'handle
     e con una sessione recente (meno di un giorno, come il `freshAge` di
     Better Auth). Il profilo e gli alias spariscono subito, così la pagina
     non esiste più; il resto della cascata di §5.9 va a lotti con lo
     scheduler (`cascata`, solo id negli argomenti): concerti, persone,
     "regalato da" con i file dei loghi, wishlist, partenze con indirizzi,
     candidati e coppie km, registro, conversazioni di ogni visibilità,
     OTP di sviluppo dell'email. Le venue create restano nel catalogo,
     senza `createdBy`. Nella stessa transazione `cancellaUtenteAuth`
     toglie da Better Auth utente, sessioni, account, API key, token,
     consensi, client OAuth e codici OTP dell'utente.
   - `dettagli`: per #account l'email della sessione e i vecchi handle
     (alias con redirect 301).
   `export` e `delete` sono parole riservate: qui `esporta` ed `elimina`.
   Le tabelle private delle partenze passano dagli helper di departures.ts.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import { nessunInput } from "../shared/schema/campi.ts";
import { eliminaAccountInput, FORMATO_EXPORT } from "../shared/schema/dashboard.ts";
import { components, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authComponent, createAuth } from "./auth.ts";
import { cancellaCoppieDelProfiloPagina, cancellaPartenzeDelProfilo, indirizziDelProfilo } from "./departures.ts";
import { guardiaSviluppo } from "./devtools.ts";
import { cancellaFile } from "./gifters.ts";
import { internalMutation, ownerMutation, ownerQuery } from "./lib/builders.ts";
import { errore } from "./lib/errors.ts";
import { departuresOf, giftersOf, nomiPerEsterno, peopleOf } from "./lib/refs.ts";
import { wishlistOf } from "./wishlist.ts";

/** Una sessione è "recente" per meno di un giorno dal login (freshAge di Better Auth). */
export const SESSIONE_RECENTE_MS = 24 * 3600_000;
/** Documenti per lotto della cascata. */
const LOTTO = 200;

const senzaVuoti = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as T;

/* ── export ───────────────────────────────────────────────────── */

type Nomi = Awaited<ReturnType<typeof nomiPerEsterno>>;

/** Un concerto o festival nella forma esterna di entry.ts (nomi, niente id né km). */
export function perImport(e: Doc<"entries">, n: Nomi) {
  const v = n.venues.get(e.venueId);
  const nomi = (ids?: Id<"people">[]) => (ids ?? []).map(id => n.people.get(id)).filter((x): x is string => !!x);
  const base = senzaVuoti({
    date: e.date,
    venue: v?.name ?? "",
    city: v?.city ?? "",
    cost: e.cost,
    gift: e.gift,
    giftFrom: e.giftFromId ? n.gifters.get(e.giftFromId) : undefined,
    accredito: e.accredito,
    from: e.departureId ? n.departures.get(e.departureId) : undefined,
    comments: e.comments,
  });
  if (e.kind === "festival") {
    return {
      kind: "festival" as const,
      name: e.name ?? "",
      ...base,
      concerts: (e.concerts ?? []).map(c =>
        senzaVuoti({ artist: c.artist, with: nomi(c.with), voto: c.voto, vicinanza: c.vicinanza, canzoniNote: c.canzoniNote, date: c.date }),
      ),
    };
  }
  return {
    kind: "concert" as const,
    ...base,
    ...senzaVuoti({ artist: e.artist ?? "", with: nomi(e.with), voto: e.voto, vicinanza: e.vicinanza, canzoniNote: e.canzoniNote }),
  };
}

export const esporta = ownerQuery({
  dashboardOnly: "contiene il testo degli indirizzi",
  input: nessunInput,
  handler: async (ctx, owner) => {
    const p = owner.profile;
    const entries = await ctx.db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", p._id)).collect();
    const nomi = await nomiPerEsterno(ctx, p._id, entries);
    const indirizzi = await indirizziDelProfilo(ctx, p._id);
    const regali = [];
    for (const g of await giftersOf(ctx, p._id)) {
      const logoUrl = g.logo ? ("url" in g.logo ? g.logo.url : ((await ctx.storage.getUrl(g.logo.storageId)) ?? undefined)) : undefined;
      regali.push(senzaVuoti({ label: g.label, url: g.url, logoUrl }));
    }
    const conversazioni = (await ctx.db.query("chatThreads").withIndex("by_profile_visibility_updatedAt", q => q.eq("profileId", p._id)).collect())
      // mai writeKeyHash né ipHmac
      .map(t => senzaVuoti({ threadId: t.threadId, visibility: t.visibility, title: t.title, author: t.author, messages: t.messages, updatedAt: t.updatedAt }));
    return {
      formato: FORMATO_EXPORT,
      versione: 1,
      esportatoIl: new Date().toISOString(),
      profilo: senzaVuoti({ handle: p.handle, displayName: p.displayName, forma: p.forma, theme: p.theme, layout: p.layout, extra: p.extra, createdAt: p.createdAt }),
      concerti: entries.map(e => perImport(e, nomi)),
      persone: (await peopleOf(ctx, p._id)).map(x => x.name),
      partenze: (await departuresOf(ctx, p._id)).map(d => senzaVuoti({ name: d.name, indirizzo: indirizzi.get(d._id) })),
      regali,
      wishlist: await wishlistOf(ctx, p._id),
      conversazioni,
    };
  },
});

/* ── #account ─────────────────────────────────────────────────── */

/** L'email dell'utente della sessione (riga `user` di Better Auth) e i vecchi handle del profilo, che reindirizzano al nuovo. */
export const dettagli = ownerQuery({
  dashboardOnly: "UI di #account: email della sessione e vecchi handle",
  input: nessunInput,
  handler: async (ctx, owner) => {
    const alias = await ctx.db.query("handleAliases").withIndex("by_profile", q => q.eq("profileId", owner.profile._id)).collect();
    return { email: (await sessione(ctx)).email ?? null, alias: alias.map(a => a.handle).sort() };
  },
});

/* ── eliminazione ─────────────────────────────────────────────── */

type RigaAuth = { _id: string; createdAt?: number; userId?: string; email?: string } | null;
const trovaAuth = (ctx: QueryCtx | MutationCtx, model: "session" | "user", field: string, value: string) =>
  ctx.runQuery(components.betterAuth.adapter.findOne, { model, where: [{ field, value }] }) as Promise<RigaAuth>;

/**
 * La sessione di chi chiama: quando è nata (ms) ed email. Il JWT di Convex
 * porta solo `sub` e `sessionId` (convex/auth.ts): la data è il `createdAt`
 * della riga `session` del componente, l'email quella della riga `user`.
 * Senza una sessione dello stesso utente, la sessione non conta come recente.
 */
async function sessione(ctx: QueryCtx | MutationCtx): Promise<{ nataIl: number | null; email?: string }> {
  const id = await ctx.auth.getUserIdentity();
  if (!id || typeof id.sessionId !== "string" || !id.sessionId) return { nataIl: null };
  const s = await trovaAuth(ctx, "session", "_id", id.sessionId);
  if (!s || s.userId !== id.subject) return { nataIl: null };
  const u = await trovaAuth(ctx, "user", "_id", id.subject);
  return { nataIl: typeof s.createdAt === "number" ? s.createdAt : null, email: typeof u?.email === "string" ? u.email : undefined };
}

/** I tipi di codice di emailOTP: le verifiche si chiamano `<tipo>-otp-<email>`. */
const TIPI_OTP = ["sign-in", "email-verification", "forget-password", "change-email"];

/**
 * Better Auth (§5.9): `deleteUser` lato server con la sessione di chi chiama
 * (la sola strada: /delete-user via HTTP è spento, convex/auth.ts) toglie
 * utente, sessioni e account, e controlla di nuovo che la sessione sia
 * recente (freshAge). Le tabelle dei plugin non hanno cascata: API key,
 * token, consensi e client OAuth dell'utente, e i codici OTP della sua
 * email, si cancellano qui.
 */
async function cancellaUtenteAuth(ctx: MutationCtx, authUserId: string, email: string | undefined) {
  const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
  await auth.api.deleteUser({ body: {}, headers });
  const togli = async (model: "session" | "account" | "apikey" | "oauthAccessToken" | "oauthConsent" | "oauthApplication" | "verification", field: string, value: string) => {
    let cursor: string | null = null;
    do {
      const r = (await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
        input: { model, where: [{ field, value }] } as never,
        paginationOpts: { cursor, numItems: 200 },
      })) as { isDone: boolean; continueCursor: string };
      cursor = r.isDone ? null : r.continueCursor;
    } while (cursor);
  };
  // deleteUser le ha già tolte: si ripassa per sicurezza (e per un utente senza sessione valida)
  await togli("session", "userId", authUserId);
  await togli("account", "userId", authUserId);
  await togli("apikey", "referenceId", authUserId);
  await togli("oauthAccessToken", "userId", authUserId);
  await togli("oauthConsent", "userId", authUserId);
  await togli("oauthApplication", "userId", authUserId);
  if (email) for (const tipo of TIPI_OTP) await togli("verification", "identifier", `${tipo}-otp-${email}`);
}

/**
 * Solo e2e: fa sembrare vecchie (nate `ms` fa) le sessioni Better Auth di
 * un'email (il `createdAt` delle righe `session`), così la sessione non è
 * più recente. False se l'utente o le sessioni non ci sono.
 */
async function invecchiaSessioniAuth(ctx: MutationCtx, email: string, ms: number): Promise<boolean> {
  const u = await trovaAuth(ctx, "user", "email", email.trim().toLowerCase());
  if (!u) return false;
  const r = (await ctx.runMutation(components.betterAuth.adapter.updateMany, {
    input: { model: "session", where: [{ field: "userId", value: u._id }], update: { createdAt: Date.now() - ms } },
    paginationOpts: { cursor: null, numItems: 100 },
  })) as { count?: number };
  return (r.count ?? 0) > 0;
}

/** La parte immediata dell'eliminazione; il resto lo fa `cascata`. */
async function eliminaProfilo(ctx: MutationCtx, p: Doc<"profiles">, email: string | undefined) {
  for (const a of await ctx.db.query("handleAliases").withIndex("by_profile", q => q.eq("profileId", p._id)).collect()) await ctx.db.delete(a._id);
  if (email) {
    for (const o of await ctx.db.query("devOtpOutbox").withIndex("by_email", q => q.eq("email", email)).collect()) await ctx.db.delete(o._id);
  }
  await ctx.db.delete(p._id);
  await ctx.scheduler.runAfter(0, internal.account.cascata, { profileId: p._id, fase: "dati", cursor: null });
}

export const elimina = ownerMutation({
  dashboardOnly: "un token rubato non deve cancellare tutto",
  input: eliminaAccountInput,
  handler: async (ctx, owner, { conferma }) => {
    const p = owner.profile;
    if (conferma !== p.handle) throw errore("input_non_valido", "conferma: scrivi esattamente l'handle della tua pagina", { campo: "conferma" });
    const s = await sessione(ctx);
    if (s.nataIl === null || Date.now() - s.nataIl > SESSIONE_RECENTE_MS) {
      throw errore("unauthorized", "per sicurezza rientra con Google, poi conferma di nuovo", {
        sessioneRecente: false,
        fix: `/accedi?next=${encodeURIComponent(`/${p.handle}/modifica#account?elimina=1`)}`,
      });
    }
    await eliminaProfilo(ctx, p, s.email);
    if (p.authUserId) await cancellaUtenteAuth(ctx, p.authUserId, s.email);
    return { ok: true as const };
  },
});

/**
 * Per il trigger `onDelete` dell'utente Better Auth (traguardo 3): se
 * l'utente sparisce da un'altra strada, i suoi dati lo seguono.
 */
export const eliminaDatiUtente = internalMutation({
  args: { authUserId: v.string(), email: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, { authUserId, email }) => {
    const p = await ctx.db.query("profiles").withIndex("by_authUserId", q => q.eq("authUserId", authUserId)).unique();
    if (!p) return false;
    await eliminaProfilo(ctx, p, email);
    return true;
  },
});

/** e2e/account.spec.ts: il percorso "sessione non recente" (solo deployment di sviluppo). */
export const invecchiaSessionePerTest = internalMutation({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { email }) => {
    guardiaSviluppo();
    return await invecchiaSessioniAuth(ctx, email, SESSIONE_RECENTE_MS + 3600_000);
  },
});

/**
 * e2e/fughe e e2e/partenze, senza sessione: una partenza (senza indirizzo)
 * per un profilo di prova `e2e-*` creato da devtools:creaProfiloDiProva;
 * l'indirizzo poi lo mette devtools:setDepartureForTest. Idempotente.
 */
export const creaPartenzaPerTest = internalMutation({
  args: { handle: v.string(), name: v.string() },
  returns: v.string(),
  handler: async (ctx, { handle, name }) => {
    guardiaSviluppo();
    if (!handle.startsWith("e2e-")) throw new Error("solo per i profili di prova e2e-*");
    const p = await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", handle)).first();
    if (!p) throw new Error("profilo di prova inesistente");
    const esiste = (await departuresOf(ctx, p._id)).find(d => d.name === name);
    if (esiste) return esiste._id as string;
    return (await ctx.db.insert("departures", { profileId: p._id, name, hasAddress: false, legacy: false, createdAt: Date.now() })) as string;
  },
});

/** Le tabelle con un indice per profilo, nell'ordine della cascata. */
async function lottoDiDati(ctx: MutationCtx, profileId: Id<"profiles">, max: number): Promise<number> {
  let n = 0;
  const togli = async (docs: { _id: Id<TableNames> }[]) => {
    for (const d of docs) await ctx.db.delete(d._id);
    n += docs.length;
  };
  await togli(await ctx.db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", profileId)).take(max - n));
  await togli(await ctx.db.query("people").withIndex("by_profile_name", q => q.eq("profileId", profileId)).take(max - n));
  const gifters = await ctx.db.query("gifters").withIndex("by_profile", q => q.eq("profileId", profileId)).take(max - n);
  for (const g of gifters) if (g.logo && "storageId" in g.logo) await cancellaFile(ctx, g.logo.storageId);
  await togli(gifters);
  await togli(await ctx.db.query("wishlist").withIndex("by_profile_ordine", q => q.eq("profileId", profileId)).take(max - n));
  n += await cancellaPartenzeDelProfilo(ctx, profileId, max - n);
  await togli(await ctx.db.query("activity").withIndex("by_profile_at", q => q.eq("profileId", profileId)).take(max - n));
  await togli(await ctx.db.query("chatThreads").withIndex("by_profile_visibility_updatedAt", q => q.eq("profileId", profileId)).take(max - n));
  return n;
}

/**
 * La cascata a lotti: prima i dati con un indice per profilo, poi le
 * coppie km (scorrendo la tabella), infine le venue create (createdBy
 * tolto). Si riprogramma finché c'è lavoro; argomenti: solo id e cursori.
 */
export const cascata = internalMutation({
  args: { profileId: v.id("profiles"), fase: v.union(v.literal("dati"), v.literal("coppie"), v.literal("venue")), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { profileId, fase, cursor }) => {
    const prossimo = (a: { fase: "dati" | "coppie" | "venue"; cursor: string | null }) =>
      ctx.scheduler.runAfter(0, internal.account.cascata, { profileId, ...a });
    if (fase === "dati") {
      const n = await lottoDiDati(ctx, profileId, LOTTO);
      await prossimo(n >= LOTTO ? { fase: "dati", cursor: null } : { fase: "coppie", cursor: null });
    } else if (fase === "coppie") {
      const r = await cancellaCoppieDelProfiloPagina(ctx, profileId, cursor);
      await prossimo(r.finito ? { fase: "venue", cursor: null } : { fase: "coppie", cursor: r.cursor });
    } else {
      const page = await ctx.db.query("venues").paginate({ cursor, numItems: 500 });
      for (const ven of page.page) if (ven.createdBy === profileId) await ctx.db.patch(ven._id, { createdBy: undefined });
      if (!page.isDone) await prossimo({ fase: "venue", cursor: page.continueCursor });
    }
    return null;
  },
});
