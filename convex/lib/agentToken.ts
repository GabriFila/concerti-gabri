/* ──────────────────────────────────────────────────────────────
   Token degli agenti (PIANO §5.4, traguardo 7): API key "cgk_…" e access
   token OAuth del plugin mcp() di Better Auth. Stanno nelle tabelle del
   componente Better Auth (`apikey`, `oauthAccessToken`,
   `oauthApplication`), lette con l'adapter del componente: le API key
   sono salvate come SHA-256 base64url (come fa @better-auth/api-key), i
   token OAuth in chiaro (mcp() 1.6).

   - Un token malformato non arriva nemmeno al database e nessun errore
     ripete il token ricevuto: solo `unauthorized`.
   - Una chiave disattivata o scaduta, un token scaduto o di un client
     disattivato valgono come assenti.
   - Il componente lo installa la corsia 3 (convex/betterAuth/); qui si
     usa solo la sua API `adapter` (findOne/findMany/create/deleteOne),
     tipizzata a mano finché `components.betterAuth` non è generato.
   ────────────────────────────────────────────────────────────── */

import type { FunctionReference } from "convex/server";
import { components } from "../_generated/api";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { SCOPE_CONCERTI } from "../../shared/agent/mcp.ts";
import { errore } from "./errors.ts";

/** Prefisso delle API key (apiKey({ defaultPrefix: "cgk_" }) in convex/auth.ts). */
export const PREFISSO_CHIAVE = "cgk_";
/** "cgk_" + 64 lettere (il generatore predefinito del plugin: a-z, A-Z). */
export const CHIAVE_RE = /^cgk_[A-Za-z]{64}$/;
/** Gli access token di mcp() 1.6: 32 lettere (generateRandomString(32, "a-z", "A-Z")). */
export const TOKEN_OAUTH_RE = /^[A-Za-z]{32}$/;

/** Chi presenta un token valido. */
export interface TokenValido {
  via: "apikey" | "mcp";
  userId: string;
  /** Nome della chiave o del client OAuth (registrazione dinamica: lo sceglie il client). */
  nome?: string;
  keyId?: string;
  clientId?: string;
  scopes: string[];
  /** ms; le API key senza scadenza: undefined. */
  expiresAt?: number;
}

/* ── l'adapter del componente Better Auth ────────────────────── */

type Where = { field: string; operator?: "lt" | "lte" | "gt" | "gte" | "eq" | "in" | "ne"; value: string | number | boolean | null | string[] };
type Pagina = { page: Record<string, unknown>[]; isDone: boolean; continueCursor: string };
export interface AdapterAuth {
  findOne: FunctionReference<"query", "internal", { model: string; where?: Where[] }, Record<string, unknown> | null>;
  findMany: FunctionReference<"query", "internal", { model: string; where?: Where[]; paginationOpts: { numItems: number; cursor: string | null } }, Pagina>;
  create: FunctionReference<"mutation", "internal", { input: { model: string; data: Record<string, unknown> } }, Record<string, unknown>>;
  deleteOne: FunctionReference<"mutation", "internal", { input: { model: string; where?: Where[] } }, unknown>;
}

/** `components.betterAuth.adapter` (il componente locale della corsia 3). */
export const adapterAuth = (): AdapterAuth => (components as unknown as { betterAuth: { adapter: AdapterAuth } }).betterAuth.adapter;

type Ctx = QueryCtx | MutationCtx | ActionCtx;

/** Una riga del componente, o null. */
export async function trovaUno(ctx: Ctx, model: string, where: Where[]) {
  return await ctx.runQuery(adapterAuth().findOne, { model, where });
}

/** Tutte le righe che rispondono a `where` (a pagine da 100, al massimo `max`). */
export async function trovaTutti(ctx: Ctx, model: string, where: Where[], max = 1000) {
  const out: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (;;) {
    const r: Pagina = await ctx.runQuery(adapterAuth().findMany, { model, where, paginationOpts: { numItems: 100, cursor } });
    out.push(...r.page);
    if (r.isDone || out.length >= max) return out.slice(0, max);
    cursor = r.continueCursor;
  }
}

/* ── hash delle API key ──────────────────────────────────────── */

/** SHA-256 in base64url senza padding: lo stesso `defaultKeyHasher` di @better-auth/api-key. */
export async function hashChiave(chiave: string): Promise<string> {
  const buf = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(chiave)));
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Una nuova API key (64 lettere casuali dopo il prefisso). */
export function nuovaChiave(): string {
  const ALFABETO = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const out: string[] = [];
  const buf = new Uint8Array(64);
  while (out.length < 64) {
    crypto.getRandomValues(buf);
    // scarto sopra 208 (= 4·52): niente bias sul modulo
    for (const b of buf) if (b < 208 && out.length < 64) out.push(ALFABETO[b % 52]);
  }
  return PREFISSO_CHIAVE + out.join("");
}

