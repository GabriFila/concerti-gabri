/* ──────────────────────────────────────────────────────────────
   Agenti (PIANO traguardo 7): API key e client OAuth del proprietario,
   l'introspezione dei token per /mcp, le statistiche per get_stats e i
   cron di pulizia.

   - Le chiavi e i client stanno nelle tabelle del componente Better Auth
     (lib/agentToken.ts). Crearle, elencarle e revocarle si fa solo dalla
     dashboard (`dashboardOnly`): un token non crea né revoca token.
   - Una API key si vede UNA volta sola, alla creazione: nel database c'è
     solo il suo SHA-256 (come @better-auth/api-key).
   - `introspect` dice a /mcp se un token è valido (e fino a quando), senza
     mai ripeterlo; ogni funzione lo riverifica comunque da sé.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import { SCOPE_AMMESSI } from "../shared/agent/mcp.ts";
import { concertsOf, type Entry, type FestivalConcert } from "../shared/model/concert.ts";
import { computeKpis } from "../shared/lib/kpis.ts";
import { nessunInput } from "../shared/schema/campi.ts";
import { consensoInput, creaChiaveInput, revocaChiaveInput, revocaClientInput } from "../shared/schema/agenti.ts";
import { statisticheInput } from "../shared/schema/entry.ts";
import type { MutationCtx } from "./_generated/server";
import { guardiaSviluppo } from "./devtools.ts";
import { internalMutation, ownerMutation, ownerQuery, publicQuery } from "./lib/builders.ts";
import { errore } from "./lib/errors.ts";
import { esterno, nomiPerEsterno } from "./lib/refs.ts";
import {
  PREFISSO_CHIAVE, adapterAuth, hashChiave, nomePulito, nuovaChiave, richiestaDiConsenso, trovaTutti, trovaUno, verificaToken,
} from "./lib/agentToken.ts";

const GIORNO_MS = 24 * 3600_000;
/** Un client registrato (DCR) che in 24 ore non ha ottenuto token si cancella. */
export const DCR_SENZA_TOKEN_MS = GIORNO_MS;
/** Quante righe al massimo pulisce un giro di cron (il successivo continua). */
const PULIZIA_MAX = 500;

const ms = (x: unknown): number | undefined => (typeof x === "number" ? x : undefined);
const testo = (x: unknown): string | undefined => (typeof x === "string" && x ? x : undefined);

/** Gli indirizzi (host con porta, o l'app) degli URL di ritorno di un client OAuth: è lì che finiscono i codici. */
function hostDi(redirectUrls: unknown): string[] {
  const hosts = new Set<string>();
  for (const u of (testo(redirectUrls) ?? "").split(",")) {
    try {
      hosts.add(ritornoDi(new URL(u.trim())).indirizzo);
    } catch {
      // un URL non valido non si mostra
    }
  }
  return [...hosts];
}

/**
 * Tutti i token OAuth (o i consensi) di `userId`, senza tetto: mcp() 1.6
 * crea una riga nuova a ogni refresh e non cancella le vecchie, e le più
 * nuove (le ultime nell'ordine dell'indice) sono proprio quelle in uso.
 * Una sola condizione, sull'indice `userId`: con due l'adapter non trova un
 * indice composto e scorre tutta la tabella.
 */
const righeOAuthDi = (ctx: Parameters<typeof trovaTutti>[0], model: "oauthAccessToken" | "oauthConsent", userId: string) =>
  trovaTutti(ctx, model, [{ field: "userId", value: userId }], Infinity);

/* ── introspezione (per /mcp) ─────────────────────────────────── */

/**
 * Il token è valido? Pubblica: risponde solo a chi ha già il token, e dice
 * solo tipo, scope e scadenza. Nessun errore ripete il token.
 */
