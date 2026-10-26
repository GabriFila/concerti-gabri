/* ──────────────────────────────────────────────────────────────
   Lo storico dell'Oracolo per pagina (PIANO §1.26, §5.2, traguardo 6).

   - La route Start (/api/chat) chiama due httpAction, `/oracolo/turno`
     prima di Gemini e `/oracolo/trascrizione` alla fine, con
     CHAT_SERVER_SECRET come `Authorization: Bearer` (controllato in
     http.ts, mai come argomento: PIANO §1.25). Qui sotto ci sono i loro
     corpi e le due mutation interne.
   - `beginTurn`: la pagina esiste, il thread è di quella pagina e con la
     stessa visibilità, la chiave di scrittura combacia (un thread senza
     chiave, come i legacy, lo rivendica il primo turno che ne porta una),
     poi i limiti di §5.8. Tutto in una transazione: se un controllo o un
     limite rifiuta, anche i limiti già consumati tornano indietro. Risponde
     con la conversazione salvata: è l'unica che la route rimanda al
     modello (quella del browser non conta), quindi la trascrizione che
     torna indietro l'ha scritta tutta il server, tranne le domande.
   - L'Oracolo in scrittura (`proprietario`) non pesca dai limiti dei
     visitatori: a pagina, pagine e globale potrebbero esaurirli degli
     estranei, chiudendo fuori il proprietario. Ha il suo tetto al giorno
     (lo stesso `chatPageDay`, con una chiave sua) più `chatIpMinute`.
   - La chiave arriva già come SHA-256 e l'IP come HMAC (li calcola la
     route): qui non passano mai la chiave in chiaro né l'IP.
   - Query pubbliche (`listThreads`, `getThread`): solo i thread `pubblica`,
     mai `writeKeyHash` né `ipHmac`. I thread `proprietario` (l'Oracolo in
     scrittura di /modifica) li legge solo il proprietario: `myThreads` e
     `myThread` (il `me.chatThreads` di PIANO §5.2), solo da dashboard.
   - Durata: 90 giorni dall'ultimo messaggio, poi il cron li cancella.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { isValidThreadId } from "../shared/chat/ids.ts";
import { CHAT_TTL_MS, chatTitle, sanitizeAuthor } from "../shared/chat/thread.ts";
import { nessunInput } from "../shared/schema/campi.ts";
import { guardiaSviluppo } from "./devtools.ts";
import { internalMutation, internalQuery, ownerQuery, publicQuery } from "./lib/builders.ts";
import { codiceDi, errore } from "./lib/errors.ts";
import { CHAT_PAGE_DAY_GABRIFILA, rateLimiter } from "./rateLimits.ts";

/** La pagina con la riserva del globale (PIANO §5.8): `chatOtherPagesDay` non la conta. */
export const PAGINA_CON_RISERVA = "gabrifila";
/** Quante conversazioni mostra lo storico pubblico di una pagina. */
export const MAX_THREADS_LISTA = 50;
/** Tetto alla trascrizione salvata (un documento Convex sta sotto 1 MB). */
const MAX_JSON_TRASCRIZIONE = 800_000;

const visibilita = v.union(v.literal("pubblica"), v.literal("proprietario"));
type Visibilita = Doc<"chatThreads">["visibility"];

/** Il profilo `active` di una pagina, o null (alias e profili in onboarding non hanno Oracolo). */
async function profiloDellaPagina(ctx: QueryCtx | MutationCtx, handle: string): Promise<Doc<"profiles"> | null> {
  const h = handle.slice(0, 64).toLowerCase();
  const p = await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", h)).first();
  return p && p.status === "active" && p.handle ? p : null;
}

const threadPerId = (ctx: QueryCtx | MutationCtx, threadId: string) =>
  ctx.db.query("chatThreads").withIndex("by_threadId", q => q.eq("threadId", threadId)).first();

