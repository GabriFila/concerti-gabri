/* ──────────────────────────────────────────────────────────────
   "Regalato da" (PIANO §5.1, T5 #regali): elenco, aggiungi, modifica,
   cancella e logo.

   Logo dal browser (solo dashboard): generateLogoUploadUrl → POST del
   file → setLogo (una action, perché solo un'action legge i byte di un
   file): png, jpeg o webp fino a 256 KB, e il tipo dichiarato al
   caricamento deve combaciare con i primi byte del file (Convex lo serve
   con quel Content-Type). Un file rifiutato si cancella subito e setLogo
   risponde `{ok: false, code, messaggio}` invece di lanciare. Il logo
   precedente si cancella quando arriva il nuovo.
   Gli agenti usano set_gifter_logo con un URL https (setLogoFromUrl): il
   server lo scarica (al massimo 256 KB, seguendo a mano al massimo 3
   redirect, ognuno ricontrollato: https e mai un host locale), riconosce
   il tipo dai primi byte e lo salva. Entrambe le strade consumano
   `logoUpload`.
   Un cambio di logo va nel registro ma non si annulla (op "logo"): il file
   di prima non c'è più. Per lo stesso motivo un "regalato da" cancellato
   e poi ripristinato torna senza il logo caricato.
   Un cron cancella i file caricati e mai usati (dopo 24 ore).
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import { nessunInput } from "../shared/schema/campi.ts";
import { LOGO_MAX_BYTES, LOGO_TIPI, logoCaricatoInput, urlCaricamentoLogoInput } from "../shared/schema/dashboard.ts";
import { aggiungiRegaloInput, cancellaRegaloInput, logoRegaloInput, modificaRegaloInput } from "../shared/schema/gifter.ts";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { USER_AGENT } from "./geo.ts";
import { istantanea, logActivity } from "./lib/activity.ts";
import { internalMutation, internalQuery, limitaAgente, ownerAction, ownerMutation, ownerQuery } from "./lib/builders.ts";
import { errore } from "./lib/errors.ts";
import { getOwned, type Actor, type Owner } from "./lib/owner.ts";
import { chiave, giftersOf } from "./lib/refs.ts";
import { rateLimiter } from "./rateLimits.ts";

/** L'operazione del registro per i cambi di logo: si registra, non si annulla (convex/activity.ts). */
export const OP_LOGO = "logo";
/** Un file caricato e non usato da nessun "regalato da" si cancella dopo questo tempo (cron). */
export const ORFANI_DOPO_MS = 24 * 3600_000;
const SCARICA_TIMEOUT_MS = 10_000;

const NON_VALIDO = "il logo deve essere un'immagine png, jpeg o webp fino a 256 KB";

type Logo = Doc<"gifters">["logo"];
type Autore = { profile: Doc<"profiles">; actor: Pick<Actor, "via" | "label"> };
const storageDi = (logo: Logo): Id<"_storage"> | undefined => (logo && "storageId" in logo ? logo.storageId : undefined);

async function entriesOf(ctx: QueryCtx, profileId: Id<"profiles">) {
  return await ctx.db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", profileId)).collect();
}

async function logoUrl(ctx: QueryCtx, g: Doc<"gifters">): Promise<string | undefined> {
  if (!g.logo) return undefined;
  if ("url" in g.logo) return g.logo.url;
  return (await ctx.storage.getUrl(g.logo.storageId)) ?? undefined;
}

/** Cancella un file di `_storage` se c'è ancora. */
export async function cancellaFile(ctx: MutationCtx, id: Id<"_storage">) {
  if (await ctx.db.system.get(id)) await ctx.storage.delete(id);
}

/** Il "regalato da" (di qualunque profilo) che usa questo file come logo. */
async function gifterCheUsa(ctx: QueryCtx, id: Id<"_storage">) {
  for (const g of await ctx.db.query("gifters").collect()) if (storageDi(g.logo) === id) return g;
  return null;
}

