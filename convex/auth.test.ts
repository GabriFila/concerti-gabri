/* Login e onboarding (PIANO traguardo 3, Accettazione): il trigger crea il
   profilo `onboarding`, completeOnboarding lo attiva con errori leggibili,
   i passi 2–4 scrivono, un secondo profilo è impossibile, claimProfile,
   SIGNUP_ALLOWLIST e le opzioni di Better Auth. Il login è quello vero:
   route HTTP di Better Auth con l'OTP di sviluppo (convex/test.auth.ts). */

import { handleOAuthUserInfo } from "better-auth/oauth2";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messaggioErroreGoogle } from "../src/lib/auth-errori.ts";
import { api, components, internal } from "./_generated/api";
import {
  authComponent, createAuth, createAuthOptions, emailAmmessa, MESSAGGIO_INVITO, NON_INVITATO, OPZIONI_API_KEY, PERCORSI_ACCOUNT_SPENTI,
  PERCORSI_MCP, percorsiSpenti,
} from "./auth.ts";
import { codiceDi } from "./lib/errors.ts";
import { accedi, chiediCodice, envLocale, post, profiliDi, SITO, ultimoCodice } from "./test.auth.ts";
import { conProfilo, setup } from "./test.setup";

beforeEach(() => envLocale());
afterEach(() => vi.unstubAllEnvs());

const errore = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return { code: codiceDi(e), ...((e as { data?: Record<string, unknown> }).data ?? {}) } as Record<string, unknown>;
  }
};

describe("primo login", () => {
  it("crea l'utente e, nella stessa transazione, il profilo in onboarding", async () => {
    const t = setup();
    const a = await accedi(t, "Marta@Example.com");
    const profili = await profiliDi(t, a.userId);
    expect(profili).toHaveLength(1);
    expect(profili[0]).toMatchObject({ status: "onboarding", onboardingStep: "partenze", theme: { preset: "predefinito" } });
    expect(profili[0].handle).toBeUndefined();
    expect(await a.as.query(api.me.profile, {})).toMatchObject({ handle: null, status: "onboarding" });
    // l'utente ha l'email normalizzata
    const user = await t.run(ctx => ctx.runQuery(components.betterAuth.adapter.findOne, { model: "user", where: [{ field: "email", value: "marta@example.com" }] }));
    expect(user).not.toBeNull();
  });

  it("un secondo profilo è impossibile: nuovo login, trigger ripetuto, nuovo passo 1", async () => {
    const t = setup();
    const a = await accedi(t, "marta@example.com");
    await accedi(t, "marta@example.com");
    await t.mutation(internal.auth.onCreate, { model: "user", doc: { _id: a.userId } });
    expect(await profiliDi(t, a.userId)).toHaveLength(1);
    await a.as.mutation(api.profiles.completeOnboarding, { input: { handle: "marta", forma: "f", displayName: "Marta" } });
    expect(await errore(a.as.mutation(api.profiles.completeOnboarding, { input: { handle: "marta-due", forma: "f", displayName: "Marta" } }))).toMatchObject({
      code: "conflitto",
      fix: "/marta/modifica#account",
    });
    expect(await profiliDi(t, a.userId)).toHaveLength(1);
  });

  it("un codice sbagliato non fa entrare e dopo 5 tentativi il codice non vale più", async () => {
    const t = setup();
    await chiediCodice(t, "luca@example.com");
    const giusto = (await ultimoCodice(t, "luca@example.com"))!;
    const sbagliato = giusto === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await post(t, "/sign-in/email-otp", { email: "luca@example.com", otp: sbagliato })).status).not.toBe(200);
    expect((await post(t, "/sign-in/email-otp", { email: "luca@example.com", otp: giusto })).status).not.toBe(200);
    expect(await t.run(ctx => ctx.db.query("profiles").collect())).toEqual([]);
  });

  it("il codice si salva hashato, mai in chiaro", async () => {
    const t = setup();
    await chiediCodice(t, "luca@example.com");
    const otp = (await ultimoCodice(t, "luca@example.com"))!;
    expect(otp).toMatch(/^\d{6}$/);
    const righe = await t.run(ctx => ctx.runQuery(components.betterAuth.adapter.findMany, { model: "verification", paginationOpts: { numItems: 10, cursor: null } }));
    const testo = JSON.stringify(righe);
    expect(testo).toContain("sign-in-otp");
    expect(testo).not.toContain(otp);
  });
});

