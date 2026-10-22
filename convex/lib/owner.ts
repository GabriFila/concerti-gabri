/* ──────────────────────────────────────────────────────────────
   L'unico helper di proprietà (PIANO §5.4).

   - `resolveActor`: chi sta chiamando. La sessione di Better Auth
     (`utenteDellaSessione`: JWT di Convex più sessione ancora valida nel
     componente, T3); T7 aggiunge i token agente
     ("cgk_…" → apikey, altro → oauthAccessToken). `as: "oracolo"` può solo
     DECLASSARE una sessione (dashboard → oracolo); con un token si ignora.
   - `requireOwner`: il profilo dell'attore (uno per utente). Un profilo in
     `onboarding` → `no_profile` con fix `/benvenuto`. `dashboardOnly` e un
     attore non "dashboard" → `solo_dashboard`.
   - `getOwned`: un documento del proprietario; `not_found` identico per un
     id altrui, inesistente o malformato.
   Il `profileId` non arriva MAI dagli argomenti.
   ────────────────────────────────────────────────────────────── */

import { components } from "../_generated/api";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { errore } from "./errors.ts";
import { nomePulito, richiediToken } from "./agentToken.ts";

export type Via = "dashboard" | "oracolo" | "mcp" | "apikey" | "sistema";
export interface Actor {
  via: Via;
  userId: string;
  label: string;
  clientId?: string;
  keyId?: string;
}
export interface Owner {
  profile: Doc<"profiles">;
  actor: Actor;
}

export const ETICHETTE_ATTORE: Record<Via, string> = {
  dashboard: "Dashboard",
  oracolo: "Oracolo",
  mcp: "MCP",
  apikey: "API key",
  sistema: "Sistema",
};

type AnyCtx = QueryCtx | MutationCtx | ActionCtx;

/** L'etichetta di un agente nel registro: "MCP · Claude", "API key · Script di casa". */
export function etichettaAgente(via: "mcp" | "apikey", nome?: string): string {
  const pulito = nomePulito(nome);
  return pulito ? `${ETICHETTE_ATTORE[via]} · ${pulito}` : ETICHETTE_ATTORE[via];
}

export async function resolveActor(ctx: AnyCtx, { agentToken, as }: { agentToken?: unknown; as?: unknown }): Promise<Actor> {
  if (agentToken !== undefined && agentToken !== null) {
    // T7: "cgk_…" → API key (hash in `apikey`), un token OAuth →
    // `oauthAccessToken` (lib/agentToken.ts). Con un token `as` si ignora:
    // un agente resta un agente. Le sue scritture passano da `agentWrites`
    // (limitaAgente in lib/builders.ts).
    const t = await richiediToken(ctx, agentToken);
    return { via: t.via, userId: t.userId, label: etichettaAgente(t.via, t.nome), clientId: t.clientId, keyId: t.keyId };
  }
  if (as !== undefined && as !== null && as !== "oracolo") {
    throw errore("input_non_valido", "as: l'unico valore ammesso è \"oracolo\"", { campo: "as" });
  }
  const userId = await utenteDellaSessione(ctx);
  if (!userId) throw errore("unauthorized", "serve l'accesso: entra con il tuo account");
  const via: Via = as === "oracolo" ? "oracolo" : "dashboard";
  return { via, userId, label: ETICHETTE_ATTORE[via] };
}

/**
 * L'utente della sessione, o null (anonimo). L'unico punto che legge
 * l'identità (resolveActor, me.profile, handleAvailable).
 *
 * Il JWT di Convex resta valido fino alla sua scadenza anche dopo
 * "Esci", una revoca o la scadenza della sessione: come
 * `authComponent.safeGetAuthUser`, qui la sessione del JWT (`sessionId`)
 * deve esistere ancora nel componente Better Auth e non essere scaduta;
 * in più deve appartenere allo stesso utente del JWT (`subject`). Un
 * utente eliminato non ha più sessioni (deleteUser le cancella).
 */
export async function utenteDellaSessione(ctx: AnyCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || typeof identity.sessionId !== "string" || !identity.sessionId) return null;
  const session = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "session",
    where: [
      { field: "_id", value: identity.sessionId },
      { field: "expiresAt", operator: "gt", value: Date.now() },
    ],
  })) as { userId: string } | null;
  return session && session.userId === identity.subject ? identity.subject : null;
}

export interface OwnerOptions {
  agentToken?: unknown;
  as?: unknown;
  dashboardOnly?: boolean;
  /** solo onboardingMutation: accetta un profilo ancora in onboarding */
  allowOnboarding?: boolean;
}

function checkProfile(profile: Doc<"profiles"> | null, actor: Actor, opts: OwnerOptions): Owner {
  if (opts.dashboardOnly && actor.via !== "dashboard") {
    throw errore("solo_dashboard", "questa operazione si fa solo dalla dashboard");
  }
  if (!profile) throw errore("no_profile", "nessun profilo per questo account", { fix: "/benvenuto" });
  if (profile.status === "onboarding" && !opts.allowOnboarding) {
    throw errore("no_profile", "completa prima il profilo", { fix: "/benvenuto" });
  }
  return { profile, actor };
}

export async function profileOfUser(ctx: QueryCtx | MutationCtx, userId: string) {
  return await ctx.db
    .query("profiles")
    .withIndex("by_authUserId", q => q.eq("authUserId", userId))
    .unique();
}

export async function requireOwner(ctx: QueryCtx | MutationCtx, opts: OwnerOptions = {}): Promise<Owner> {
  const actor = await resolveActor(ctx, opts);
  if (opts.dashboardOnly && actor.via !== "dashboard") checkProfile(null, actor, opts);
  return checkProfile(await profileOfUser(ctx, actor.userId), actor, opts);
}

/** Per le action: il profilo arriva da una query interna. */
export async function requireOwnerAction(
  ctx: ActionCtx,
  opts: OwnerOptions,
  loadProfile: (userId: string) => Promise<Doc<"profiles"> | null>,
): Promise<Owner> {
  const actor = await resolveActor(ctx, opts);
  if (opts.dashboardOnly && actor.via !== "dashboard") checkProfile(null, actor, opts);
  return checkProfile(await loadProfile(actor.userId), actor, opts);
}

type OwnedTable = { [T in TableNames]: Doc<T> extends { profileId: Id<"profiles"> } ? T : never }[TableNames];

/** Un documento del proprietario, o `not_found` (stesso errore per altrui e assenti). */
export async function getOwned<T extends OwnedTable>(ctx: QueryCtx | MutationCtx, owner: Owner, table: T, id: unknown): Promise<Doc<T>> {
  const norm = typeof id === "string" ? ctx.db.normalizeId(table, id) : null;
  const doc = norm ? ((await ctx.db.get(norm)) as Doc<T> | null) : null;
  if (!doc || (doc as unknown as { profileId: Id<"profiles"> }).profileId !== owner.profile._id) {
    throw errore("not_found", "non trovato");
  }
  return doc;
}
