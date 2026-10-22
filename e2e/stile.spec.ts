/* ──────────────────────────────────────────────────────────────
   #stile (traguardo 5): token con anteprima e contrasto, layout de
   "I dati", e il tema da descrizione.

   Il tema da descrizione gira con ORACOLO_FAKE=1 (token fissi, niente
   Gemini): `ORACOLO_FAKE=1 node scripts/wt.mjs exec -- pnpm e2e …`. Senza,
   il test si salta. I limiti (10 al giorno per profilo, 50 in tutto)
   ripartono da zero con style:azzeraLimitiTemaPerTest, così il globale
   consumato dalle run precedenti non conta.

   Tutte @sessione (login della corsia 3), su un proprietario nuovo.
   ────────────────────────────────────────────────────────────── */

import type { Page } from "@playwright/test";
import { nuovoProprietario } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { http } from "./helpers/http.ts";
import { expect, test } from "./helpers/test.ts";

/** I token fissi del tema da descrizione con ORACOLO_FAKE (src/modifica/temaGenerato.ts, TOKEN_FINTI). */
const FINTI = { accent: "#b4532a", fontTitoli: "playfair-display" } as const;

type Profilo = { theme: { preset: string; accent?: string; fontTitoli?: string }; layout: { ordine: string[]; nascoste: string[]; titoli: Record<string, string> } };
const profiloPubblico = (handle: string) => convexRun<{ profile: Profilo } | null>("pages:byHandle", { handle })?.profile;

const stile = (page: Page) => page.locator("section#stile");

test.describe("stile della pagina", { tag: "@sessione" }, () => {
  test.beforeAll(({}, info) => test.skip(info.project.name !== "desktop", "una volta sola, in locale"));

  test("preset e accento: anteprima, contrasto, un accento illeggibile non si salva; layout de «I dati»", async ({ page }) => {
    test.setTimeout(180_000);
    const { handle } = await nuovoProprietario(page, { nome: "Stile" });
    await page.goto(`/${handle}/modifica#stile`);

    await stile(page).getByRole("radio", { name: /Teatro/ }).check();
    await expect(stile(page).getByLabel("Accento esadecimale")).toHaveAttribute("placeholder", "#e2553f");
    // troppo scuro: errore leggibile e niente salvataggio
    await stile(page).getByLabel("Accento esadecimale").fill("#203040");
    await expect(stile(page).getByText(/troppo scuro/i).first()).toBeVisible();
    await stile(page).getByRole("button", { name: "Salva lo stile" }).click();
    await expect.poll(() => profiloPubblico(handle)?.theme.preset).toBe("predefinito");
    // un accento leggibile si salva, con il preset
    await stile(page).getByLabel("Accento esadecimale").fill("#ff8a3d");
    await expect(stile(page).getByText(/Contrasto dell'accento: \d+,\d:1 sul tema scuro/)).toBeVisible();
    await stile(page).getByRole("button", { name: "Salva lo stile" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Stile salvato" })).toBeVisible();
    await expect.poll(() => profiloPubblico(handle)?.theme).toMatchObject({ preset: "teatro", accent: "#ff8a3d" });

    // layout: una sezione nascosta e un titolo nuovo
    const layout = stile(page).getByRole("region", { name: "Sezioni de I dati" });
    await layout.getByRole("checkbox", { name: "Mostra Quanto spendo" }).uncheck();
    await layout.getByLabel("Titolo di Riepilogo").fill("I numeri");
    await layout.getByRole("button", { name: "Sposta giù Riepilogo" }).click();
    await layout.getByRole("button", { name: "Salva il layout" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Layout salvato" })).toBeVisible();
    await expect.poll(() => profiloPubblico(handle)?.layout).toMatchObject({
      nascoste: ["sec-spesa"],
      titoli: { "sec-kpis": "I numeri" },
      ordine: expect.arrayContaining(["sec-andamento", "sec-kpis"]),
    });
    expect(profiloPubblico(handle)?.layout.ordine.slice(0, 2)).toEqual(["sec-andamento", "sec-kpis"]);
  });

  test("tema da descrizione: anteprima validata, salvato; oltre il limite un messaggio", async ({ page, baseURL }) => {
    test.skip(process.env.ORACOLO_FAKE !== "1", "serve ORACOLO_FAKE=1 (token fissi, niente Gemini)");
    test.setTimeout(240_000);
    const { handle } = await nuovoProprietario(page, { nome: "Tema" });
    convexRun("style:azzeraLimitiTemaPerTest", { handle });
    await page.goto(`/${handle}/modifica#stile`);
    const sezione = stile(page).getByRole("region", { name: "Tema da descrizione" });
    const genera = async () => {
      await sezione.getByLabel("Com'è il tema che vuoi, a parole").fill("notte d'estate al mare");
      await sezione.getByRole("button", { name: "Genera" }).click();
    };

    await genera();
    await expect(sezione.getByText(`Proposta: accento ${FINTI.accent}, titoli in Playfair Display.`)).toBeVisible();
    await expect(sezione.getByLabel("Anteprima", { exact: true })).toBeVisible();
    // ancora niente salvato: si salva solo dopo l'anteprima
    expect(profiloPubblico(handle)?.theme.accent).toBeUndefined();
    await sezione.getByRole("button", { name: "Applica e salva" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Tema salvato" })).toBeVisible();
    await expect.poll(() => profiloPubblico(handle)?.theme).toMatchObject(FINTI);
    // il visitatore lo riceve già nell'HTML (token del tema nel <head>)
    expect(await (await http(new URL(`/${handle}`, baseURL).href)).text()).toContain(FINTI.accent);

    // dieci al giorno: la undicesima risponde col messaggio del limite
    for (let i = 2; i <= 10; i++) {
      await genera();
      await expect(sezione.getByText(`Proposta: accento ${FINTI.accent}`)).toBeVisible();
    }
    await genera();
    await expect(sezione.getByRole("alert")).toContainText("Hai già generato 10 temi oggi");
    await expect(sezione.getByText("Proposta:")).toHaveCount(0);
  });
});
