/* Email del login (PIANO traguardo 3, Accettazione): payload di Resend e
   modello, EMAIL_FROM predefinito, precedenza tra i sender, `emailLogin`
   falso senza sender, limiti `otpSendEmail`/`otpSendGlobal`. `fetch` è
   simulato: nessuna email parte davvero. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { emailLoginAttivo, senderOtp } from "./authFlags.ts";
import { MESSAGGIO_TROPPI_CODICI } from "./auth.ts";
import { PROD_DEPLOYMENT } from "./devtools.ts";
import { EMAIL_FROM_PREDEFINITO, inviaOtpResend, modelloOtp, RESEND_URL } from "./email.ts";
import { chiediCodice, envLocale, ultimoCodice } from "./test.auth.ts";
import { setup } from "./test.setup";

const PROD_URL = `https://${PROD_DEPLOYMENT}.eu-west-1.convex.cloud`;
/** Resend configurato: chiave E mittente (§1.28). */
const RESEND = { RESEND_API_KEY: "k", EMAIL_FROM: "Prove <prove@example.com>" };

beforeEach(() => envLocale());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Un fetch finto che registra le chiamate e risponde `status`. */
function fetchFinto(status = 200) {
  const chiamate: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chiamate.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ id: "email-finta" }), { status });
  });
  return { fn: fn as unknown as typeof fetch, chiamate };
}

describe("modello in italiano", () => {
  it("oggetto, codice e scadenza", () => {
    const m = modelloOtp("123456");
    expect(m.subject).toBe("Il tuo codice per Concerti");
    for (const parte of [m.text, m.html]) {
      expect(parte).toContain("123456");
      expect(parte).toContain("Scade tra 10 minuti");
    }
  });

  it("nell'HTML finiscono solo cifre e lettere del codice", () => {
    expect(modelloOtp("<b>12</b>").html).not.toContain("<b>12");
  });
});

describe("Resend via fetch", () => {
  it("payload: mittente predefinito, destinatario, modello e chiave come Bearer", async () => {
    const f = fetchFinto();
    await inviaOtpResend({ email: "marta@example.com", otp: "654321" }, { env: { RESEND_API_KEY: "re_finta" }, fetchFn: f.fn });
    expect(f.chiamate).toHaveLength(1);
    const { url, init } = f.chiamate[0];
    expect(url).toBe(RESEND_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_finta");
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ from: EMAIL_FROM_PREDEFINITO, to: ["marta@example.com"], ...modelloOtp("654321") });
    expect(EMAIL_FROM_PREDEFINITO).toBe("Concerti <notifications@concerti.gabrifila.me>");
  });

  it("EMAIL_FROM, se c'è, vince sul predefinito", async () => {
    const f = fetchFinto();
    await inviaOtpResend({ email: "a@example.com", otp: "1" }, { env: { RESEND_API_KEY: "k", EMAIL_FROM: "Prove <prove@example.com>" }, fetchFn: f.fn });
    expect(JSON.parse(String(f.chiamate[0].init.body)).from).toBe("Prove <prove@example.com>");
  });

  it("un rifiuto di Resend lancia senza ripetere email o codice", async () => {
    const f = fetchFinto(422);
    const e = await inviaOtpResend({ email: "marta@example.com", otp: "654321" }, { env: { RESEND_API_KEY: "k" }, fetchFn: f.fn }).catch(x => x as Error);
    expect(e).toBeInstanceOf(Error);
    expect(e!.message).toContain("422");
    expect(e!.message).not.toMatch(/marta|654321/);
  });
});

describe("precedenza tra i sender", () => {
  it("fuori produzione con AUTH_DEV_OTP=1 vince il sender di sviluppo, anche con Resend", () => {
    expect(senderOtp({ AUTH_DEV_OTP: "1", CONVEX_CLOUD_URL: "http://127.0.0.1:3210" })).toBe("sviluppo");
    expect(senderOtp({ AUTH_DEV_OTP: "1", ...RESEND, CONVEX_CLOUD_URL: "http://127.0.0.1:3210" })).toBe("sviluppo");
  });

  it("altrimenti Resend, se ci sono la chiave e il mittente", () => {
    expect(senderOtp(RESEND)).toBe("resend");
    expect(senderOtp({ AUTH_DEV_OTP: "0", ...RESEND })).toBe("resend");
  });

  it("la sola chiave, o il solo mittente, non accendono Resend", () => {
    expect(senderOtp({ RESEND_API_KEY: "k" })).toBeNull();
    expect(senderOtp({ RESEND_API_KEY: "k", EMAIL_FROM: "  " })).toBeNull();
    expect(senderOtp({ EMAIL_FROM: "Prove <prove@example.com>" })).toBeNull();
  });

  it("in produzione AUTH_DEV_OTP si rifiuta: resta solo Resend", () => {
    expect(senderOtp({ AUTH_DEV_OTP: "1", CONVEX_CLOUD_URL: PROD_URL })).toBeNull();
    expect(senderOtp({ AUTH_DEV_OTP: "1", SITE_URL: "https://concerti.gabrifila.me" })).toBeNull();
    expect(senderOtp({ AUTH_DEV_OTP: "1", SITE_URL: "https://concerti-gabri.vercel.app/" })).toBeNull();
    expect(senderOtp({ AUTH_DEV_OTP: "1", ...RESEND, CONVEX_CLOUD_URL: PROD_URL })).toBe("resend");
  });

  it("emailLogin è falso senza sender", () => {
    expect(emailLoginAttivo({})).toBe(false);
    expect(emailLoginAttivo({ EMAIL_FROM: "Prove <prove@example.com>" })).toBe(false);
    expect(emailLoginAttivo({ AUTH_DEV_OTP: "1", CONVEX_CLOUD_URL: PROD_URL })).toBe(false);
    expect(emailLoginAttivo({ RESEND_API_KEY: "k" })).toBe(false);
    expect(emailLoginAttivo(RESEND)).toBe(true);
  });
});

