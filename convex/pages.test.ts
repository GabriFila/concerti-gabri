import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { conProfilo, setup } from "./test.setup";

const CANARINO = "Via dei Canarini 7, Genova";
const DISPLAY = "Canarini 7, Quartiere Finto, Genova, Liguria";

describe("pages.byHandle", () => {
  it("niente authUserId, indirizzi o coordinate delle partenze", async () => {
    const t = setup();
    await t.mutation(internal.seed.ensure, {});
    await t.run(async ctx => {
      const p = (await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", "gabrifila")).first())!;
      await ctx.db.patch(p._id, { authUserId: "utente-segreto-123" });
      const d = (await ctx.db.query("departures").withIndex("by_profile", q => q.eq("profileId", p._id)).collect())[0];
      await ctx.db.insert("departureSecrets", { departureId: d._id, profileId: p._id, address: `${CANARINO} | ${DISPLAY}`, lng: 8.9345678, lat: 44.4123456, geocodedAt: 1 });
      await ctx.db.patch(d._id, { hasAddress: true });
    });
    const json = JSON.stringify(await t.query(api.pages.byHandle, { handle: "gabrifila" }));
    for (const s of ["utente-segreto-123", "Canarini", "Quartiere Finto", "44.4123", "8.9345", "44,4123", "8,9345", "hasAddress", "kmSource", "onboardingStep", "authUserId", "profileId"]) {
      expect(json, s).not.toContain(s);
    }
  });

  it("un profilo in onboarding (o inesistente) dà null", async () => {
    const t = setup();
    await conProfilo(t, "u-o", "in-corso", { status: "onboarding", onboardingStep: "partenze" });
    expect(await t.query(api.pages.byHandle, { handle: "in-corso" })).toBeNull();
    expect(await t.query(api.pages.byHandle, { handle: "nessuno" })).toBeNull();
  });

  it("un alias dà {redirect}", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "vecchio-nome");
    await a.as.mutation(api.profiles.update, { input: { handle: "nuovo-nome" } });
    expect(await t.query(api.pages.byHandle, { handle: "vecchio-nome" })).toEqual({ redirect: "nuovo-nome" });
    expect(await t.query(api.pages.byHandle, { handle: "nuovo-nome" })).toMatchObject({ profile: { handle: "nuovo-nome" } });
    // il vecchio handle resta riservato
    expect(await t.query(api.profiles.handleAvailable, { handle: "vecchio-nome" })).toMatchObject({ disponibile: false });
    expect(await t.query(api.profiles.handleAvailable, { handle: "gabrifila" })).toMatchObject({ disponibile: false });
  });

  it("le persone pubbliche sono solo quelle usate nei concerti", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    await a.as.mutation(api.people.add, { input: { name: "Mai Vista" } });
    const page = await t.query(api.pages.byHandle, { handle: "utente-a" });
    expect(JSON.stringify(page)).not.toContain("Mai Vista");
  });
});