describe("completeOnboarding (passo 1)", () => {
  it("porta il profilo ad active con handle, forma e nome: la pagina esiste, vuota", async () => {
    const t = setup();
    const a = await accedi(t, "marta@example.com");
    expect(await a.as.mutation(api.profiles.completeOnboarding, { input: { handle: "marta", forma: "f", displayName: "Marta" } })).toEqual({ ok: true, handle: "marta" });
    expect(await a.as.query(api.me.profile, {})).toMatchObject({ handle: "marta", displayName: "Marta", status: "active", onboardingStep: "partenze" });
    const pagina = (await t.query(api.pages.byHandle, { handle: "marta" })) as { entries: unknown[] } | null;
    expect(pagina).not.toBeNull();
    expect(pagina!.entries).toEqual([]);
  });

  it("errori leggibili per handle riservati, già presi o alias, senza ripetere i valori", async () => {
    const t = setup();
    await t.mutation(internal.seed.ensure, {});
    const altro = await conProfilo(t, "u-altro", "preso");
    await altro.as.mutation(api.profiles.update, { input: { handle: "preso-nuovo" } }); // "preso" diventa un suo alias
    const a = await accedi(t, "marta@example.com");
    const prova = (handle: string) => errore(a.as.mutation(api.profiles.completeOnboarding, { input: { handle, forma: "n", displayName: "Marta" } }));

    // gabrifila: riservato e già del seed (il seed lo scavalca, nessun altro)
    expect(await t.query(api.pages.byHandle, { handle: "gabrifila" })).not.toBeNull();
    expect(await prova("gabrifila")).toMatchObject({ code: "handle_non_disponibile", campo: "handle" });
    expect(await prova("dati")).toMatchObject({ code: "handle_non_disponibile", messaggio: expect.stringContaining("riservato") });
    expect(await prova("accedi")).toMatchObject({ code: "handle_non_disponibile", messaggio: expect.stringContaining("riservato") });
    expect(await prova("preso-nuovo")).toMatchObject({ code: "handle_non_disponibile", messaggio: expect.stringContaining("già preso") });
    expect(await prova("preso")).toMatchObject({ code: "handle_non_disponibile", messaggio: expect.stringContaining("già preso") });
    const formato = await prova("Non Valido!");
    expect(formato).toMatchObject({ code: "input_non_valido", campo: "handle" });
    expect(JSON.stringify(formato)).not.toContain("Non Valido");
    // il profilo resta in onboarding
    expect(await a.as.query(api.me.profile, {})).toMatchObject({ status: "onboarding", handle: null });
  });

  it("handleAvailable controlla profili, alias e riservati; il proprio handle resta disponibile", async () => {
    const t = setup();
    const altro = await conProfilo(t, "u-altro", "preso");
    await altro.as.mutation(api.profiles.update, { input: { handle: "preso-nuovo" } });
    expect(await t.query(api.profiles.handleAvailable, { handle: "libero" })).toEqual({ disponibile: true });
    expect(await t.query(api.profiles.handleAvailable, { handle: "preso" })).toEqual({ disponibile: false, motivo: "già preso" });
    expect(await t.query(api.profiles.handleAvailable, { handle: "preso-nuovo" })).toEqual({ disponibile: false, motivo: "già preso" });
    expect(await t.query(api.profiles.handleAvailable, { handle: "benvenuto" })).toEqual({ disponibile: false, motivo: "riservato" });
    expect(await t.query(api.profiles.handleAvailable, { handle: "-x" })).toEqual({ disponibile: false, motivo: "formato non valido" });
    // per chi lo possiede, l'handle attuale e quello di prima (alias) sono disponibili
    expect(await altro.as.query(api.profiles.handleAvailable, { handle: "preso" })).toEqual({ disponibile: true });
    expect(await altro.as.query(api.profiles.handleAvailable, { handle: "preso-nuovo" })).toEqual({ disponibile: true });
  });

  it("solo con una sessione: niente token agente né Oracolo", async () => {
    const t = setup();
    const a = await accedi(t, "marta@example.com");
    const input = { handle: "marta", forma: "f", displayName: "Marta" };
    expect(await errore(t.mutation(api.profiles.completeOnboarding, { input }))).toMatchObject({ code: "unauthorized" });
    expect(await errore(a.as.mutation(api.profiles.completeOnboarding, { input, as: "oracolo" }))).toMatchObject({ code: "solo_dashboard" });
    expect(await errore(a.as.mutation(api.profiles.completeOnboarding, { input, agentToken: "cgk_x" }))).toMatchObject({ code: "unauthorized" });
  });
});

