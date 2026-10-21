import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { guardiaSviluppo, PROD_DEPLOYMENT } from "./devtools.ts";
import { setup } from "./test.setup";

const PROD_URL = `https://${PROD_DEPLOYMENT}.eu-west-1.convex.cloud`;

afterEach(() => vi.unstubAllEnvs());

describe("guardia di devtools e devOtp", () => {
  it("rifiuta con l'URL di produzione, anche con AUTH_DEV_OTP=1", () => {
    expect(() => guardiaSviluppo({ CONVEX_CLOUD_URL: PROD_URL, AUTH_DEV_OTP: "1" })).toThrow(/produzione/);
  });

  it("rifiuta senza AUTH_DEV_OTP=1", () => {
    expect(() => guardiaSviluppo({ CONVEX_CLOUD_URL: "http://127.0.0.1:3210" })).toThrow(/AUTH_DEV_OTP/);
    expect(() => guardiaSviluppo({ CONVEX_CLOUD_URL: "http://127.0.0.1:3210", AUTH_DEV_OTP: "0" })).toThrow(/AUTH_DEV_OTP/);
  });

  it("passa su un deployment locale con AUTH_DEV_OTP=1", () => {
    expect(() => guardiaSviluppo({ CONVEX_CLOUD_URL: "http://127.0.0.1:3210", AUTH_DEV_OTP: "1" })).not.toThrow();
  });

  it("le funzioni di devtools e devOtp rifiutano davvero sul deployment di produzione", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", PROD_URL);
    vi.stubEnv("AUTH_DEV_OTP", "1");
    const t = setup();
    await expect(t.query(internal.devtools.whoami, {})).rejects.toThrow(/produzione/);
    await expect(t.mutation(internal.devtools.reset, {})).rejects.toThrow(/produzione/);
    await expect(t.mutation(internal.devtools.removeEntry, { handle: "gabrifila", entryId: "x" })).rejects.toThrow(/produzione/);
    await expect(t.mutation(internal.devOtp.record, { email: "a@b.c", otp: "123456", type: "sign-in" })).rejects.toThrow(/produzione/);
    await expect(t.query(internal.devOtp.latest, { email: "a@b.c" })).rejects.toThrow(/produzione/);
  });

  it("in locale funzionano", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
    vi.stubEnv("AUTH_DEV_OTP", "1");
    const t = setup();
    await t.mutation(internal.devOtp.record, { email: "a@b.c", otp: "123456", type: "sign-in" });
    expect((await t.query(internal.devOtp.latest, { email: "a@b.c" }))?.otp).toBe("123456");
  });

  it("addEntry e removeEntry: il concerto di prova entra nella pagina e ne esce senza lasciare tracce", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
    vi.stubEnv("AUTH_DEV_OTP", "1");
    const t = setup();
    await t.mutation(internal.seed.ensure, {});
    const conta = async () => ((await t.query(api.pages.byHandle, { handle: "gabrifila" })) as { entries: unknown[] }).entries.length;
    const prima = await conta();
    const id = await t.mutation(internal.devtools.addEntry, {
      handle: "gabrifila",
      entry: { kind: "concert", date: "2026-10-25", artist: "Canarino dal vivo", venue: "Fabrique", city: "Milano", with: [] },
    });
    expect(await conta()).toBe(prima + 1);
    expect(await t.mutation(internal.devtools.removeEntry, { handle: "gabrifila", entryId: id })).toBe(true);
    expect(await conta()).toBe(prima);
    const tracce = await t.run(async ctx => (await ctx.db.query("activity").collect()).filter(r => r.docId === id));
    expect(tracce).toEqual([]);
    // un id che non c'è (o di un'altra tabella) non fa niente
    expect(await t.mutation(internal.devtools.removeEntry, { handle: "gabrifila", entryId: id })).toBe(false);
  });
});