async function limiteLogo(ctx: MutationCtx | ActionCtx, owner: Owner) {
  const r = await rateLimiter.limit(ctx, "logoUpload", { key: owner.profile._id });
  if (!r.ok) throw errore("limite_superato", "hai caricato troppi loghi oggi: riprova domani", { retryAfter: Math.ceil(r.retryAfter / 1000) });
}

const caricaProfilo = async (ctx: ActionCtx, userId: string): Promise<Doc<"profiles"> | null> =>
  await ctx.runQuery(internal.profiles.byAuthUser, { authUserId: userId });

/** Mette (o toglie) il logo, cancella il file di prima e lo registra (non annullabile). */
async function applicaLogo(ctx: MutationCtx, autore: Autore, g: Doc<"gifters">, logo: Logo) {
  const prima = storageDi(g.logo);
  const dopo = storageDi(logo);
  if (prima && prima === dopo) return;
  await ctx.db.patch(g._id, { logo });
  if (prima) await cancellaFile(ctx, prima);
  await logActivity(ctx, autore, {
    op: OP_LOGO, table: "gifters", docId: g._id,
    summary: logo ? `logo di "${g.label}" aggiornato` : `logo di "${g.label}" tolto`,
  });
}

/* ── elenco e scritture del catalogo ──────────────────────────── */

export const list = ownerQuery({
  catalogOp: "list_gifters",
  input: nessunInput,
  handler: async (ctx, owner) => ({
    gifters: (await giftersOf(ctx, owner.profile._id)).map(g => ({ id: g._id as string, label: g.label, url: g.url })),
  }),
});

/** #regali: in più il logo e quanti concerti usano ciascuno (per bloccare la cancellazione già nella UI). */
export const dettagli = ownerQuery({
  dashboardOnly: "UI di #regali: logo e uso nei concerti (gli agenti usano list_gifters)",
  input: nessunInput,
  handler: async (ctx, owner) => {
    const entries = await entriesOf(ctx, owner.profile._id);
    const gifters = [];
    for (const g of await giftersOf(ctx, owner.profile._id)) {
      gifters.push({
        id: g._id as string,
        label: g.label,
        url: g.url,
        logoUrl: await logoUrl(ctx, g),
        logoCaricato: !!storageDi(g.logo),
        concerti: entries.filter(e => e.giftFromId === g._id).length,
      });
    }
    return { gifters };
  },
});

export const add = ownerMutation({
  catalogOp: "add_gifter",
  input: aggiungiRegaloInput,
  handler: async (ctx, owner, { label, url }) => {
    if ((await giftersOf(ctx, owner.profile._id)).some(g => chiave(g.label) === chiave(label))) {
      throw errore("conflitto", "esiste già un \"regalato da\" con questo nome", { campo: "label" });
    }
    const id = await ctx.db.insert("gifters", { profileId: owner.profile._id, label, url });
    await logActivity(ctx, owner, { op: "create", table: "gifters", docId: id, summary: `"regalato da" aggiunto: ${label}`, after: istantanea(await ctx.db.get(id)) });
    return { id: id as string };
  },
});

export const update = ownerMutation({
  catalogOp: "update_gifter",
  input: modificaRegaloInput,
  handler: async (ctx, owner, { id, label, url }) => {
    const g = await getOwned(ctx, owner, "gifters", id);
    if (label !== undefined && (await giftersOf(ctx, owner.profile._id)).some(x => x._id !== g._id && chiave(x.label) === chiave(label))) {
      throw errore("conflitto", "esiste già un \"regalato da\" con questo nome", { campo: "label" });
    }
    await ctx.db.patch(g._id, {
      ...(label !== undefined ? { label } : {}),
      ...(url !== undefined ? { url: url ?? undefined } : {}),
    });
    await logActivity(ctx, owner, { op: "update", table: "gifters", docId: g._id, summary: `"regalato da" modificato: ${label ?? g.label}`, before: istantanea(g), after: istantanea(await ctx.db.get(g._id)) });
    return { ok: true as const };
  },
});

