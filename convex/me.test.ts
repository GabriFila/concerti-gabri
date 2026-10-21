import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { conProfilo, setup } from "./test.setup";

describe("me.profile", () => {
  it("anonimo o senza profilo → null, senza errori", async () => {
    const t = setup();
    expect(await t.query(api.me.profile, {})).toBeNull();
    expect(await t.withIdentity({ subject: "nessuno", sessionId: "s" }).query(api.me.profile, {})).toBeNull();
  });

  it("profilo in onboarding: stato e passo, handle null", async () => {
    const t = setup();
    const { as } = await conProfilo(t, "u-onb", "onb", { status: "onboarding", handle: undefined, displayName: undefined, onboardingStep: "partenze" });
    expect(await as.query(api.me.profile, {})).toMatchObject({ handle: null, displayName: null, status: "onboarding", onboardingStep: "partenze" });
  });

  it("profilo attivo: solo il proprio, mai authUserId", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    await conProfilo(t, "u-b", "utente-b");
    const p = await a.as.query(api.me.profile, {});
    expect(p).toEqual({ profileId: a.profileId, handle: "utente-a", displayName: "utente-a", status: "active", onboardingStep: "fatto" });
    expect(JSON.stringify(p)).not.toContain("u-a");
  });
});
