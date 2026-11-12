/* ──────────────────────────────────────────────────────────────
   Le foto dei concerti (DECISIONI «Foto dei concerti»): solo dashboard,
   dal pannello del concerto in /<handle>/modifica#concerti.

   Caricamento dal browser, come i loghi (convex/gifters.ts):
   urlCaricamento → POST dei due file (foto e miniatura, già ricodificate
   in JPEG dal browser) → aggiungi, una action perché solo un'action legge
   i byte. aggiungi rilegge i file (lib/jpeg.ts): JPEG ben formato, nessun
   metadato (Exif/XMP/IPTC: GPS, data, telefono), lato e peso entro i
   limiti di shared/schema/foto.ts. Un file rifiutato si cancella subito
   e aggiungi risponde `{ok: false, code, messaggio}` invece di lanciare.
   Al massimo FOTO_PER_EVENTO foto per evento; `fotoUpload` al giorno.

   Gli agenti non caricano foto: `link` (link_foto_concerto) dà loro il
   link al pannello del concerto, da passare al proprietario.
   Aggiungere, spostare o togliere una foto va nel registro (op "foto") ma
   non si annulla: togliere cancella i file. Cancellare il concerto invece
   non cancella le foto: restano orfane per 30 giorni (lib/foto.ts) e
   «Annulla» le riporta al concerto ripristinato.
   Pubbliche: pages.byHandle dà gli URL di foto e miniature.
   I file caricati e mai usati li cancella il cron dei file orfani
   (gifters.cleanupOrphanLogos), quelli delle foto orfane `pulisciOrfane`.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import { nessunInput } from "../shared/schema/campi.ts";
import {
  FOTO_LATO, FOTO_MAX_BYTES, FOTO_PER_EVENTO, FOTO_TIPO, MINIATURA_LATO, MINIATURA_MAX_BYTES,
  fotoCaricataInput, fotoDiEventoInput, linkFotoInput, spostaFotoInput, togliFotoInput, urlCaricamentoFotoInput,
} from "../shared/schema/foto.ts";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { logActivity } from "./lib/activity.ts";
import { internalMutation, internalQuery, ownerAction, ownerMutation, ownerQuery } from "./lib/builders.ts";
import { errore } from "./lib/errors.ts";
import { cancellaFoto, fileDiFoto, fotoDiEvento, ORFANE_PER_MS } from "./lib/foto.ts";
import { controllaJpeg, type EsitoJpeg } from "./lib/jpeg.ts";
import { getOwned, type Owner } from "./lib/owner.ts";
import { rateLimiter } from "./rateLimits.ts";

/** L'operazione del registro per le foto: si registra, non si annulla (convex/activity.ts). */
export const OP_FOTO = "foto";

const titolo = (e: Pick<Doc<"entries">, "kind" | "artist" | "name" | "date">) => `${e.kind === "festival" ? e.name : e.artist} (${e.date})`;

const caricaProfilo = async (ctx: ActionCtx, userId: string): Promise<Doc<"profiles"> | null> =>
  await ctx.runQuery(internal.profiles.byAuthUser, { authUserId: userId });

const pieno = () => errore("limite_superato", `al massimo ${FOTO_PER_EVENTO} foto per concerto: togline una prima di aggiungerne altre`);

/* ── elenco ───────────────────────────────────────────────────── */

export const dellEvento = ownerQuery({
  dashboardOnly: "pannello del concerto: le foto con gli URL dei file",
  input: fotoDiEventoInput,
  handler: async (ctx, owner, { entryId }) => {
    const e = await getOwned(ctx, owner, "entries", entryId);
    const foto = [];
    for (const f of await fotoDiEvento(ctx, owner.profile._id, e._id)) {
      const [url, miniatura] = [await ctx.storage.getUrl(f.file), await ctx.storage.getUrl(f.miniatura)];
      if (url && miniatura) foto.push({ id: f._id as string, url, miniatura, larghezza: f.larghezza, altezza: f.altezza });
    }
    return { foto, max: FOTO_PER_EVENTO };
  },
});