export const remove = ownerMutation({
  catalogOp: "delete_gifter",
  input: cancellaRegaloInput,
  handler: async (ctx, owner, { id }) => {
    const g = await getOwned(ctx, owner, "gifters", id);
    const usati = (await entriesOf(ctx, owner.profile._id)).filter(e => e.giftFromId === g._id);
    if (usati.length) {
      throw errore("in_uso", `è usato da ${usati.length} concerti: toglilo lì prima di cancellarlo`, {
        concerti: usati.slice(0, 20).map(e => `${e.date} · ${e.artist ?? e.name ?? ""}`),
      });
    }
    // il file del logo se ne va con lui: Annulla lo ripristina senza il logo caricato
    const file = storageDi(g.logo);
    if (file) await cancellaFile(ctx, file);
    await ctx.db.delete(g._id);
    const prima = file ? { ...g, logo: undefined } : g;
    await logActivity(ctx, owner, { op: "delete", table: "gifters", docId: g._id, summary: `"regalato da" cancellato: ${g.label}`, before: istantanea(prima) });
    return { ok: true as const };
  },
});

/* ── logo dal browser (solo dashboard) ────────────────────────── */

export const generateLogoUploadUrl = ownerMutation({
  dashboardOnly: "upload dal browser; gli agenti usano set_gifter_logo con un URL",
  input: urlCaricamentoLogoInput,
  handler: async (ctx, owner, { id }) => {
    await getOwned(ctx, owner, "gifters", id);
    await limiteLogo(ctx, owner);
    return { url: await ctx.storage.generateUploadUrl() };
  },
});

export type EsitoLogo = { ok: true } | { ok: false; code: "input_non_valido"; messaggio: string };

export const setLogo = ownerAction({
  dashboardOnly: "upload dal browser; gli agenti usano set_gifter_logo con un URL",
  input: logoCaricatoInput,
  loadProfile: caricaProfilo,
  handler: async (ctx, owner, { id, storageId }): Promise<EsitoLogo> => {
    const gifterId: Id<"gifters"> | null = await ctx.runQuery(internal.gifters.delProfilo, { profileId: owner.profile._id, gifterId: id });
    if (!gifterId) throw errore("not_found", "non trovato");
    const autore = { profileId: owner.profile._id, gifterId, via: owner.actor.via, label: owner.actor.label };
    if (storageId === null) {
      if (!(await ctx.runMutation(internal.gifters.applicaLogoInterno, { ...autore, storageId: null }))) throw errore("not_found", "non trovato");
      return { ok: true };
    }
    const file: FileCaricato = await ctx.runQuery(internal.gifters.fileCaricato, { gifterId, storageId });
    if (file.stato !== "libero") {
      if (file.stato === "giaSuo") return { ok: true };
      // il logo di un altro (o un file che non c'è): né usarlo né cancellarlo
      throw errore("not_found", "file non trovato: caricalo di nuovo");
    }
    const blob = await ctx.storage.get(file.id);
    const testa = blob ? new Uint8Array(await blob.slice(0, 12).arrayBuffer()) : new Uint8Array();
    if (!blob || file.size > LOGO_MAX_BYTES || !(LOGO_TIPI as readonly string[]).includes(file.contentType ?? "") || tipoImmagine(testa) !== file.contentType) {
      await ctx.runMutation(internal.gifters.scartaCaricamento, { storageId: file.id });
      return { ok: false, code: "input_non_valido", messaggio: NON_VALIDO };
    }
    if (!(await ctx.runMutation(internal.gifters.applicaLogoInterno, { ...autore, storageId: file.id }))) throw errore("not_found", "file non trovato: caricalo di nuovo");
    return { ok: true };
  },
});

type FileCaricato =
  | { stato: "assente" | "altrui" | "giaSuo" }
  | { stato: "libero"; id: Id<"_storage">; contentType?: string; size: number };