/** Chi può continuare un thread: stessa pagina, stessa visibilità e, se pubblico, la chiave giusta. */
function controllaThread(thread: Doc<"chatThreads">, profileId: Id<"profiles">, a: { visibility: Visibilita; writeKeyHash?: string }) {
  if (thread.profileId !== profileId || thread.visibility !== a.visibility) {
    throw errore("unauthorized", "questa chat appartiene a un'altra pagina: aprine una nuova");
  }
  if (a.visibility === "pubblica" && thread.writeKeyHash && thread.writeKeyHash !== a.writeKeyHash) {
    throw errore("unauthorized", "questa chat appartiene a un altro visitatore: puoi solo leggerla");
  }
}

/* ── limiti (PIANO §5.8) ───────────────────────────────────────── */

const MESSAGGI_LIMITE = {
  chatIpMinute: "Troppi messaggi ravvicinati: aspetta un minuto e riprova.",
  chatIpDay: "Limite giornaliero dei tuoi messaggi raggiunto: riprova domani.",
  chatPageDay: "Limite giornaliero dell'Oracolo di questa pagina raggiunto: riprova domani.",
  chatOtherPagesDay: "Limite giornaliero dell'Oracolo di questa pagina raggiunto: riprova domani.",
  chatGlobalDay: "Limite giornaliero della chat raggiunto: riprova domani.",
} as const;
const LIMITE_SCRITTURA = "Limite giornaliero del Tour manager raggiunto: riprova domani.";

function esito(name: keyof typeof MESSAGGI_LIMITE, r: { ok: boolean; retryAfter?: number }, messaggio: string = MESSAGGI_LIMITE[name]) {
  if (!r.ok) throw errore("limite_superato", messaggio, { limite: name, retryAfter: Math.ceil((r.retryAfter ?? 0) / 1000) });
}

/** La chiave di `chatPageDay` per l'Oracolo in scrittura di una pagina: separata da quella dei visitatori. */
export const chiaveScrittura = (profileId: Id<"profiles">) => `scrittura:${profileId}`;

/** `chatPageDay` con il tetto della pagina (gabrifila ne ha di più): lo stato è per chiave, quindi vale solo lì. */
const configPagina = (profilo: Doc<"profiles">) =>
  profilo.handle === PAGINA_CON_RISERVA ? { ...rateLimiter.limits!.chatPageDay, rate: CHAT_PAGE_DAY_GABRIFILA } : rateLimiter.limits!.chatPageDay;

/** Consuma un turno da ogni limite che riguarda la pagina; il primo che rifiuta lancia (e la transazione torna indietro). */
async function consumaLimiti(ctx: MutationCtx, profilo: Doc<"profiles">, ipHmac: string, visibility: Visibilita) {
  esito("chatIpMinute", await rateLimiter.limit(ctx, "chatIpMinute", { key: ipHmac }));
  if (visibility === "proprietario") {
    const r = await rateLimiter.limit<string>(ctx, "chatPageDay", { key: chiaveScrittura(profilo._id), config: configPagina(profilo) });
    esito("chatPageDay", r, LIMITE_SCRITTURA);
    return;
  }
  esito("chatIpDay", await rateLimiter.limit(ctx, "chatIpDay", { key: ipHmac }));
  esito("chatPageDay", await rateLimiter.limit<string>(ctx, "chatPageDay", { key: profilo._id, config: configPagina(profilo) }));
  if (profilo.handle !== PAGINA_CON_RISERVA) esito("chatOtherPagesDay", await rateLimiter.limit(ctx, "chatOtherPagesDay"));
  esito("chatGlobalDay", await rateLimiter.limit(ctx, "chatGlobalDay"));
}

/* ── turno e trascrizione (interne: le chiama solo l'httpAction) ── */

const argsTurno = {
  handle: v.string(),
  threadId: v.string(),
  visibility: visibilita,
  writeKeyHash: v.optional(v.string()),
  ipHmac: v.string(),
};