/**
 * Agenti (MCP e Tour manager): il link al pannello del concerto con il
 * blocco «Foto» in evidenza (`#concerti?apri=<id>&foto=1`), più quante foto
 * ha già. Non scrive niente: le foto le carica il proprietario dal browser,
 * che toglie GPS e dati del telefono (le foto non passano mai dagli agenti).
 * Il link è relativo: MCP lo rende assoluto (src/server/mcp/strumenti.ts).
 */
export const link = ownerQuery({
  catalogOp: "link_foto_concerto",
  input: linkFotoInput,
  handler: async (ctx, owner, { id }) => {
    const e = await getOwned(ctx, owner, "entries", id);
    const n = (await fotoDiEvento(ctx, owner.profile._id, e._id)).length;
    return {
      link: `/${owner.profile.handle}/modifica#concerti?apri=${e._id}&foto=1`,
      foto: n,
      max: FOTO_PER_EVENTO,
      concerto: titolo(e),
    };
  },
});

/** #concerti: quante foto ha ogni evento (il segno nell'elenco). */
export const conteggi = ownerQuery({
  dashboardOnly: "elenco di #concerti: quante foto ha ogni evento",
  input: nessunInput,
  handler: async (ctx, owner) => {
    const n: Record<string, number> = {};
    for (const f of await ctx.db.query("foto").withIndex("by_profile_entry", q => q.eq("profileId", owner.profile._id)).collect()) {
      if (f.orfanaDal === undefined) n[f.entryId] = (n[f.entryId] ?? 0) + 1;
    }
    return { perEvento: n };
  },
});

/* ── caricamento dal browser ──────────────────────────────────── */

export const urlCaricamento = ownerMutation({
  dashboardOnly: "upload dal browser: le foto si caricano solo dalla dashboard",
  input: urlCaricamentoFotoInput,
  handler: async (ctx, owner, { entryId }) => {
    const e = await getOwned(ctx, owner, "entries", entryId);
    if ((await fotoDiEvento(ctx, owner.profile._id, e._id)).length >= FOTO_PER_EVENTO) throw pieno();
    await limiteFoto(ctx, owner);
    return { file: await ctx.storage.generateUploadUrl(), miniatura: await ctx.storage.generateUploadUrl() };
  },
});

async function limiteFoto(ctx: MutationCtx, owner: Owner) {
  const r = await rateLimiter.limit(ctx, "fotoUpload", { key: owner.profile._id });
  if (!r.ok) throw errore("limite_superato", "hai caricato troppe foto oggi: riprova domani", { retryAfter: Math.ceil(r.retryAfter / 1000) });
}

export type EsitoFoto = { ok: true; id: string } | { ok: false; code: "input_non_valido"; messaggio: string };

const MESSAGGI: Record<Exclude<EsitoJpeg, { ok: true }>["motivo"] | "peso", string> = {
  non_jpeg: "il file non è una foto jpeg valida: caricala di nuovo dalla pagina",
  metadati: "la foto ha ancora i metadati (posizione, data, telefono): caricala dalla pagina, che li toglie",
  troppo_grande: "la foto è troppo grande: caricala dalla pagina, che la ridimensiona",
  peso: "la foto pesa troppo: caricala dalla pagina, che la ridimensiona",
};

type StatoFile = { id: Id<"_storage">; size: number; contentType?: string };
type Caricati =
  | { stato: "entry_assente" | "file_assente" | "gia_usato" }
  | { stato: "ok"; entryId: Id<"entries">; file: StatoFile; miniatura: StatoFile };

/** Il controllo dei byte di un file: tipo dichiarato, peso, JPEG senza metadati entro il lato. */
async function controlla(ctx: ActionCtx, f: StatoFile, maxByte: number, lato: number): Promise<EsitoJpeg | { ok: false; motivo: "peso" }> {
  if (f.size > maxByte) return { ok: false, motivo: "peso" };
  if (f.contentType !== FOTO_TIPO) return { ok: false, motivo: "non_jpeg" };
  const blob = await ctx.storage.get(f.id);
  if (!blob) return { ok: false, motivo: "non_jpeg" };
  return controllaJpeg(new Uint8Array(await blob.arrayBuffer()), lato);
}