/** Per setLogo: il file caricato, se esiste e se non è già il logo di qualcuno. */
export const fileCaricato = internalQuery({
  args: { gifterId: v.id("gifters"), storageId: v.string() },
  handler: async (ctx, { gifterId, storageId }): Promise<FileCaricato> => {
    const id = ctx.db.system.normalizeId("_storage", storageId);
    const meta = id ? await ctx.db.system.get(id) : null;
    if (!id || !meta) return { stato: "assente" };
    const usatoDa = await gifterCheUsa(ctx, id);
    if (usatoDa) return { stato: usatoDa._id === gifterId ? "giaSuo" : "altrui" };
    return { stato: "libero", id, contentType: meta.contentType, size: meta.size };
  },
});

/** Un caricamento rifiutato: via il file, purché nel frattempo non sia diventato il logo di qualcuno. */
export const scartaCaricamento = internalMutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    if (!(await gifterCheUsa(ctx, storageId))) await cancellaFile(ctx, storageId);
    return null;
  },
});

/* ── logo da URL (agenti: set_gifter_logo) ────────────────────── */

/** Il tipo di un'immagine dai primi byte (png, jpeg, webp), o null. */
export function tipoImmagine(b: Uint8Array): (typeof LOGO_TIPI)[number] | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Host che non si scaricano mai: nomi locali e indirizzi IP scritti a mano. */
const hostVietato = (h: string) =>
  /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(h) || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith("[");

/** Redirect seguiti al massimo, uno per uno (ognuno ricontrollato). */
const MAX_REDIRECT = 3;

/** L'URL se è https e il suo host è pubblico; altrimenti input_non_valido (senza ripetere l'URL). */
function urlPubblico(raw: string, base?: URL): URL {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    throw errore("input_non_valido", "url: serve un indirizzo https pubblico", { campo: "url" });
  }
  if (url.protocol !== "https:" || hostVietato(url.hostname)) throw errore("input_non_valido", "url: serve un indirizzo https pubblico", { campo: "url" });
  return url;
}

const nonScaricabile = () => errore("non_disponibile", "non riesco a scaricare il logo: controlla l'URL e riprova", { campo: "url" });

/**
 * La risposta finale di un GET, seguendo a mano i redirect: ogni Location
 * passa da `urlPubblico` PRIMA di essere chiesta, così un redirect verso un
 * host locale non parte mai.
 */
async function getSenzaRedirectLocali(primo: URL, signal: AbortSignal): Promise<Response> {
  let url = primo;
  for (let salti = 0; ; salti++) {
    let res: Response;
    try {
      res = await fetch(url, { signal, redirect: "manual", headers: { "User-Agent": USER_AGENT, Accept: LOGO_TIPI.join(",") } });
    } catch {
      throw nonScaricabile();
    }
    // un redirect che il runtime non lascia leggere non si segue
    if (res.type === "opaqueredirect") throw nonScaricabile();
    if (res.status < 300 || res.status >= 400) {
      // se il runtime avesse seguito da sé, l'URL finale deve comunque essere pubblico
      if (res.url) urlPubblico(res.url);
      return res;
    }
    const dove = res.headers.get("location");
    await res.body?.cancel().catch(() => undefined);
    if (!dove || salti >= MAX_REDIRECT) throw nonScaricabile();
    url = urlPubblico(dove, url);
  }
}

/** Legge al massimo `max` byte della risposta (poi smette). */
async function leggiFinoA(res: Response, max: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer()).subarray(0, max);
  const reader = res.body.getReader();
  const parti: Uint8Array[] = [];
  let n = 0;
  while (n < max) {
    const { done, value } = await reader.read();
    if (done) break;
    parti.push(value);
    n += value.length;
  }
  await reader.cancel().catch(() => undefined);
  const out = new Uint8Array(Math.min(n, max));
  let i = 0;
  for (const p of parti) {
    if (i >= out.length) break;
    const pezzo = p.subarray(0, out.length - i);
    out.set(pezzo, i);
    i += pezzo.length;
  }
  return out;
}