/* ── nomi scelti dai client ─────────────────────────────────── */

/**
 * Il nome di un client o di una chiave, da mostrare: senza caratteri di
 * controllo né di direzione del testo (un nome registrato da chiunque non
 * deve poter rigirare la pagina), spazi compattati, al massimo 40 caratteri.
 * Vuoto o non stringa: undefined.
 */
export function nomePulito(nome: unknown): string | undefined {
  if (typeof nome !== "string") return undefined;
  const spazi = nome.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, " ").replace(/\s+/g, " ").trim();
  // per caratteri, non per unità UTF-16: un'emoji non si spezza a metà
  const pulito = [...spazi].slice(0, 40).join("").trim();
  return pulito || undefined;
}

/* ── verifica ───────────────────────────────────────────────── */

const ms = (x: unknown): number | undefined => (typeof x === "number" ? x : x instanceof Date ? x.getTime() : undefined);
const testo = (x: unknown): string | undefined => (typeof x === "string" && x ? x : undefined);

/** Il token, se valido; altrimenti null. Non lancia mai per un token sbagliato. */
export async function verificaToken(ctx: Ctx, token: unknown, now = Date.now()): Promise<TokenValido | null> {
  if (typeof token !== "string") return null;
  if (CHIAVE_RE.test(token)) {
    const k = await trovaUno(ctx, "apikey", [{ field: "key", value: await hashChiave(token) }]);
    if (!k || k.enabled === false) return null;
    const scade = ms(k.expiresAt);
    if (scade !== undefined && scade <= now) return null;
    const userId = testo(k.referenceId);
    if (!userId) return null;
    return { via: "apikey", userId, nome: testo(k.name), keyId: testo(k._id), scopes: [SCOPE_CONCERTI], expiresAt: scade };
  }
  if (TOKEN_OAUTH_RE.test(token)) {
    const t = await trovaUno(ctx, "oauthAccessToken", [{ field: "accessToken", value: token }]);
    const scade = ms(t?.accessTokenExpiresAt);
    const userId = testo(t?.userId);
    const clientId = testo(t?.clientId);
    if (!t || scade === undefined || scade <= now || !userId || !clientId) return null;
    const app = await trovaUno(ctx, "oauthApplication", [{ field: "clientId", value: clientId }]);
    if (!app || app.disabled === true) return null;
    const scopes = (testo(t.scopes) ?? "").split(" ").filter(Boolean);
    return { via: "mcp", userId, nome: testo(app.name), clientId, scopes, expiresAt: scade };
  }
  return null;
}

/** Come verificaToken, ma un token non valido è `unauthorized` (senza ripeterlo). */
export async function richiediToken(ctx: Ctx, token: unknown): Promise<TokenValido> {
  const t = await verificaToken(ctx, token);
  if (!t) throw errore("unauthorized", "token agente non valido, revocato o scaduto: ricollega l'agente o crea una nuova API key da #agenti");
  if (t.via === "mcp" && !t.scopes.includes(SCOPE_CONCERTI)) {
    throw errore("unauthorized", `il token non ha lo scope "${SCOPE_CONCERTI}": ricollega l'agente`);
  }
  return t;
}

/* ── consenso (/autorizza) ──────────────────────────────────────── */

/** Una richiesta di autorizzazione in attesa di consenso (mcp() 1.6 la salva in `verification`). */
export interface RichiestaConsenso {
  userId: string;
  clientId: string;
  redirectURI: string;
  scopes: string[];
  expiresAt: number;
}

/**
 * La richiesta legata a `consentCode`, se esiste, aspetta ancora il consenso
 * e non è scaduta. mcp() la salva in `verification` con identifier = codice
 * (in chiaro, o SHA-256 se auth.ts imposta `verification.storeIdentifier`).
 */
export async function richiestaDiConsenso(ctx: Ctx, consentCode: string, now = Date.now()): Promise<RichiestaConsenso | null> {
  for (const identifier of [consentCode, await hashChiave(consentCode)]) {
    const riga = await trovaUno(ctx, "verification", [{ field: "identifier", value: identifier }]);
    if (!riga) continue;
    let v: Record<string, unknown>;
    try {
      v = JSON.parse(String(riga.value));
    } catch {
      return null;
    }
    const scade = ms(riga.expiresAt);
    const userId = testo(v.userId);
    const clientId = testo(v.clientId);
    const redirectURI = testo(v.redirectURI);
    if (v.requireConsent !== true || !userId || !clientId || !redirectURI || scade === undefined || scade <= now) return null;
    const scopes = Array.isArray(v.scope) ? v.scope.filter((s): s is string => typeof s === "string") : [];
    return { userId, clientId, redirectURI, scopes, expiresAt: scade };
  }
  return null;
}