describe("passi 2–5 di /benvenuto", () => {
  it("da partenze a regali le partenze e i \"regalato da\" si creano; poi fatto", async () => {
    const t = setup();
    const a = await accedi(t, "marta@example.com");
    // prima del passo 1 non si scrive niente
    expect(await errore(a.as.mutation(api.departures.add, { input: { name: "Casa" } }))).toMatchObject({ code: "no_profile", fix: "/benvenuto" });
    expect(await errore(a.as.mutation(api.profiles.setOnboardingStep, { input: { passo: "agente" } }))).toMatchObject({ code: "no_profile" });
    await a.as.mutation(api.profiles.completeOnboarding, { input: { handle: "marta", forma: "f", displayName: "Marta" } });

    for (const passo of ["partenze", "agente", "regali"] as const) {
      await a.as.mutation(api.profiles.setOnboardingStep, { input: { passo } });
      expect((await a.as.query(api.me.profile, {}))!.onboardingStep).toBe(passo);
      await a.as.mutation(api.departures.add, { input: { name: `Casa ${passo}` } });
      await a.as.mutation(api.gifters.add, { input: { label: `Amici ${passo}` } });
    }
    await a.as.mutation(api.profiles.setOnboardingStep, { input: { passo: "fatto" } });
    expect((await a.as.query(api.me.profile, {}))!.onboardingStep).toBe("fatto");
    expect((await a.as.query(api.departures.list, {})).departures.map((d: { name: string }) => d.name)).toEqual(["Casa partenze", "Casa agente", "Casa regali"]);
  });

  it("setOnboardingStep è solo da dashboard e rifiuta passi che non esistono", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    expect(await errore(a.as.mutation(api.profiles.setOnboardingStep, { as: "oracolo", input: { passo: "fatto" } }))).toMatchObject({ code: "solo_dashboard" });
    expect(await errore(a.as.mutation(api.profiles.setOnboardingStep, { input: { passo: "inventato" } }))).toMatchObject({ code: "input_non_valido" });
  });
});

describe("admin:claimProfile", () => {
  it("lega gabrifila al primo login: cancella il profilo onboarding vuoto ed è idempotente", async () => {
    const t = setup();
    await t.mutation(internal.seed.ensure, {});
    const g = await accedi(t, "gabri@example.com");
    const vuoto = (await profiliDi(t, g.userId))[0]._id;
    const r = await t.mutation(internal.admin.claimProfile, { handle: "gabrifila", email: "Gabri@Example.com" });
    expect(r.giaLegato).toBe(false);
    expect(await t.run(ctx => ctx.db.get(vuoto))).toBeNull();
    expect(await g.as.query(api.me.profile, {})).toMatchObject({ handle: "gabrifila", status: "active", onboardingStep: "fatto" });
    expect(await profiliDi(t, g.userId)).toHaveLength(1);
    expect(await t.mutation(internal.admin.claimProfile, { handle: "gabrifila", email: "gabri@example.com" })).toEqual({ profileId: r.profileId, giaLegato: true });
  });

  it("rifiuta un profilo con handle o con dati, un profilo già legato e un'email sconosciuta", async () => {
    const t = setup();
    await t.mutation(internal.seed.ensure, {});
    await expect(t.mutation(internal.admin.claimProfile, { handle: "gabrifila", email: "nessuno@example.com" })).rejects.toThrow(/nessun utente/);

    // ha già una pagina
    const m = await accedi(t, "marta@example.com");
    await m.as.mutation(api.profiles.completeOnboarding, { input: { handle: "marta", forma: "f", displayName: "Marta" } });
    await expect(t.mutation(internal.admin.claimProfile, { handle: "gabrifila", email: "marta@example.com" })).rejects.toThrow(/handle o dati/);

    // profilo in onboarding ma con dati (scritti a mano)
    const l = await accedi(t, "luca@example.com");
    const pl = (await profiliDi(t, l.userId))[0]._id;
    await t.run(ctx => ctx.db.insert("people", { profileId: pl, name: "Marco R." }));
    await expect(t.mutation(internal.admin.claimProfile, { handle: "gabrifila", email: "luca@example.com" })).rejects.toThrow(/handle o dati/);
    expect(await t.run(ctx => ctx.db.get(pl))).not.toBeNull();

    // già legato a qualcun altro
    const g = await accedi(t, "gabri@example.com");
    await t.mutation(internal.admin.claimProfile, { handle: "gabrifila", email: "gabri@example.com" });
    const x = await accedi(t, "altro@example.com");
    await expect(t.mutation(internal.admin.claimProfile, { handle: "gabrifila", email: "altro@example.com" })).rejects.toThrow(/già legato/);
    expect(await x.as.query(api.me.profile, {})).toMatchObject({ status: "onboarding" });
    expect(await g.as.query(api.me.profile, {})).toMatchObject({ handle: "gabrifila" });
    await expect(t.mutation(internal.admin.claimProfile, { handle: "inesistente", email: "gabri@example.com" })).rejects.toThrow(/nessun profilo/);
  });
});

