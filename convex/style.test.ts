/* #stile (T5): token validati, layout di §1.35 (solo le sezioni de "I dati",
   senza doppioni), limiti del tema da descrizione per profilo e globali,
   contenuti del footer. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { SECTION_IDS } from "../shared/sections.ts";
import { codiceDi } from "./lib/errors.ts";
import { rateLimiter } from "./rateLimits.ts";
import { conProfilo, setup, type T } from "./test.setup";

const errDi = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { data: Record<string, unknown> }).data ?? { code: String((e as Error).message) };
  }
};
const codice = async (p: Promise<unknown>) => (await errDi(p))?.code ?? "ok";

const pagina = async (t: T, handle: string) => {
  const p = await t.query(api.pages.byHandle, { handle });
  if (!p || "redirect" in p) throw new Error("pagina assente");
  return p.profile;
};

describe("token del tema", () => {
  it("valori validi salvati e visibili nella pagina; non validi rifiutati senza ripeterli", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    await a.as.mutation(api.profiles.setTheme, { input: { theme: { preset: "predefinito", accent: "#b4532a", fontTitoli: "space-grotesk" } } });
    expect((await pagina(t, "utente-a")).theme).toEqual({ preset: "predefinito", accent: "#b4532a", fontTitoli: "space-grotesk" });
    for (const theme of [
      { preset: "predefinito", accent: "red;}body{display:none" },
      { preset: "predefinito", accent: "#fff" },
      { preset: "predefinito", fontTitoli: "comic-sans" },
      { preset: "Predefinito</style>" },
      { preset: "predefinito", raggi: "url(x)" },
    ]) {
      const err = await errDi(a.as.mutation(api.profiles.setTheme, { input: { theme } }));
      expect(err?.code).toBe("input_non_valido");
      expect(JSON.stringify(err)).not.toMatch(/display:none|comic|style>|url\(/);
    }
    expect((await pagina(t, "utente-a")).theme.accent).toBe("#b4532a");
  });
});

describe("layout (§1.35)", () => {
  it("ordine, sezioni nascoste e titoli delle sezioni de \"I dati\"; doppioni tolti, titoli ripuliti", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    await a.as.mutation(api.profiles.setTheme, {
      input: { layout: { ordine: ["sec-mappa", "sec-kpis", "sec-mappa"], nascoste: ["sec-spesa", "sec-spesa"], titoli: { "sec-kpis": "  In breve " } } },
    });
    expect((await pagina(t, "utente-a")).layout).toEqual({ ordine: ["sec-mappa", "sec-kpis"], nascoste: ["sec-spesa"], titoli: { "sec-kpis": "In breve" } });
  });

  it("una sezione sconosciuta è un errore con l'elenco di quelle valide, senza ripetere l'id ricevuto", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    for (const layout of [
      { ordine: ["sec-inventata"], nascoste: [], titoli: {} },
      { ordine: [], nascoste: ["sec-inventata"], titoli: {} },
      { ordine: [], nascoste: [], titoli: { "sec-inventata": "x" } },
    ]) {
      const err = await errDi(a.as.mutation(api.profiles.setTheme, { input: { layout } }));
      expect(err?.code).toBe("input_non_valido");
      expect(String(err?.messaggio)).toContain(SECTION_IDS[0]);
      expect(JSON.stringify(err)).not.toContain("inventata");
    }
    // id che non sono sezioni affatto: li ferma già lo schema, senza ripeterli
    const err = await errDi(a.as.mutation(api.profiles.setTheme, { input: { layout: { ordine: ["<script>"], nascoste: [], titoli: { "<b>": "x" } } } }));
    expect(err?.code).toBe("input_non_valido");
    expect(JSON.stringify(err)).not.toMatch(/script|<b>/);
  });

  it("Annulla riporta il layout di prima", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    await a.as.mutation(api.profiles.setTheme, { input: { layout: { ordine: [], nascoste: ["sec-mappa"], titoli: {} } } });
    const [voce] = (await a.as.query(api.activity.list, {})).voci;
    await a.as.mutation(api.activity.undo, { input: { activityId: voce.id } });
    expect((await pagina(t, "utente-a")).layout).toEqual({ ordine: [], nascoste: [], titoli: {} });
  });
});

describe("tema da descrizione: limiti", () => {
  const consuma = (as: Awaited<ReturnType<typeof conProfilo>>["as"]) => codice(as.mutation(api.style.consumeThemeGeneration, {}));

  it("themeFromDescription: 10 al giorno per profilo; ogni profilo ha i suoi", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    const b = await conProfilo(t, "u-b", "utente-b");
    for (let i = 0; i < 10; i++) expect(await consuma(a.as)).toBe("ok");
    expect(await consuma(a.as)).toBe("limite_superato");
    expect(await consuma(b.as)).toBe("ok");
  });

  it("themeGlobalDay: 50 al giorno in tutto; se il globale è finito il profilo non consuma il suo", async () => {
    const t = setup();
    for (let p = 0; p < 5; p++) {
      const x = await conProfilo(t, `u-${p}`, `utente-${p}`);
      for (let i = 0; i < 10; i++) expect(await consuma(x.as)).toBe("ok");
    }
    const z = await conProfilo(t, "u-z", "utente-z");
    expect(await consuma(z.as)).toBe("limite_superato");
    const suo = await t.run(async ctx => await rateLimiter.check(ctx, "themeFromDescription", { key: z.profileId, count: 10 }));
    expect(suo.ok).toBe(true);
  });

  it("solo dalla dashboard: né l'Oracolo né un anonimo", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    expect(await codice(a.as.mutation(api.style.consumeThemeGeneration, { as: "oracolo" }))).toBe("solo_dashboard");
    expect(await codice(t.mutation(api.style.consumeThemeGeneration, {}))).toBe("unauthorized");
  });

  describe("azzeraLimitiTemaPerTest (e2e/stile.spec)", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("in sviluppo rimette a zero il limite del profilo e quello globale", async () => {
      vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
      vi.stubEnv("AUTH_DEV_OTP", "1");
      const t = setup();
      const a = await conProfilo(t, "u-a", "utente-a");
      for (let i = 0; i < 10; i++) await consuma(a.as);
      expect(await consuma(a.as)).toBe("limite_superato");
      await t.mutation(internal.style.azzeraLimitiTemaPerTest, { handle: "utente-a" });
      expect(await consuma(a.as)).toBe("ok");
      // un handle che non c'è azzera solo il globale
      await t.mutation(internal.style.azzeraLimitiTemaPerTest, { handle: "nessuno" });
    });

    it("rifiuta sul deployment di produzione e senza AUTH_DEV_OTP=1", async () => {
      vi.stubEnv("CONVEX_CLOUD_URL", "https://brave-chickadee-534.eu-west-1.convex.cloud");
      vi.stubEnv("AUTH_DEV_OTP", "1");
      await expect(setup().mutation(internal.style.azzeraLimitiTemaPerTest, { handle: "x" })).rejects.toThrow(/produzione/);
      vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
      vi.stubEnv("AUTH_DEV_OTP", "0");
      await expect(setup().mutation(internal.style.azzeraLimitiTemaPerTest, { handle: "x" })).rejects.toThrow(/AUTH_DEV_OTP/);
    });
  });
});

describe("footer (setExtra)", () => {
  it("credito e link https; null li toglie; Annulla li riporta", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-g", "gabrifila");
    await a.as.mutation(api.style.setExtra, { input: { creditoFooter: "Grazie a Cami", linkTappi: "https://loop.example" } });
    expect((await pagina(t, "gabrifila")).extra).toEqual({ creditoFooter: "Grazie a Cami", linkTappi: "https://loop.example" });
    expect(await codice(a.as.mutation(api.style.setExtra, { input: { linkTappi: "javascript:alert(1)" } }))).toBe("input_non_valido");
    await a.as.mutation(api.style.setExtra, { input: { linkTappi: null } });
    expect((await pagina(t, "gabrifila")).extra).toEqual({ creditoFooter: "Grazie a Cami" });
    const [voce] = (await a.as.query(api.activity.list, {})).voci;
    await a.as.mutation(api.activity.undo, { input: { activityId: voce.id } });
    expect((await pagina(t, "gabrifila")).extra).toEqual({ creditoFooter: "Grazie a Cami", linkTappi: "https://loop.example" });
    expect(await codice(a.as.mutation(api.style.setExtra, { as: "oracolo", input: { creditoFooter: null } }))).toBe("solo_dashboard");
  });

  it("solo gabrifila (anche dopo un cambio di handle): un altro profilo no", async () => {
    const t = setup();
    const b = await conProfilo(t, "u-b", "utente-b");
    expect(await codice(b.as.mutation(api.style.setExtra, { input: { creditoFooter: "Pubblicità", linkTappi: "https://spam.example" } }))).toBe("input_non_valido");
    expect((await pagina(t, "utente-b")).extra).toEqual({});
    // gabrifila rinominato: l'handle vecchio è un suo alias, il footer resta suo
    const g = await conProfilo(t, "u-g", "gabri-nuovo");
    await t.run(async ctx => {
      await ctx.db.insert("handleAliases", { handle: "gabrifila", profileId: g.profileId, createdAt: Date.now() });
    });
    expect(await codice(g.as.mutation(api.style.setExtra, { input: { creditoFooter: "Grazie a Cami" } }))).toBe("ok");
  });
});
