/// <reference types="vite/client" />
/* Il backend finto dei test (convex-test) con i componenti registrati.
   Il nome ha due punti: la CLI Convex non lo pubblica. */
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
  const s = (await t.run(ctx =>
    ctx.runMutation(components.betterAuth.adapter.create, {
      input: { model: "session", data: { userId: user, token: `tok-${user}-${now}-${Math.random()}`, expiresAt: now + scadeTra, createdAt: now, updatedAt: now } },
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

/** Una venue nel catalogo. */
export async function venue(t: T, name: string, city: string, lng: number, lat: number) {
  const k = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return await t.run(async ctx => ctx.db.insert("venues", { name, city, nameKey: k(name), cityKey: k(city), lng, lat, source: "seed" }));
}