describe("SIGNUP_ALLOWLIST", () => {
  it("assente: registrazione aperta", () => {
    expect(emailAmmessa("chiunque@example.com", {})).toBe(true);
  });

  it("presente: solo le email dell'elenco creano un account (maiuscole e spazi indifferenti)", async () => {
    expect(emailAmmessa("Amica@Example.com", { SIGNUP_ALLOWLIST: " amica@example.com , altro@example.com" })).toBe(true);
    expect(emailAmmessa("estranea@example.com", { SIGNUP_ALLOWLIST: "amica@example.com" })).toBe(false);

    envLocale({ SIGNUP_ALLOWLIST: "amica@example.com" });
    const t = setup();
    await chiediCodice(t, "estranea@example.com");
    const r = await post(t, "/sign-in/email-otp", { email: "estranea@example.com", otp: await ultimoCodice(t, "estranea@example.com") });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ code: "NON_INVITATO", message: NON_INVITATO });
    const utenti = await t.run(ctx => ctx.runQuery(components.betterAuth.adapter.findMany, { model: "user", paginationOpts: { numItems: 10, cursor: null } }));
    expect((utenti as { page: unknown[] }).page).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("profiles").collect())).toEqual([]);

    const ok = await accedi(t, "amica@example.com");
    expect(await profiliDi(t, ok.userId)).toHaveLength(1);
  });

  it("con Google il rifiuto torna su /accedi come ?error=non_invitato, che la UI traduce nel messaggio dell'invito", async () => {
    envLocale({ SIGNUP_ALLOWLIST: "amica@example.com", GOOGLE_CLIENT_ID: "id-finto", GOOGLE_CLIENT_SECRET: "segreto-finto" });
    const t = setup();
    // il passo del callback OAuth che crea l'utente (better-auth/oauth2): l'errore del hook diventa `result.error`
    const esito = await t.run(async ctx =>
      handleOAuthUserInfo({ context: await createAuth(ctx).$context } as never, {
        userInfo: { id: "g-1", email: "Estranea@Example.com", emailVerified: true, name: "Estranea" },
        account: { providerId: "google", accountId: "g-1" },
        callbackURL: "/",
      } as never),
    );
    // api/routes/callback.mjs: redirectOnError(…, result.error.split(" ").join("_"))
    const errore = esito.error!.split(" ").join("_");
    expect(errore).toBe("non_invitato");
    expect(messaggioErroreGoogle(errore)).toBe(MESSAGGIO_INVITO);
    expect(await t.run(ctx => ctx.db.query("profiles").collect())).toEqual([]);
  });
});

