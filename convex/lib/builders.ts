/* ──────────────────────────────────────────────────────────────
   I builder che CLASSIFICANO ogni funzione (PIANO §4.7.1, §5.4).

   Ogni funzione esportata da convex/ nasce da uno di questi:
   - publicQuery          query pubblica, con `returns` obbligatorio;
   - ownerQuery/Mutation/Action  del proprietario, etichettate da sole con
     `catalogOp: "<nome del catalogo>"` oppure `dashboardOnly: "<motivo>"`;
   - onboardingMutation   l'unica che accetta un profilo in onboarding;
   - internalQuery/Mutation/Action  interne.
   convex/registry.test.ts scorre gli export e rifiuta tutto il resto.

   Argomenti delle funzioni del proprietario: LARGHI (`v.any()`), così un
   errore di validazione di Convex non ripete mai l'oggetto ricevuto (che può
   contenere un token o un indirizzo). L'input si valida con Zod DENTRO
   l'handler, dopo aver risolto l'attore (PIANO §1.25).
   ────────────────────────────────────────────────────────────── */

import { v, type GenericValidator, type PropertyValidators, type VAny } from "convex/values";
import type { z } from "zod";
import type { Doc } from "../_generated/dataModel";
import {
  action, internalAction as rawInternalAction, internalMutation as rawInternalMutation,
  internalQuery as rawInternalQuery, mutation, query,
  type ActionCtx, type MutationCtx, type QueryCtx,
} from "../_generated/server";
import { rateLimiter } from "../rateLimits.ts";
import { errore, parseInput } from "./errors.ts";
import { requireOwner, requireOwnerAction, type Owner, type OwnerOptions } from "./owner.ts";

export type FnKind = "public" | "owner" | "onboarding" | "internal";
export interface FnMeta {
  kind: FnKind;
  type: "query" | "mutation" | "action";
  catalogOp?: string;
  dashboardOnly?: string;
  /** Lo schema Zod dell'input: per una `catalogOp` è lo STESSO oggetto del catalogo (registry.test). */
  input?: z.ZodType;
}

const META = "__concertiMeta";
function tag<T>(fn: T, meta: FnMeta): T {
  Object.defineProperty(fn, META, { value: meta, enumerable: false });
  return fn;
}
export const metaOf = (fn: unknown): FnMeta | undefined => (fn as Record<string, FnMeta> | null)?.[META];

type Classe = { catalogOp: string; dashboardOnly?: undefined } | { dashboardOnly: string; catalogOp?: undefined };

/** Gli argomenti larghi delle funzioni del proprietario, tipizzati con l'input Zod. */
function ownerArgs<I extends z.ZodType>() {
  return {
    agentToken: v.optional(v.any() as VAny<string>),
    as: v.optional(v.any() as VAny<"oracolo">),
    input: v.optional(v.any() as VAny<z.input<I>>),
  };
}

const opts = (c: Classe, a: { agentToken?: unknown; as?: unknown }): OwnerOptions => ({
  agentToken: a.agentToken,
  as: a.as,
  dashboardOnly: !!c.dashboardOnly,
});

/* ── pubbliche ─────────────────────────────────────────────────── */
export function publicQuery<Args extends PropertyValidators, Returns extends GenericValidator, R>(spec: {
  args: Args;
  returns: Returns;
  handler: (ctx: QueryCtx, args: any) => Promise<R>;
}) {
  return tag(query({ args: spec.args, returns: spec.returns, handler: spec.handler as any }), { kind: "public", type: "query" }) as ReturnType<
    typeof query<Args, Returns, any>
  >;
}

/* ── del proprietario ─────────────────────────────────────────── */
export function ownerQuery<I extends z.ZodType, R>(spec: Classe & { input: I; handler: (ctx: QueryCtx, owner: Owner, input: z.output<I>) => Promise<R> }) {
  const fn = query({
    args: ownerArgs<I>(),
    handler: async (ctx, a): Promise<R> => {
      const owner = await requireOwner(ctx, opts(spec, a));
      return await spec.handler(ctx, owner, parseInput(spec.input, a.input));
    },
  });
  return tag(fn, { kind: "owner", type: "query", catalogOp: spec.catalogOp, dashboardOnly: spec.dashboardOnly, input: spec.input });
}

/** Le scritture degli agenti passano dal limite `agentWrites` (PIANO §5.4). */
export async function limitaAgente(ctx: MutationCtx | ActionCtx, owner: Owner, count = 1) {
  if (owner.actor.via !== "mcp" && owner.actor.via !== "apikey") return;
  const r = await rateLimiter.limit(ctx, "agentWrites", { key: owner.profile._id, count });
  if (!r.ok) throw errore("limite_superato", "troppe scritture dall'agente: riprova più tardi", { retryAfter: Math.ceil(r.retryAfter / 1000) });
}

export function ownerMutation<I extends z.ZodType, R>(spec: Classe & { input: I; handler: (ctx: MutationCtx, owner: Owner, input: z.output<I>) => Promise<R> }) {
  const fn = mutation({
    args: ownerArgs<I>(),
    handler: async (ctx, a): Promise<R> => {
      const owner = await requireOwner(ctx, opts(spec, a));
      const input = parseInput(spec.input, a.input);
      await limitaAgente(ctx, owner);
      return await spec.handler(ctx, owner, input);
    },
  });
  return tag(fn, { kind: "owner", type: "mutation", catalogOp: spec.catalogOp, dashboardOnly: spec.dashboardOnly, input: spec.input });
}

export function ownerAction<I extends z.ZodType, R>(spec: Classe & {
  input: I;
  loadProfile: (ctx: ActionCtx, userId: string) => Promise<Doc<"profiles"> | null>;
  handler: (ctx: ActionCtx, owner: Owner, input: z.output<I>) => Promise<R>;
}) {
  const fn = action({
    args: ownerArgs<I>(),
    handler: async (ctx, a): Promise<R> => {
      const owner = await requireOwnerAction(ctx, opts(spec, a), userId => spec.loadProfile(ctx, userId));
      return await spec.handler(ctx, owner, parseInput(spec.input, a.input));
    },
  });
  return tag(fn, { kind: "owner", type: "action", catalogOp: spec.catalogOp, dashboardOnly: spec.dashboardOnly, input: spec.input });
}

/** L'unica che accetta un profilo in `onboarding` (PIANO §1.19). Solo sessione. */
export function onboardingMutation<I extends z.ZodType, R>(spec: { input: I; handler: (ctx: MutationCtx, owner: Owner, input: z.output<I>) => Promise<R> }) {
  const fn = mutation({
    args: ownerArgs<I>(),
    handler: async (ctx, a): Promise<R> => {
      const owner = await requireOwner(ctx, { agentToken: a.agentToken, as: a.as, dashboardOnly: true, allowOnboarding: true });
      return await spec.handler(ctx, owner, parseInput(spec.input, a.input));
    },
  });
  return tag(fn, { kind: "onboarding", type: "mutation", dashboardOnly: "onboarding", input: spec.input });
}

/* ── interne ───────────────────────────────────────────────────── */
export const internalQuery: typeof rawInternalQuery = ((def: any) => tag(rawInternalQuery(def), { kind: "internal", type: "query" })) as any;
export const internalMutation: typeof rawInternalMutation = ((def: any) => tag(rawInternalMutation(def), { kind: "internal", type: "mutation" })) as any;
export const internalAction: typeof rawInternalAction = ((def: any) => tag(rawInternalAction(def), { kind: "internal", type: "action" })) as any;
