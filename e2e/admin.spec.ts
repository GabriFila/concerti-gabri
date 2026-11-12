/* ──────────────────────────────────────────────────────────────
   La vista admin in sola lettura (DECISIONI «Vista admin», 2026-11-12).

   - Un utente di prova diventa admin del deployment LOCALE
     (`convex-locale.mjs admin <id>`, l'id da devtools:idUtenteDiProva):
     vede l'elenco di tutti i profili (gabrifila compreso), lo ordina, apre
     il dettaglio; testi a contrasto e bersagli da 44 px, in chiaro e in
     scuro; nell'HTML c'è `noindex`.
   - Un utente normale e un visitatore anonimo ricevono il 404 delle
     pagine inesistenti, per l'elenco e per il dettaglio, e l'HTML non
     nomina le funzioni admin.
   Alla fine ADMIN_USER_IDS si toglie. @sessione, solo in locale.
   ────────────────────────────────────────────────────────────── */

import type { Page } from "@playwright/test";
import { bersagliPiccoli, contrasti } from "./helpers/accessibilita.ts";
import { impostaAdmin, rendiAdmin } from "./helpers/admin.ts";
import { esci, idratata, nuovoProprietario } from "./helpers/auth.ts";
import { http } from "./helpers/http.ts";
import { setTemaCookie } from "./helpers/tema.ts";
import { expect, test } from "./helpers/test.ts";

/** L'HTML SSR di un percorso con la sessione della pagina. */
const htmlConSessione = (page: Page, percorso: string) =>
  page.evaluate(async p => {
    const r = await fetch(p, { credentials: "same-origin" });
    return { status: r.status, html: await r.text() };
  }, percorso);

test.describe("vista admin", { tag: "@sessione" }, () => {
  test.describe.configure({ mode: "serial" });
  test.afterAll(() => impostaAdmin("-"));

  test("l'admin vede tutti i profili, li ordina e apre il dettaglio", async ({ page, context, baseURL }) => {
    test.setTimeout(180_000);
    const io = await nuovoProprietario(page, { nome: "Admin E2E" });
    rendiAdmin(io.email);

    const res = await page.goto("/admin");
    expect(res?.status()).toBe(200);
    await idratata(page);
    await expect(page.getByRole("heading", { level: 1, name: "Profili" })).toBeVisible();
    const tabella = page.getByRole("table");
    await expect(tabella.getByRole("link", { name: "gabrifila", exact: true })).toBeVisible();
    await expect(tabella.getByRole("link", { name: io.handle, exact: true })).toBeVisible();
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");

    // ordinare per concerti: gabrifila (91) in cima in discesa
    await page.getByRole("button", { name: /^Concerti/ }).click();
    await expect(page.locator("th", { has: page.getByRole("button", { name: /^Concerti/ }) })).toHaveAttribute("aria-sort", "descending");
    await expect(tabella.locator("tbody tr").first()).toContainText("gabrifila");
    await page.getByRole("button", { name: /^Concerti/ }).click();
    await expect(page.locator("th", { has: page.getByRole("button", { name: /^Concerti/ }) })).toHaveAttribute("aria-sort", "ascending");

    // accessibilità: contrasto e bersagli, in scuro e in chiaro
    for (const tema of ["dark", "light"]) {
      await setTemaCookie(context, baseURL!, tema);
      await page.goto("/admin");
      await idratata(page);
      expect(await contrasti(page, ".ad"), `contrasto (${tema})`).toEqual([]);
      expect(await bersagliPiccoli(page, ".ad", 44), `bersagli (${tema})`).toEqual([]);
    }

    // il dettaglio di gabrifila: conteggi, partenze, registro
    await page.getByRole("table").getByRole("link", { name: "gabrifila", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/gabrifila$/);
    await expect(page.getByRole("heading", { level: 2, name: "Conteggi" })).toBeVisible();
    await expect(page.locator(".ad-conteggio", { hasText: "Concerti" })).toContainText("91");
    await expect(page.getByText(/indirizzo (impostato|mancante)/).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /^Registro/ })).toBeVisible();
    expect(await contrasti(page, ".ad"), "contrasto del dettaglio").toEqual([]);
    expect(await bersagliPiccoli(page, ".ad", 44), "bersagli del dettaglio").toEqual([]);

    // anche in SSR, per un caricamento diretto
    const diretto = await page.goto("/admin/gabrifila");
    expect(diretto?.status()).toBe(200);
    expect((await page.goto("/admin/nessuno-qui"))?.status()).toBe(404);
  });

  test("un utente normale e un visitatore ricevono 404", async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    // un altro admin c'è (non questo utente)
    impostaAdmin("utente-che-non-esiste");
    await nuovoProprietario(page);
    for (const percorso of ["/admin", "/admin/gabrifila"]) {
      const r = await page.goto(percorso);
      expect(r?.status(), `utente: ${percorso}`).toBe(404);
      await expect(page.getByRole("heading", { name: "Qui non suona nessuno" })).toBeVisible();
      const { status, html } = await htmlConSessione(page, percorso);
      expect(status).toBe(404);
      expect(html).not.toMatch(/admin:|Profili · Admin|noindex, nofollow/);
    }
    await esci(page);
    for (const percorso of ["/admin", "/admin/gabrifila"]) {
      const r = await http(new URL(percorso, baseURL).href);
      expect(r.status(), `visitatore: ${percorso}`).toBe(404);
      expect(await r.text()).not.toMatch(/admin:|Profili · Admin/);
    }
  });
});