export const beginTurn = internalMutation({
  args: argsTurno,
  returns: v.object({ nuovo: v.boolean(), messages: v.array(v.any()) }),
  handler: async (ctx, a) => {
    const profilo = await profiloDellaPagina(ctx, a.handle);
    if (!profilo) throw errore("not_found", "pagina non trovata");
    const thread = await threadPerId(ctx, a.threadId);
    if (thread) controllaThread(thread, profilo._id, a);
    await consumaLimiti(ctx, profilo, a.ipHmac, a.visibility);
    // un thread senza chiave (legacy) diventa del primo turno che ne porta una
    if (thread && a.visibility === "pubblica" && !thread.writeKeyHash && a.writeKeyHash) {
      await ctx.db.patch(thread._id, { writeKeyHash: a.writeKeyHash });
    }
    // uno scaduto (il cron non è ancora passato) riparte da capo, come se non ci fosse
    const messages = thread && thread.expiresAt > Date.now() ? thread.messages : [];
    return { nuovo: !thread, messages };
  },
});

/** Gli ultimi messaggi che stanno in un documento (i più vecchi si perdono per primi). */
function taglia(messages: unknown[]): unknown[] {
  let dim = 0;
  let i = messages.length;
  while (i > 0) {
    dim += JSON.stringify(messages[i - 1]).length;
    if (dim > MAX_JSON_TRASCRIZIONE) break;
    i--;
  }
  return messages.slice(i);
}

export const saveTranscript = internalMutation({
  args: { ...argsTurno, author: v.optional(v.string()), messages: v.array(v.any()) },
  returns: v.null(),
  handler: async (ctx, a) => {
    const profilo = await profiloDellaPagina(ctx, a.handle);
    if (!profilo) throw errore("not_found", "pagina non trovata");
    const thread = await threadPerId(ctx, a.threadId);
    if (thread) controllaThread(thread, profilo._id, a);
    const pubblica = a.visibility === "pubblica";
    // mai istruzioni di sistema nello storico: solo la conversazione
    const messages = taglia(a.messages.filter(m => m && typeof m === "object" && m.role !== "system" && m.role !== "developer"));
    const now = Date.now();
    const author = pubblica ? sanitizeAuthor(a.author) : undefined;
    const campi = {
      title: chatTitle(messages as { role: string; content?: unknown }[]),
      messages,
      updatedAt: now,
      expiresAt: now + CHAT_TTL_MS,
      ipHmac: a.ipHmac,
      ...(author ? { author } : {}),
    };
    if (thread) {
      await ctx.db.patch(thread._id, { ...campi, ...(pubblica && !thread.writeKeyHash && a.writeKeyHash ? { writeKeyHash: a.writeKeyHash } : {}) });
    } else {
      await ctx.db.insert("chatThreads", {
        profileId: profilo._id,
        threadId: a.threadId,
        visibility: a.visibility,
        ...campi,
        ...(pubblica && a.writeKeyHash ? { writeKeyHash: a.writeKeyHash } : {}),
      });
    }
    return null;
  },
});

const LOTTO_SCADUTI = 200;

/** Cron (T6): thread scaduti (`expiresAt`), 90 giorni dopo l'ultimo messaggio. A lotti: se ne restano, riparte subito. */
export const cleanupExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async ctx => {
    const scaduti = await ctx.db.query("chatThreads").withIndex("by_expires", q => q.lt("expiresAt", Date.now())).take(LOTTO_SCADUTI);
    for (const t of scaduti) await ctx.db.delete(t._id);
    if (scaduti.length === LOTTO_SCADUTI) await ctx.scheduler.runAfter(0, internal.chat.cleanupExpired, {});
    return null;
  },
});

/* ── solo test locali (guardia di devtools: mai in produzione, solo con AUTH_DEV_OTP=1) ── */

/** I limiti della chat da capo, per gli e2e che fanno molti turni (o che li esauriscono apposta):
    globali, per pagina e per gli IP (come HMAC) dei thread salvati. */
