/// <reference types="vite/client" />
/* Il backend finto dei test (convex-test) con i componenti registrati.
   Il nome ha due punti: la CLI Convex non lo pubblica. */
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "./schema";

// ogni estensione che la CLI Convex pubblica (come test.registry.ts), test esclusi
export const modules = import.meta.glob(["./**/*.{js,mjs,cjs,ts,tsx,mts,cts,jsx}", "!./**/*.test.*", "!./**/test.*"]);

export function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}

export type T = ReturnType<typeof setup>;

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
  return { profileId, as: t.withIdentity({ subject: user, sessionId: `s-${user}` }) };
}

/** Una venue nel catalogo. */
export async function venue(t: T, name: string, city: string, lng: number, lat: number) {
  const k = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return await t.run(async ctx => ctx.db.insert("venues", { name, city, nameKey: k(name), cityKey: k(city), lng, lat, source: "seed" }));
}