export const introspect = publicQuery({
  args: { agentToken: v.optional(v.any()) },
  returns: v.union(
    v.null(),
    v.object({
      via: v.union(v.literal("apikey"), v.literal("mcp")),
      clientId: v.optional(v.string()),
      scopes: v.array(v.string()),
      expiresAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, { agentToken }: { agentToken?: unknown }) => {
    const t = await verificaToken(ctx, agentToken);
    if (!t) return null;
    return { via: t.via, ...(t.clientId ? { clientId: t.clientId } : {}), scopes: t.scopes, ...(t.expiresAt !== undefined ? { expiresAt: t.expiresAt } : {}) };
  },
});

/* ── #agenti: chiavi e client del proprietario ─────────────────── */

const SOLO_DASHBOARD = "un token non crea, elenca né revoca token (si gestiscono in #agenti)";

export const list = ownerQuery({
  dashboardOnly: SOLO_DASHBOARD,
  input: nessunInput,
  handler: async (ctx, owner) => {
    const userId = owner.actor.userId;
    const chiavi = (await trovaTutti(ctx, "apikey", [{ field: "referenceId", value: userId }], 200)).map(k => ({
      id: String(k._id),
      nome: testo(k.name) ?? "API key",
      inizio: testo(k.start),
      creata: ms(k.createdAt) ?? (k._creationTime as number),
      scade: ms(k.expiresAt),
      attiva: k.enabled !== false && !(ms(k.expiresAt) !== undefined && ms(k.expiresAt)! <= Date.now()),
    }));
    // i client OAuth: quelli con almeno un token (access o refresh) ancora valido
    const now = Date.now();
    const perClient = new Map<string, { ultimoUso: number; scade: number }>();
    for (const t of await righeOAuthDi(ctx, "oauthAccessToken", userId)) {
      const clientId = testo(t.clientId);
      if (!clientId) continue;
      const scade = Math.max(ms(t.accessTokenExpiresAt) ?? 0, ms(t.refreshTokenExpiresAt) ?? 0);
      if (scade <= now) continue;
      const prima = perClient.get(clientId);
      const uso = ms(t.createdAt) ?? (t._creationTime as number);
      perClient.set(clientId, { ultimoUso: Math.max(prima?.ultimoUso ?? 0, uso), scade: Math.max(prima?.scade ?? 0, scade) });
    }
    const client = [];
    for (const [clientId, info] of perClient) {
      const app = await trovaUno(ctx, "oauthApplication", [{ field: "clientId", value: clientId }]);
      client.push({ clientId, nome: nomePulito(app?.name) ?? "Client senza nome", host: hostDi(app?.redirectUrls), ...info });
    }
    client.sort((a, b) => b.ultimoUso - a.ultimoUso);
    return { chiavi, client };
  },
});

/** Dove torna il browser col codice: com'è l'indirizzo del redirect_uri. */
type TipoRitorno = "https" | "http" | "locale" | "app";

/** Al massimo `n` caratteri, con "…" se tagliato. */
const corto = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * L'indirizzo da mostrare per un redirect_uri e il suo tipo. Per http(s)
 * l'host con la porta; per un'app (schema proprio, es. `cursor://…`, che la
 * registrazione dinamica accetta) lo schema con l'host, o l'URI intero se
 * l'host manca (`com.example.app:/callback`), così non resta mai vuoto.
 */
export function ritornoDi(url: URL): { indirizzo: string; tipo: TipoRitorno } {
  const web = url.protocol === "https:" || url.protocol === "http:";
  if (!web) return { indirizzo: corto(url.host ? `${url.protocol}//${url.host}` : url.href, 120), tipo: "app" };
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return { indirizzo: url.host, tipo: "locale" };
  return { indirizzo: url.host, tipo: url.protocol === "https:" ? "https" : "http" };
}

/**
 * /autorizza: chi chiede di collegarsi e a quale indirizzo tornerà il
 * browser col codice (il `redirect_uri`, che Better Auth ha già confrontato
 * con quelli registrati dal client). Solo per la richiesta del proprietario
 * stesso; scaduta, già usata, di un altro utente o con scope diversi da
 * `concerti`/`offline_access` (authMcp.ts li toglie già) = `not_found`.
 */
export const consenso = ownerQuery({
  dashboardOnly: "la pagina di consenso OAuth (/autorizza): la vede solo il proprietario, nel suo browser",
  input: consensoInput,
  handler: async (ctx, owner, { consentCode }) => {
    const nonTrovata = () => errore("not_found", "richiesta di collegamento non trovata, scaduta o già usata: ricomincia dall'app che vuoi collegare");
    const r = await richiestaDiConsenso(ctx, consentCode);
    if (!r || r.userId !== owner.actor.userId) throw nonTrovata();
    if (r.scopes.some(s => !SCOPE_AMMESSI.includes(s))) throw nonTrovata();
    const app = await trovaUno(ctx, "oauthApplication", [{ field: "clientId", value: r.clientId }]);
    if (!app || app.disabled === true) throw nonTrovata();
    let url: URL;
    try {
      url = new URL(r.redirectURI);
    } catch {
      throw nonTrovata();
    }
    const { indirizzo, tipo } = ritornoDi(url);
    return {
      handle: owner.profile.handle ?? null,
      // il nome lo sceglie il client: ripulito e tagliato come nel registro
      cliente: nomePulito(app.name) ?? "Client senza nome",
      host: indirizzo,
      tipo,
      scopes: r.scopes,
      scade: r.expiresAt,
    };
  },
});

/** Scrive una API key nuova per `userId` (solo l'hash) e restituisce la chiave, l'unica volta. */
async function scriviChiave(ctx: MutationCtx, userId: string, nome: string, scadenzaGiorni?: number) {
  const chiave = nuovaChiave();
  const now = Date.now();
  const riga = await ctx.runMutation(adapterAuth().create, {
    input: {
      model: "apikey",
      data: {
        configId: "default",
        name: nome,
        // i primi caratteri, per riconoscerla nell'elenco (come fa il plugin)
        start: chiave.slice(0, PREFISSO_CHIAVE.length + 6),
        prefix: PREFISSO_CHIAVE,
        key: await hashChiave(chiave),
        referenceId: userId,
        enabled: true,
        // niente limite del plugin (predefinito: 10 al giorno): vale agentWrites
        rateLimitEnabled: false,
        requestCount: 0,
        ...(scadenzaGiorni ? { expiresAt: now + scadenzaGiorni * GIORNO_MS } : {}),
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  return { id: String(riga._id), chiave };
}

export const createApiKey = ownerMutation({
  dashboardOnly: SOLO_DASHBOARD,
  input: creaChiaveInput,
  handler: async (ctx, owner, { nome, scadenzaGiorni }) => await scriviChiave(ctx, owner.actor.userId, nome, scadenzaGiorni),
});

/** Solo sviluppo e test (guardia di devtools): una API key per il proprietario di `handle` (e2e, Claude Code in locale). */
export const chiaveDiProva = internalMutation({
  args: { handle: v.string(), nome: v.optional(v.string()) },
  handler: async (ctx, { handle, nome }) => {
    guardiaSviluppo();
    const p = await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", handle)).first();
    if (!p?.authUserId) throw new Error("chiaveDiProva: profilo inesistente o senza utente");
    return await scriviChiave(ctx, p.authUserId, nome ?? "Prova");
  },
});

export const revokeApiKey = ownerMutation({
  dashboardOnly: SOLO_DASHBOARD,
  input: revocaChiaveInput,
  handler: async (ctx, owner, { id }) => {
    const k = await trovaUno(ctx, "apikey", [{ field: "_id", value: id }]).catch(() => null);
    if (!k || k.referenceId !== owner.actor.userId) throw errore("not_found", "non trovato");
    await ctx.runMutation(adapterAuth().deleteOne, { input: { model: "apikey", where: [{ field: "_id", value: id }] } });
    return { ok: true as const };
  },
});

export const revokeOAuthClient = ownerMutation({
  dashboardOnly: SOLO_DASHBOARD,
  input: revocaClientInput,
  handler: async (ctx, owner, { clientId }) => {
    const userId = owner.actor.userId;
    const mie = async (model: "oauthAccessToken" | "oauthConsent") => (await righeOAuthDi(ctx, model, userId)).filter(x => x.clientId === clientId);
    const token = await mie("oauthAccessToken");
    const consensi = await mie("oauthConsent");
    if (!token.length && !consensi.length) throw errore("not_found", "non trovato");
    for (const [model, righe] of [["oauthAccessToken", token], ["oauthConsent", consensi]] as const) {
      for (const r of righe) await ctx.runMutation(adapterAuth().deleteOne, { input: { model, where: [{ field: "_id", value: String(r._id) }] } });
    }
    return { ok: true as const, revocati: token.length };
  },
});

/* ── get_stats ───────────────────────────────────────────────── */

/** I concerti del proprietario nel modello condiviso (nomi al posto degli id), per computeKpis. */
function versoModello(e: ReturnType<typeof esterno>, y: number): Entry {
  const evento = {
    y,
    date: e.date,
    venue: e.venue,
    city: e.city,
    ...(e.cost !== undefined ? { cost: e.cost } : {}),
    ...(e.gift ? { gift: true } : {}),
    ...(e.giftFrom ? { giftFrom: e.giftFrom } : {}),
    ...(e.accredito ? { accredito: true } : {}),
    ...(e.from ? { from: e.from } : {}),
    ...(e.km !== undefined ? { km: e.km } : {}),
  };
  if ("concerts" in e && e.concerts) {
    const concerts = e.concerts.map(c => Object.fromEntries(Object.entries(c).filter(([, x]) => x !== undefined)) as unknown as FestivalConcert);
    return { ...evento, name: e.name ?? "", concerts: concerts as [FestivalConcert, FestivalConcert, ...FestivalConcert[]] };
  }
  const c = e as { artist?: string; with: string[]; voto?: 1 | 2 | 3 | 4 | 5; vicinanza?: 1 | 2 | 3 | 4 | 5 | 6; canzoniNote?: 1 | 2 | 3 | 4 | 5 | "na" };
  return {
    ...evento,
    artist: c.artist ?? "",
    with: c.with,
    ...(c.voto !== undefined ? { voto: c.voto } : {}),
    ...(c.vicinanza !== undefined ? { vicinanza: c.vicinanza } : {}),
    ...(c.canzoniNote !== undefined ? { canzoniNote: c.canzoniNote } : {}),
  };
}

export const stats = ownerQuery({
  catalogOp: "get_stats",
  input: statisticheInput,
  handler: async (ctx, owner, { anno }) => {
    let rows = await ctx.db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", owner.profile._id)).collect();
    if (anno !== undefined) rows = rows.filter(e => e.y === anno);
    const nomi = await nomiPerEsterno(ctx, owner.profile._id, rows);
    const entries = rows.map(e => versoModello(esterno(e, nomi), e.y));
    const kpi = computeKpis(entries, Date.now()).map(k => ({
      id: k.id,
      etichetta: k.lbl,
      valore: k.star ? `${k.value}★` : k.value,
      ...(k.hint ? { nota: k.hint } : {}),
    }));
    return {
      ...(anno !== undefined ? { anno } : {}),
      eventi: entries.length,
      concerti: entries.flatMap(concertsOf).length,
      kmInAttesa: rows.filter(e => e.kmPending).length,
      kpi,
    };
  },
});

/* ── cron ────────────────────────────────────────────────────── */

/** Cron: i client della registrazione dinamica che in 24 ore non hanno ottenuto token. */
export const cleanupDcrClients = internalMutation({
  args: {},
  returns: v.null(),
  handler: async ctx => {
    const limite = Date.now() - DCR_SENZA_TOKEN_MS;
    const vecchi = await trovaTutti(ctx, "oauthApplication", [{ field: "createdAt", operator: "lt", value: limite }], PULIZIA_MAX);
    for (const app of vecchi) {
      const clientId = testo(app.clientId);
      if (clientId && (await trovaUno(ctx, "oauthAccessToken", [{ field: "clientId", value: clientId }]))) continue;
      await ctx.runMutation(adapterAuth().deleteOne, { input: { model: "oauthApplication", where: [{ field: "_id", value: String(app._id) }] } });
    }
    return null;
  },
});

/** Cron: token OAuth che non si possono più usare né rinnovare, e API key scadute. */
export const cleanupExpiredTokens = internalMutation({
  args: {},
  returns: v.null(),
  handler: async ctx => {
    const now = Date.now();
    // un refresh non revoca i token vecchi (mcp() 1.6): restano finché non scadono
    const token = await trovaTutti(ctx, "oauthAccessToken", [{ field: "accessTokenExpiresAt", operator: "lt", value: now }], PULIZIA_MAX);
    for (const t of token) {
      const refresh = ms(t.refreshTokenExpiresAt);
      if (testo(t.refreshToken) && refresh !== undefined && refresh > now) continue;
      await ctx.runMutation(adapterAuth().deleteOne, { input: { model: "oauthAccessToken", where: [{ field: "_id", value: String(t._id) }] } });
    }
    const chiavi = await trovaTutti(ctx, "apikey", [{ field: "expiresAt", operator: "lt", value: now }], PULIZIA_MAX);
    for (const k of chiavi) {
      if (ms(k.expiresAt) === undefined) continue;
      await ctx.runMutation(adapterAuth().deleteOne, { input: { model: "apikey", where: [{ field: "_id", value: String(k._id) }] } });
    }
    return null;
  },
});
