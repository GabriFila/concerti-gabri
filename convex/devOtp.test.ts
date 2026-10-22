/* OTP di sviluppo (PIANO traguardo 3, Accettazione): con l'URL di
   produzione rifiuta; in locale scrive e legge l'outbox; in produzione il
   login non ci arriva nemmeno (il sender resta spento). */

import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { PROD_DEPLOYMENT } from "./devtools.ts";
import { guardiaOtp } from "./devOtp.ts";
import { chiediCodice, envLocale } from "./test.auth.ts";
import { setup } from "./test.setup";

const PROD_URL = `https://${PROD_DEPLOYMENT}.eu-west-1.convex.cloud`;
const LOCALE = "http://127.0.0.1:3210";

afterEach(() => vi.unstubAllEnvs());

describe("guardia dell'OTP di sviluppo", () => {
  it("rifiuta con l'URL Convex di produzione, anche con AUTH_DEV_OTP=1", () => {
    expect(() => guardiaOtp({ CONVEX_CLOUD_URL: PROD_URL, AUTH_DEV_OTP: "1" })).toThrow(/produzione/);
  });

  it("rifiuta con il SITE_URL di produzione, anche su un altro deployment", () => {
    for (const sito of ["https://concerti.gabrifila.me", "https://concerti-gabri.vercel.app", "https://Concerti.Gabrifila.me/"]) {
      expect(() => guardiaOtp({ CONVEX_CLOUD_URL: LOCALE, AUTH_DEV_OTP: "1", SITE_URL: sito }), sito).toThrow(/produzione/);
    }
  });

  it("rifiuta senza AUTH_DEV_OTP=1", () => {
    expect(() => guardiaOtp({ CONVEX_CLOUD_URL: LOCALE })).toThrow(/AUTH_DEV_OTP/);
  });

  it("passa in locale, sul dev e sulle preview", () => {
    for (const sito of ["https://m3.concerti-gabri.localhost:1355", "https://t3node.tail4a8e3b.ts.net:8444", "https://concerti-gabri-git-multiutente-gabrifilas-projects.vercel.app"]) {
      expect(() => guardiaOtp({ CONVEX_CLOUD_URL: LOCALE, AUTH_DEV_OTP: "1", SITE_URL: sito }), sito).not.toThrow();
    }
  });
});

describe("le funzioni", () => {
  it("con l'URL di produzione rifiutano", async () => {
    envLocale({ CONVEX_CLOUD_URL: PROD_URL });
    const t = setup();
    await expect(t.mutation(internal.devOtp.record, { email: "a@b.c", otp: "123456", type: "sign-in" })).rejects.toThrow(/produzione/);
    await expect(t.query(internal.devOtp.latest, { email: "a@b.c" })).rejects.toThrow(/produzione/);
  });

  it("con il sito di produzione rifiutano", async () => {
    envLocale({ SITE_URL: "https://concerti.gabrifila.me" });
    const t = setup();
    await expect(t.mutation(internal.devOtp.record, { email: "a@b.c", otp: "123456", type: "sign-in" })).rejects.toThrow(/produzione/);
  });

  it("in locale: l'ultimo codice per email, maiuscole indifferenti", async () => {
    envLocale();
    const t = setup();
    await t.mutation(internal.devOtp.record, { email: "Marta@Example.com", otp: "111111", type: "sign-in" });
    await new Promise(r => setTimeout(r, 2));
    await t.mutation(internal.devOtp.record, { email: "marta@example.com", otp: "222222", type: "sign-in" });
    expect((await t.query(internal.devOtp.latest, { email: "MARTA@example.com" }))?.otp).toBe("222222");
    expect(await t.query(internal.devOtp.latest, { email: "altro@example.com" })).toBeNull();
  });

  it("azzeraLimiti (solo e2e): dopo 3 codici la stessa email ne riceve un quarto; in produzione rifiuta", async () => {
    envLocale();
    const t = setup();
    for (let i = 0; i < 3; i++) expect((await chiediCodice(t, "e2e-x@example.test")).status).toBe(200);
    expect((await chiediCodice(t, "e2e-x@example.test")).status).toBe(429);
    await t.mutation(internal.devOtp.azzeraLimiti, { email: "E2E-x@example.test" });
    expect((await chiediCodice(t, "e2e-x@example.test")).status).toBe(200);
    vi.stubEnv("CONVEX_CLOUD_URL", PROD_URL);
    await expect(t.mutation(internal.devOtp.azzeraLimiti, {})).rejects.toThrow(/produzione/);
  });

  it("in produzione il login non scrive mai nell'outbox: senza Resend l'email è spenta", async () => {
    envLocale({ CONVEX_CLOUD_URL: PROD_URL });
    const t = setup();
    expect(await t.query(api.authFlags.get, {})).toMatchObject({ emailLogin: false });
    expect((await chiediCodice(t, "marta@example.com")).status).toBe(404);
    expect(await t.run(ctx => ctx.db.query("devOtpOutbox").collect())).toEqual([]);
  });
});
