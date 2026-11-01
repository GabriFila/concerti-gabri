/// <reference types="vite/client" />
/* Il backend finto dei test (convex-test) con i componenti registrati.
   Il nome ha due punti: la CLI Convex non lo pubblica. */
import type { Id } from "./_generated/dataModel";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { components } from "./_generated/api";
import betterAuthSchema from "./betterAuth/schema";
import schema from "./schema";

// ogni estensione che la CLI Convex pubblica (come test.registry.ts), test e componente locale esclusi
export const modules = import.meta.glob(["./**/*.{js,mjs,cjs,ts,tsx,mts,cts,jsx}", "!./**/*.test.*", "!./**/test.*", "!./betterAuth/**"]);
const betterAuthModules = import.meta.glob(["./betterAuth/**/*.ts", "!./betterAuth/auth.ts"]);

export function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
  return t;
}

export type T = ReturnType<typeof setup>;

/**
 * Una sessione Better Auth valida per `user` (riga `session` nel
 * componente) e il client con l'identità del suo JWT: lib/owner.ts accetta
 * solo sessioni che esistono ancora, non scadute e dello stesso utente.
 * `scadeTra` (ms, anche negativo) simula una sessione scaduta.
 */
export async function sessione(t: T, user: string, { scadeTra = 7 * 86_400_000 }: { scadeTra?: number } = {}) {
  const now = Date.now();
  // senza punti, come i token veri: il plugin bearer prende "x.y" per un token firmato
  const token = `tok-${user}-${now}-${Math.random().toString(36).slice(2)}`;
  const s = (await t.run(ctx =>
    ctx.runMutation(components.betterAuth.adapter.create, {
      input: { model: "session", data: { userId: user, token, expiresAt: now + scadeTra, createdAt: now, updatedAt: now } },
    }),
  )) as { _id: string };
  return { sessionId: s._id, as: t.withIdentity({ subject: user, sessionId: s._id }) };
}

/** Un utente con profilo `active` (come dopo l'onboarding): restituisce il client con identità. */
export async function conProfilo(t: T, user: string, handle: string, extra: Record<string, unknown> = {}) {
  const doc = Object.fromEntries(
    Object.entries({
      authUserId: user, handle, displayName: handle, forma: "n", status: "active", onboardingStep: "fatto",
      theme: { preset: "predefinito" }, layout: { ordine: [], nascoste: [], titoli: {} }, extra: {}, createdAt: Date.now(),
      ...extra,
    }).filter(([, x]) => x !== undefined),
  );
  const profileId = await t.run(async ctx => ctx.db.insert("profiles", doc as never));
  return { profileId, as: (await sessione(t, user)).as };
}

/**
 * Una venue con le coordinate: del profilo indicato, oppure (senza) una copia per ogni profilo che
 * c'è già (ognuno ha le sue venue); restituisce l'id della prima.
 */
export async function venue(t: T, name: string, city: string, lng: number, lat: number, profileId?: Id<"profiles">) {
  const k = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return await t.run(async ctx => {
    const profili = profileId ? [profileId] : (await ctx.db.query("profiles").collect()).map(p => p._id);
    const ids = [];
    for (const p of profili) ids.push(await ctx.db.insert("venues", { profileId: p, name, city, nameKey: k(name), cityKey: k(city), lng, lat, source: "seed" }));
    if (!ids.length) throw new Error("test: venue() senza profili; crea prima il profilo o passa profileId");
    return ids[0];
  });
}