export const azzeraLimitiPerTest = internalMutation({
  args: {},
  returns: v.null(),
  handler: async ctx => {
    guardiaSviluppo();
    await rateLimiter.reset(ctx, "chatGlobalDay");
    await rateLimiter.reset(ctx, "chatOtherPagesDay");
    for (const p of await ctx.db.query("profiles").collect()) {
      await rateLimiter.reset(ctx, "chatPageDay", { key: p._id });
      await rateLimiter.reset(ctx, "chatPageDay", { key: chiaveScrittura(p._id) });
    }
    const ips = new Set((await ctx.db.query("chatThreads").collect()).flatMap(t => (t.ipHmac ? [t.ipHmac] : [])));
    for (const key of ips) {
      await rateLimiter.reset(ctx, "chatIpMinute", { key });
      await rateLimiter.reset(ctx, "chatIpDay", { key });
    }
    return null;
  },
});

/** Esaurisce il limite giornaliero di una pagina (chatPageDay), per l'e2e del messaggio del limite;
    azzeraLimitiPerTest lo riporta pieno. */
export const esaurisciPaginaPerTest = internalMutation({
  args: { handle: v.string() },
  returns: v.null(),
  handler: async (ctx, { handle }) => {
    guardiaSviluppo();
    const profilo = await profiloDellaPagina(ctx, handle);
    if (!profilo) throw new Error("chat: pagina inesistente");
    const config = configPagina(profilo);
    await rateLimiter.reset(ctx, "chatPageDay", { key: profilo._id });
    await rateLimiter.limit<string>(ctx, "chatPageDay", { key: profilo._id, count: config.rate, config });
    return null;
  },
});

/** La visibilità di un thread salvato, o null: gli e2e controllano che un thread privato esista
    davvero (altrimenti "non compare nelle query pubbliche" passerebbe a vuoto). */
export const visibilitaPerTest = internalQuery({
  args: { threadId: v.string() },
  returns: v.union(v.null(), visibilita),
  handler: async (ctx, { threadId }) => {
    guardiaSviluppo();
    return (await threadPerId(ctx, threadId))?.visibility ?? null;
  },
});

/* ── httpAction /oracolo/* (l'autorizzazione la fa http.ts) ─────── */