export const aggiungi = ownerAction({
  dashboardOnly: "upload dal browser: le foto si caricano solo dalla dashboard",
  input: fotoCaricataInput,
  loadProfile: caricaProfilo,
  handler: async (ctx, owner, { entryId, file, miniatura }): Promise<EsitoFoto> => {
    const c: Caricati = await ctx.runQuery(internal.foto.caricati, { profileId: owner.profile._id, entryId, file, miniatura });
    if (c.stato === "entry_assente") throw errore("not_found", "non trovato");
    // un file che non c'è, o che è già la foto di qualcuno: né usarlo né cancellarlo
    if (c.stato !== "ok") throw errore("not_found", "file non trovato: carica di nuovo la foto");
    const ids = [c.file.id, c.miniatura.id];
    const foto = await controlla(ctx, c.file, FOTO_MAX_BYTES, FOTO_LATO);
    const mini = foto.ok ? await controlla(ctx, c.miniatura, MINIATURA_MAX_BYTES, MINIATURA_LATO) : foto;
    if (!foto.ok || !mini.ok) {
      await ctx.runMutation(internal.foto.scarta, { ids });
      const motivo = !foto.ok ? foto.motivo : (mini as { motivo: keyof typeof MESSAGGI }).motivo;
      return { ok: false, code: "input_non_valido", messaggio: MESSAGGI[motivo] };
    }
    const r: { id: string } | { errore: "pieno" | "assente" } = await ctx.runMutation(internal.foto.inserisci, {
      profileId: owner.profile._id, entryId: c.entryId, file: c.file.id, miniatura: c.miniatura.id,
      larghezza: foto.larghezza, altezza: foto.altezza, via: owner.actor.via, label: owner.actor.label,
    });
    if ("errore" in r) {
      await ctx.runMutation(internal.foto.scarta, { ids });
      if (r.errore === "pieno") throw pieno();
      throw errore("not_found", "non trovato");
    }
    return { ok: true, id: r.id };
  },
});

/** Per aggiungi: l'evento del profilo e i due file, se esistono e non sono già foto di qualcuno. */
export const caricati = internalQuery({
  args: { profileId: v.id("profiles"), entryId: v.string(), file: v.string(), miniatura: v.string() },
  handler: async (ctx, a): Promise<Caricati> => {
    const eid = ctx.db.normalizeId("entries", a.entryId);
    const e = eid ? await ctx.db.get(eid) : null;
    if (!e || e.profileId !== a.profileId) return { stato: "entry_assente" };
    const stato = async (raw: string): Promise<StatoFile | "assente" | "usato"> => {
      const id = ctx.db.system.normalizeId("_storage", raw);
      const meta = id ? await ctx.db.system.get(id) : null;
      if (!id || !meta) return "assente";
      if (await fileDiFoto(ctx, id)) return "usato";
      return { id, size: meta.size, contentType: meta.contentType };
    };
    const [file, miniatura] = [await stato(a.file), await stato(a.miniatura)];
    if (file === "usato" || miniatura === "usato") return { stato: "gia_usato" };
    if (file === "assente" || miniatura === "assente" || file.id === miniatura.id) return { stato: "file_assente" };
    return { stato: "ok", entryId: e._id, file, miniatura };
  },
});

/** Un caricamento rifiutato: via i file, purché nel frattempo non siano diventati la foto di qualcuno. */
export const scarta = internalMutation({
  args: { ids: v.array(v.id("_storage")) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    for (const id of ids) if (!(await fileDiFoto(ctx, id)) && (await ctx.db.system.get(id))) await ctx.storage.delete(id);
    return null;
  },
});

const viaV = v.union(v.literal("dashboard"), v.literal("oracolo"), v.literal("mcp"), v.literal("apikey"), v.literal("sistema"));