describe("eliminazione dell'account", () => {
  it("/delete-user non esiste via HTTP: profilo, pagina e utente restano", async () => {
    const t = setup();
    const a = await accedi(t, "marta@example.com");
    await a.as.mutation(api.profiles.completeOnboarding, { input: { handle: "marta", forma: "f", displayName: "Marta" } });
    for (const p of PERCORSI_ACCOUNT_SPENTI) {
      const r = await t.fetch(`/api/auth${p}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: SITO, authorization: `Bearer ${a.token}` },
        body: "{}",
      });
      expect(r.status, p).toBe(404);
    }
    expect(await profiliDi(t, a.userId)).toHaveLength(1);
    expect(await t.query(api.pages.byHandle, { handle: "marta" })).not.toBeNull();
    expect(await a.as.query(api.me.profile, {})).toMatchObject({ handle: "marta" });
  });

  it("lato server deleteUser funziona ancora (la strada di account.delete, dopo la cascata)", async () => {
    const t = setup();
    const a = await accedi(t, "marta@example.com");
    await a.as.run(async ctx => {
      const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
      await auth.api.deleteUser({ body: {}, headers });
    });
    const utente = await t.run(ctx => ctx.runQuery(components.betterAuth.adapter.findOne, { model: "user", where: [{ field: "_id", value: a.userId }] }));
    expect(utente).toBeNull();
    expect(await a.as.query(api.me.profile, {})).toBeNull();
  });
});

describe("JWT di Convex", () => {
  it("porta solo sub, sessionId e le date: niente email né nome", async () => {
    const t = setup();
    const a = await accedi(t, "marta@example.com");
    const r = await t.fetch("/api/auth/convex/token", { headers: { origin: SITO, authorization: `Bearer ${a.token}` } });
    expect(r.status).toBe(200);
    const { token } = (await r.json()) as { token: string };
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))) as Record<string, unknown>;
    expect(payload).toMatchObject({ sub: a.userId, sessionId: a.sessionId, aud: "convex" });
    expect(Object.keys(payload).sort()).toEqual(["aud", "exp", "iat", "iss", "sessionId", "sub"]);
  });
});

describe("opzioni di Better Auth", () => {
  const opzioni = () => createAuthOptions({} as never);
  const plugin = (id: string) => opzioni().plugins.find(p => p.id === id) as { id: string; options?: Record<string, unknown> } | undefined;

  it("baseURL è SITE_URL e le trusted origins sono URL esatti", () => {
    envLocale({ BETTER_AUTH_TRUSTED_ORIGINS: "https://a.example.com, https://b.example.com" });
    expect(opzioni().baseURL).toBe("https://m3.prova.localhost:1355");
    expect(opzioni().trustedOrigins).toEqual(["https://a.example.com", "https://b.example.com"]);
    expect(opzioni().rateLimit).toEqual({ enabled: false });
    expect(opzioni().user.deleteUser.enabled).toBe(true);
    expect(opzioni().disabledPaths).toEqual(expect.arrayContaining(["/delete-user", "/delete-user/callback"]));
  });

  it("apiKey: prefisso cgk_, nessuna sessione dalle chiavi, limite interno spento; mcp e apiKey sempre presenti", () => {
    envLocale({ AUTH_DEV_OTP: undefined });
    const ids = opzioni().plugins.map(p => p.id);
    expect(ids).toEqual(expect.arrayContaining(["convex", "mcp", "api-key"]));
    expect(ids).not.toContain("email-otp");
    expect(ids).not.toContain("oauth-proxy");
    expect(OPZIONI_API_KEY).toEqual({ defaultPrefix: "cgk_", enableSessionForAPIKeys: false, rateLimit: { enabled: false } });
    // una richiesta con x-api-key non diventa mai una sessione
    const k = opzioni().plugins.find(p => p.id === "api-key") as unknown as { hooks: { before: { matcher: (c: unknown) => boolean }[] } };
    expect(k.hooks.before[0].matcher({ headers: new Headers({ "x-api-key": "cgk_" + "x".repeat(64) }) })).toBe(false);
  });

  it("MCP spento finché la corsia 7 non lo attiva; /mcp/get-session spento sempre", () => {
    expect(opzioni().disabledPaths).toEqual(expect.arrayContaining(PERCORSI_MCP));
    expect(percorsiSpenti(true)).toContain("/mcp/get-session");
    expect(percorsiSpenti(true)).not.toContain("/mcp/authorize");
  });

  it("Google solo con le credenziali, con prompt select_account", () => {
    expect(opzioni().socialProviders).toBeUndefined();
    envLocale({ GOOGLE_CLIENT_ID: "id-finto", GOOGLE_CLIENT_SECRET: "segreto-finto" });
    expect(opzioni().socialProviders).toMatchObject({ google: { clientId: "id-finto", prompt: "select_account" } });
  });

  it("oAuthProxy solo con OAUTH_PROXY_SECRET, con currentURL = SITE_URL", () => {
    envLocale({ OAUTH_PROXY_SECRET: "proxy-finto", OAUTH_PROXY_PRODUCTION_URL: "https://concerti.gabrifila.me" });
    expect(plugin("oauth-proxy")!.options).toMatchObject({ currentURL: "https://m3.prova.localhost:1355", productionURL: "https://concerti.gabrifila.me" });
  });

  it("emailOTP: 6 cifre, 10 minuti, 5 tentativi, hashato", () => {
    const o = plugin("email-otp")!.options as Record<string, unknown>;
    expect(o).toMatchObject({ otpLength: 6, expiresIn: 600, allowedAttempts: 5, storeOTP: "hashed" });
  });

  it("i percorsi di MCP rispondono 404 finché sono spenti", async () => {
    const t = setup();
    for (const p of ["/.well-known/oauth-authorization-server", "/mcp/get-session"]) {
      expect((await t.fetch(`/api/auth${p}`)).status, p).toBe(404);
    }
    expect((await post(t, "/mcp/register", { redirect_uris: ["http://localhost/cb"] })).status).toBe(404);
    expect((await post(t, "/forget-password/email-otp", { email: "a@example.com" })).status).toBe(404);
  });
});