describe("i sender dal vivo (route di Better Auth)", () => {
  it("con Resend il codice parte via fetch e non finisce nell'outbox di sviluppo", async () => {
    envLocale({ AUTH_DEV_OTP: undefined, RESEND_API_KEY: "re_finta", EMAIL_FROM: "Prove <prove@example.com>" });
    const f = fetchFinto();
    vi.stubGlobal("fetch", f.fn);
    const t = setup();
    expect(await t.query(api.authFlags.get, {})).toEqual({ emailLogin: true, googleLogin: false });
    expect((await chiediCodice(t, "marta@example.com")).status).toBe(200);
    const resend = f.chiamate.filter(c => c.url === RESEND_URL);
    expect(resend).toHaveLength(1);
    const body = JSON.parse(String(resend[0].init.body));
    expect(body.to).toEqual(["marta@example.com"]);
    expect(body.from).toBe("Prove <prove@example.com>");
    expect(body.subject).toBe("Il tuo codice per Concerti");
    expect(body.text).toMatch(/\d{6}/);
    expect(await t.run(ctx => ctx.db.query("devOtpOutbox").collect())).toEqual([]);
  });

  it("senza sender: emailLogin falso e l'invio del codice non esiste", async () => {
    envLocale({ AUTH_DEV_OTP: undefined });
    const t = setup();
    expect(await t.query(api.authFlags.get, {})).toEqual({ emailLogin: false, googleLogin: false });
    expect((await chiediCodice(t, "marta@example.com")).status).toBe(404);
  });

  it("RESEND_API_KEY senza EMAIL_FROM: il bottone non compare e nessuna email parte", async () => {
    envLocale({ AUTH_DEV_OTP: undefined, RESEND_API_KEY: "re_finta" });
    const f = fetchFinto();
    vi.stubGlobal("fetch", f.fn);
    const t = setup();
    expect(await t.query(api.authFlags.get, {})).toEqual({ emailLogin: false, googleLogin: false });
    expect((await chiediCodice(t, "marta@example.com")).status).toBe(404);
    expect(f.chiamate.filter(c => c.url === RESEND_URL)).toEqual([]);
  });

  it("googleLogin segue le credenziali", async () => {
    envLocale({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" });
    expect(await setup().query(api.authFlags.get, {})).toEqual({ emailLogin: true, googleLogin: true });
  });
});

describe("limiti d'invio (§5.8)", () => {
  it("otpSendEmail: 3 codici ogni 10 minuti per email, il quarto è rifiutato senza generare un codice", async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) expect((await chiediCodice(t, "marta@example.com")).status).toBe(200);
    const terzo = await ultimoCodice(t, "marta@example.com");
    const quarto = await chiediCodice(t, "Marta@Example.com ");
    expect(quarto.status).toBe(429);
    expect((await quarto.json()).message).toBe(MESSAGGIO_TROPPI_CODICI);
    expect(await t.run(ctx => ctx.db.query("devOtpOutbox").collect())).toHaveLength(3);
    expect(await ultimoCodice(t, "marta@example.com")).toBe(terzo);
    // un'altra email ha il suo limite
    expect((await chiediCodice(t, "luca@example.com")).status).toBe(200);
  });

  it("un'email malformata non consuma i limiti (la rifiuta Better Auth, senza inviare)", async () => {
    const t = setup();
    for (let i = 0; i < 5; i++) expect((await chiediCodice(t, "non-una-email")).status).toBe(400);
    for (let i = 0; i < 3; i++) expect((await chiediCodice(t, "marta@example.com")).status).toBe(200);
    expect(await t.run(ctx => ctx.db.query("devOtpOutbox").collect())).toHaveLength(3);
  });

  it("otpSendGlobal: 50 codici all'ora in tutto", async () => {
    const t = setup();
    for (let i = 0; i < 50; i++) expect((await chiediCodice(t, `persona${i}@example.com`)).status, `invio ${i}`).toBe(200);
    expect((await chiediCodice(t, "ultima@example.com")).status).toBe(429);
  }, 60_000);
});