export const inserisci = internalMutation({
  args: {
    profileId: v.id("profiles"), entryId: v.id("entries"), file: v.id("_storage"), miniatura: v.id("_storage"),
    larghezza: v.number(), altezza: v.number(), via: viaV, label: v.string(),
  },
  handler: async (ctx, a): Promise<{ id: string } | { errore: "pieno" | "assente" }> => {
    const e = await ctx.db.get(a.entryId);
    const profile = await ctx.db.get(a.profileId);
    if (!e || !profile || e.profileId !== a.profileId) return { errore: "assente" };
    // nel frattempo i file sono spariti o sono diventati la foto di un altro
    for (const s of [a.file, a.miniatura]) if ((await fileDiFoto(ctx, s)) || !(await ctx.db.system.get(s))) return { errore: "assente" };
    const gia = await fotoDiEvento(ctx, a.profileId, e._id);
    if (gia.length >= FOTO_PER_EVENTO) return { errore: "pieno" };
    const id = await ctx.db.insert("foto", {
      profileId: a.profileId, entryId: e._id, file: a.file, miniatura: a.miniatura,
      larghezza: a.larghezza, altezza: a.altezza,
      ordine: gia.length ? Math.max(...gia.map(f => f.ordine)) + 1 : 0,
      createdAt: Date.now(),
    });
    await logActivity(ctx, { profile, actor: { via: a.via, label: a.label } }, { op: OP_FOTO, table: "foto", docId: id, summary: `foto aggiunta: ${titolo(e)}` });
    return { id: id as string };
  },
});

/* ── ordine e rimozione ───────────────────────────────────────── */

export const sposta = ownerMutation({
  dashboardOnly: "pannello del concerto: l'ordine delle foto",
  input: spostaFotoInput,
  handler: async (ctx, owner, { id, verso }) => {
    const f = await getOwned(ctx, owner, "foto", id);
    if (f.orfanaDal !== undefined) throw errore("not_found", "non trovato");
    const tutte = await fotoDiEvento(ctx, owner.profile._id, f.entryId);
    const i = tutte.findIndex(x => x._id === f._id);
    const j = verso === "prima" ? i - 1 : i + 1;
    if (j < 0 || j >= tutte.length) return { ok: true as const };
    const altra = tutte[j];
    // ordini uguali (non dovrebbe succedere): si riparte dagli indici
    const [a, b] = f.ordine === altra.ordine ? [j, i] : [altra.ordine, f.ordine];
    await ctx.db.patch(f._id, { ordine: a });
    await ctx.db.patch(altra._id, { ordine: b });
    const e = await ctx.db.get(f.entryId);
    await logActivity(ctx, owner, { op: OP_FOTO, table: "foto", docId: f._id, summary: `foto spostata: ${e ? titolo(e) : "concerto"}` });
    return { ok: true as const };
  },
});

export const togli = ownerMutation({
  dashboardOnly: "pannello del concerto: togliere una foto cancella i file",
  input: togliFotoInput,
  handler: async (ctx, owner, { id }) => {
    const f = await getOwned(ctx, owner, "foto", id);
    if (f.orfanaDal !== undefined) throw errore("not_found", "non trovato");
    const e = await ctx.db.get(f.entryId);
    await cancellaFoto(ctx, f);
    await logActivity(ctx, owner, { op: OP_FOTO, table: "foto", docId: f._id, summary: `foto tolta: ${e ? titolo(e) : "concerto"}` });
    return { ok: true as const };
  },
});

/* ── cron ─────────────────────────────────────────────────────── */

/** Cron: le foto dei concerti cancellati da più di 30 giorni (nessun Annulla), con i file. */
export const pulisciOrfane = internalMutation({
  args: {},
  returns: v.null(),
  handler: async ctx => {
    const limite = Date.now() - ORFANE_PER_MS;
    const vecchie = await ctx.db.query("foto").withIndex("by_orfana", q => q.gt("orfanaDal", 0).lt("orfanaDal", limite)).take(200);
    for (const f of vecchie) await cancellaFoto(ctx, f);
    if (vecchie.length === 200) await ctx.scheduler.runAfter(0, internal.foto.pulisciOrfane, {});
    return null;
  },
});