/** Scarica un logo da un URL https pubblico: png, jpeg o webp fino a 256 KB. Gli errori non ripetono l'URL. */
export async function scaricaLogo(raw: string): Promise<Blob> {
  const url = urlPubblico(raw);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SCARICA_TIMEOUT_MS);
  try {
    const res = await getSenzaRedirectLocali(url, ctrl.signal);
    if (!res.ok) throw nonScaricabile();
    if (Number(res.headers.get("content-length") ?? 0) > LOGO_MAX_BYTES) throw errore("input_non_valido", `url: ${NON_VALIDO}`, { campo: "url" });
    const bytes = await leggiFinoA(res, LOGO_MAX_BYTES + 1);
    const tipo = tipoImmagine(bytes);
    if (bytes.length > LOGO_MAX_BYTES || !tipo) throw errore("input_non_valido", `url: ${NON_VALIDO}`, { campo: "url" });
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: tipo });
  } finally {
    clearTimeout(timer);
  }
}

export const setLogoFromUrl = ownerAction({
  catalogOp: "set_gifter_logo",
  input: logoRegaloInput,
  loadProfile: caricaProfilo,
  handler: async (ctx, owner, { id, url }) => {
    await limitaAgente(ctx, owner);
    const gifterId: Id<"gifters"> | null = await ctx.runQuery(internal.gifters.delProfilo, { profileId: owner.profile._id, gifterId: id });
    if (!gifterId) throw errore("not_found", "non trovato");
    let storageId: Id<"_storage"> | null = null;
    if (url !== null) {
      await limiteLogo(ctx, owner);
      storageId = await ctx.storage.store(await scaricaLogo(url));
    }
    const fatto: boolean = await ctx.runMutation(internal.gifters.applicaLogoInterno, {
      profileId: owner.profile._id, gifterId, storageId, via: owner.actor.via, label: owner.actor.label,
    });
    if (!fatto) {
      // il "regalato da" è sparito nel frattempo: niente file appesi
      if (storageId) await ctx.storage.delete(storageId);
      throw errore("not_found", "non trovato");
    }
    return { ok: true as const };
  },
});

/** Per setLogoFromUrl: l'id del "regalato da" se è del profilo. */
export const delProfilo = internalQuery({
  args: { profileId: v.id("profiles"), gifterId: v.string() },
  handler: async (ctx, { profileId, gifterId }) => {
    const id = ctx.db.normalizeId("gifters", gifterId);
    const g = id ? await ctx.db.get(id) : null;
    return g && g.profileId === profileId ? g._id : null;
  },
});

const viaV = v.union(v.literal("dashboard"), v.literal("oracolo"), v.literal("mcp"), v.literal("apikey"), v.literal("sistema"));

export const applicaLogoInterno = internalMutation({
  args: { profileId: v.id("profiles"), gifterId: v.id("gifters"), storageId: v.union(v.id("_storage"), v.null()), via: viaV, label: v.string() },
  returns: v.boolean(),
  handler: async (ctx, a) => {
    const g = await ctx.db.get(a.gifterId);
    const profile = await ctx.db.get(a.profileId);
    if (!g || !profile || g.profileId !== a.profileId) return false;
    if (a.storageId) {
      // nel frattempo il file è sparito o è diventato il logo di un altro
      const usatoDa = await gifterCheUsa(ctx, a.storageId);
      if ((usatoDa && usatoDa._id !== g._id) || !(await ctx.db.system.get(a.storageId))) return false;
    }
    await applicaLogo(ctx, { profile, actor: { via: a.via, label: a.label } }, g, a.storageId ? { storageId: a.storageId } : undefined);
    return true;
  },
});

/** Cron: i file caricati più di 24 ore fa e non usati come logo da nessuno. */
export const cleanupOrphanLogos = internalMutation({
  args: {},
  returns: v.null(),
  handler: async ctx => {
    const usati = new Set<string>();
    for (const g of await ctx.db.query("gifters").collect()) {
      const s = storageDi(g.logo);
      if (s) usati.add(s);
    }
    const limite = Date.now() - ORFANI_DOPO_MS;
    let cancellati = 0;
    // dal più vecchio: ci si ferma ai file recenti
    for await (const f of ctx.db.system.query("_storage")) {
      if (f._creationTime >= limite || cancellati >= 500) break;
      if (usati.has(f._id)) continue;
      await ctx.storage.delete(f._id);
      cancellati++;
    }
    return null;
  },
});