const HEX64 = /^[0-9a-f]{64}$/;
const turnoInput = z.object({
  handle: z.string().min(1).max(64),
  threadId: z.string().refine(isValidThreadId),
  visibility: z.enum(["pubblica", "proprietario"]),
  writeKeyHash: z.string().regex(HEX64).optional(),
  ipHmac: z.string().regex(HEX64),
});
const trascrizioneInput = turnoInput.extend({
  author: z.string().max(200).optional(),
  messages: z.array(z.record(z.string(), z.unknown())).max(400),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const STATO_PER_CODICE: Record<string, number> = { limite_superato: 429, unauthorized: 403, not_found: 404, input_non_valido: 400 };

/** Un errore della mutation in `{code, messaggio}`, mai con i valori ricevuti. */
function rispostaErrore(e: unknown): Response {
  const code = codiceDi(e);
  if (code) {
    const data = (e as { data: Record<string, unknown> }).data;
    return json(STATO_PER_CODICE[code] ?? 400, {
      code,
      messaggio: String(data.messaggio ?? ""),
      ...(typeof data.retryAfter === "number" ? { retryAfter: data.retryAfter } : {}),
    });
  }
  console.error("oracolo: errore inatteso", e instanceof Error ? e.name : typeof e);
  return json(500, { code: "errore", messaggio: "errore interno, riprova" });
}

const RICHIESTA_NON_VALIDA = () => json(400, { code: "input_non_valido", messaggio: "richiesta non valida" });

/** Il corpo JSON validato; un errore non ripete mai il corpo (lo manda la route Start: un errore qui è un bug). */
async function leggi<S extends z.ZodType>(req: Request, schema: S): Promise<{ dati: z.output<S> } | { risposta: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { risposta: RICHIESTA_NON_VALIDA() };
  }
  const r = schema.safeParse(raw);
  return r.success ? { dati: r.data } : { risposta: RICHIESTA_NON_VALIDA() };
}

export async function turnoHttp(ctx: ActionCtx, req: Request): Promise<Response> {
  const l = await leggi(req, turnoInput);
  if ("risposta" in l) return l.risposta;
  try {
    return json(200, { ok: true, ...(await ctx.runMutation(internal.chat.beginTurn, l.dati)) });
  } catch (e) {
    return rispostaErrore(e);
  }
}

export async function trascrizioneHttp(ctx: ActionCtx, req: Request): Promise<Response> {
  const l = await leggi(req, trascrizioneInput);
  if ("risposta" in l) return l.risposta;
  try {
    await ctx.runMutation(internal.chat.saveTranscript, l.dati);
    return json(200, { ok: true });
  } catch (e) {
    return rispostaErrore(e);
  }
}

/* ── query pubbliche: solo i thread `pubblica` ─────────────────── */

const voceLista = v.object({ threadId: v.string(), title: v.string(), author: v.optional(v.string()), updatedAt: v.number() });

const vivo = (t: Doc<"chatThreads">, now: number) => t.expiresAt > now && t.messages.length > 0;

export const listThreads = publicQuery({
  args: { handle: v.string() },
  returns: v.array(voceLista),
  handler: async (ctx, { handle }: { handle: string }) => {
    const profilo = await profiloDellaPagina(ctx, handle);
    if (!profilo) return [];
    const now = Date.now();
    const righe = await ctx.db
      .query("chatThreads")
      .withIndex("by_profile_visibility_updatedAt", q => q.eq("profileId", profilo._id).eq("visibility", "pubblica"))
      .order("desc")
      .take(MAX_THREADS_LISTA * 2);
    return righe
      .filter(t => vivo(t, now))
      .slice(0, MAX_THREADS_LISTA)
      .map(t => ({ threadId: t.threadId, title: t.title, updatedAt: t.updatedAt, ...(t.author ? { author: t.author } : {}) }));
  },
});

export const getThread = publicQuery({
  args: { handle: v.string(), threadId: v.string() },
  returns: v.union(
    v.null(),
    v.object({ threadId: v.string(), title: v.string(), author: v.optional(v.string()), updatedAt: v.number(), messages: v.array(v.any()) }),
  ),
  handler: async (ctx, { handle, threadId }: { handle: string; threadId: string }) => {
    if (!isValidThreadId(threadId)) return null;
    const profilo = await profiloDellaPagina(ctx, handle);
    if (!profilo) return null;
    const t = await threadPerId(ctx, threadId);
    if (!t || t.profileId !== profilo._id || t.visibility !== "pubblica" || !vivo(t, Date.now())) return null;
    return { threadId: t.threadId, title: t.title, updatedAt: t.updatedAt, messages: t.messages, ...(t.author ? { author: t.author } : {}) };
  },
});

/* ── i thread privati del proprietario (me.chatThreads, PIANO §5.2) ── */

const MOTIVO_PRIVATI = "conversazioni private dell'Oracolo in scrittura, lette solo da /modifica";

export const myThreads = ownerQuery({
  dashboardOnly: MOTIVO_PRIVATI,
  input: nessunInput,
  handler: async (ctx, owner) => {
    const now = Date.now();
    const righe = await ctx.db
      .query("chatThreads")
      .withIndex("by_profile_visibility_updatedAt", q => q.eq("profileId", owner.profile._id).eq("visibility", "proprietario"))
      .order("desc")
      .take(MAX_THREADS_LISTA);
    return { threads: righe.filter(t => vivo(t, now)).map(t => ({ threadId: t.threadId, title: t.title, updatedAt: t.updatedAt })) };
  },
});

const leggiThreadInput = z.object({ threadId: z.string().max(64).describe("Id della conversazione") }).describe("Una conversazione privata");

export const myThread = ownerQuery({
  dashboardOnly: MOTIVO_PRIVATI,
  input: leggiThreadInput,
  handler: async (ctx, owner, { threadId }) => {
    const t = isValidThreadId(threadId) ? await threadPerId(ctx, threadId) : null;
    if (!t || t.profileId !== owner.profile._id || t.visibility !== "proprietario") throw errore("not_found", "non trovato");
    return { threadId: t.threadId, title: t.title, updatedAt: t.updatedAt, messages: t.messages };
  },
});
