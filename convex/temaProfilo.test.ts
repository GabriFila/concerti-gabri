/* Traguardo 4 sul backend: il validatore del tema in profiles.setTheme
   (contrasto, enum, id di sezione), il tema e il layout che arrivano alla
   pagina pubblica, e i km in attesa visibili come `kmPending` (mai il km). */

import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { PROD_DEPLOYMENT } from "./devtools.ts";
import { codiceDi } from "./lib/errors.ts";
import { conProfilo, setup } from "./test.setup";
import { buildDataset } from "../shared/lib/dataset.ts";
import { computeKpis } from "../shared/lib/kpis.ts";
import { pageToDataset, type PaginaPubblica } from "../shared/lib/pageToDataset.ts";
import { themeCss } from "../shared/theme.ts";

afterEach(() => vi.unstubAllEnvs());

async function rifiuta(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return { code: codiceDi(e), data: (e as { data?: Record<string, unknown> }).data ?? {}, testo: JSON.stringify((e as { data?: unknown }).data) + String((e as Error).message) };
  }
  throw new Error("doveva fallire");
}

describe("profiles.setTheme: il validatore del tema", () => {
  it("rifiuta un accento illeggibile sul tema scuro, senza ripeterlo", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    const e = await rifiuta(a.as.mutation(api.profiles.setTheme, { input: { theme: { preset: "predefinito", accent: "#1a1a2e" } } }));
    expect(e.code).toBe("input_non_valido");
    expect(e.data.campo).toBe("theme.accent");
    expect(e.testo).not.toContain("1a1a2e");
  });

  it("rifiuta un preset sconosciuto, raggi o densità fuori enum e sezioni inesistenti", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    for (const [input, campo] of [
      [{ theme: { preset: "canarino" } }, "theme.preset"],
      [{ theme: { preset: "predefinito", raggi: "enormi" } }, "theme.raggi"],
      [{ theme: { preset: "predefinito", densita: "fitta" } }, "theme.densita"],
      [{ layout: { ordine: ["sec-canarino"], nascoste: [], titoli: {} } }, "layout.ordine"],
    ] as const) {
      const e = await rifiuta(a.as.mutation(api.profiles.setTheme, { input }));
      expect(e.code, campo).toBe("input_non_valido");
      expect(e.data.campo).toBe(campo);
      expect(e.testo).not.toContain("canarino");
    }
    // niente è cambiato
    const p = await a.as.query(api.profiles.get, {});
    expect(p.theme).toEqual({ preset: "predefinito" });
  });

  it("un tema valido arriva alla pagina pubblica, col layout, e diventa CSS", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    const layout = { ordine: ["sec-archivio"], nascoste: ["sec-spesa"], titoli: { "sec-mappa": "I miei viaggi" } };
    await a.as.mutation(api.profiles.setTheme, { input: { theme: { preset: "neon", raggi: "tondi" }, layout } });
    const page = (await t.query(api.pages.byHandle, { handle: "utente-a" })) as PaginaPubblica;
    expect(page.profile.theme).toEqual({ preset: "neon", raggi: "tondi" });
    expect(page.profile.layout).toEqual(layout);
    const css = themeCss(page.profile.theme as never);
    expect(css).toContain("--lamp:#ff4fa3");
    expect(css).toContain("--r-pannello:26px");
  });
});

describe("devtools.preparaProfiloDiProva e km in attesa", () => {
  it("forma, extra, persone e partenze; un concerto da una partenza senza indirizzo ha kmPending e niente km", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
    vi.stubEnv("AUTH_DEV_OTP", "1");
    const t = setup();
    await t.mutation(internal.seed.ensure, {});
    await t.mutation(internal.devtools.preparaProfiloDiProva, {
      handle: "e2e-forma-f", displayName: "Giulia", forma: "f", extra: { creditoFooter: "Grazie a tutti" },
      persone: ["Ale"], partenze: ["Casa"],
    });
    const concerto = { kind: "concert", date: "2026-03-10", artist: "Prova", venue: "Fabrique", city: "Milano", with: ["Ale"], from: "Casa" };
    await t.mutation(internal.devtools.preparaProfiloDiProva, { handle: "e2e-forma-f", concerti: [concerto, { ...concerto, artist: "Doppio" }] });
    // idempotente: rilanciarla non duplica persone né partenze, e i concerti si sostituiscono in blocco
    await t.mutation(internal.devtools.preparaProfiloDiProva, { handle: "e2e-forma-f", persone: ["Ale"], partenze: ["Casa"], concerti: [concerto] });
    const page = (await t.query(api.pages.byHandle, { handle: "e2e-forma-f" })) as PaginaPubblica;
    expect(page.profile).toMatchObject({ displayName: "Giulia", forma: "f", extra: { creditoFooter: "Grazie a tutti" } });
    expect(page.departures.map(d => d.name)).toEqual(["Casa"]);
    expect(page.people.map(p => p.name)).toEqual(["Ale"]);
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].kmPending).toBe(true);
    expect(page.entries[0].km).toBeUndefined();
    // fino ai KPI: il viaggio è in attesa, i km non contano
    const ds = buildDataset(pageToDataset(page));
    expect(ds.entries[0].kmPending).toBe(true);
    const km = computeKpis(ds.entries, Date.parse("2026-10-21T12:00:00+02:00")).find(k => k.id === "km")!;
    expect(km.value).toBe("0");
    expect(km.hint).toBe("andata e ritorno (1 viaggio in attesa)");
  });

  it("alias di prova: il vecchio handle porta al nuovo (redirect), anche se lo si rilancia", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
    vi.stubEnv("AUTH_DEV_OTP", "1");
    const t = setup();
    await t.mutation(internal.devtools.preparaProfiloDiProva, { handle: "e2e-nuovo", alias: ["e2e-vecchio"] });
    await t.mutation(internal.devtools.preparaProfiloDiProva, { handle: "e2e-nuovo", alias: ["e2e-vecchio"] });
    expect(await t.query(api.pages.byHandle, { handle: "e2e-vecchio" })).toEqual({ redirect: "e2e-nuovo" });
    expect(await t.run(ctx => ctx.db.query("handleAliases").collect())).toHaveLength(1);
  });

  it("rifiuta handle che non sono di prova e il deployment di produzione", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
    vi.stubEnv("AUTH_DEV_OTP", "1");
    const t = setup();
    await expect(t.mutation(internal.devtools.preparaProfiloDiProva, { handle: "gabrifila", forma: "f" })).rejects.toThrow(/e2e-/);
    // nemmeno come alias: gabrifila non si ruba
    await expect(t.mutation(internal.devtools.preparaProfiloDiProva, { handle: "e2e-x", alias: ["gabrifila"] })).rejects.toThrow(/e2e-/);
    vi.stubEnv("CONVEX_CLOUD_URL", `https://${PROD_DEPLOYMENT}.eu-west-1.convex.cloud`);
    await expect(t.mutation(internal.devtools.preparaProfiloDiProva, { handle: "e2e-x" })).rejects.toThrow(/produzione/);
  });
});
