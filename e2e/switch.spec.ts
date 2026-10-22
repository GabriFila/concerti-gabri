/* ──────────────────────────────────────────────────────────────
   Lo switch in alto (SPEC §3, PIANO traguardo 4): "Sul palco · I dati ·
   Modifica" per il proprietario della pagina, solo "Sul palco · I dati"
   per tutti gli altri (visitatori anonimi e proprietari di altre pagine).
   Lo stato del proprietario arriva già nell'HTML SSR, quando la richiesta
   ha la sua sessione. Le parti col login (tag @sessione) aspettano la
   corsia 3 (e2e/helpers/auth.ts).
   ────────────────────────────────────────────────────────────── */

import type { Page } from "@playwright/test";
import { accediConOtp, nuovoProprietario } from "./helpers/auth.ts";
import { http } from "./helpers/http.ts";
import { expect, test } from "./helpers/test.ts";

const schede = (page: Page) => page.locator(".modeswitch").getByRole("tab");

/** Le schede del selettore nell'HTML SSR (prima di ogni JavaScript). */
const schedeSsr = (html: string) => {
  const box = html.slice(html.indexOf('class="modeswitch'));
  return [...box.slice(0, box.indexOf("</div>")).matchAll(/<a\b[^>]*>([^<]*)<\/a>/g)].map(m => m[1]);
};

test.describe("visitatore", () => {
  test("due stati: Sul palco e I dati, già nell'HTML", async ({ page, baseURL }) => {
    expect(schedeSsr(await (await http(new URL("/gabrifila", baseURL).href)).text())).toEqual(["Sul palco", "I dati"]);
    await page.goto("/gabrifila");
    await expect(schede(page)).toHaveText(["Sul palco", "I dati"]);
    await expect(page.locator(".modeswitch")).not.toHaveClass(/modeswitch--tre/);
    await expect(page.locator(".modeswitch-slide")).toHaveAttribute("data-view", "ritratto");
    await schede(page).filter({ hasText: "I dati" }).click();
    await expect(page).toHaveURL(/\/gabrifila\/dati$/);
    await expect(page.locator(".modeswitch-slide")).toHaveAttribute("data-view", "dati");
    await expect(schede(page).filter({ hasText: "I dati" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Modifica" })).toHaveCount(0);
  });
});

test.describe("proprietario", { tag: "@sessione" }, () => {
  test("tre stati sulla sua pagina, anche nell'HTML SSR; Modifica porta a /modifica", async ({ page }) => {
    const io = await nuovoProprietario(page, { forma: "f", nome: "Switch" });
    await page.goto(`/${io.handle}`);
    await expect(schede(page)).toHaveText(["Sul palco", "I dati", "Modifica"]);
    await expect(page.locator(".modeswitch")).toHaveClass(/modeswitch--tre/);
    // l'HTML del server, con la sua sessione (il fetch del browser porta il cookie)
    const html = await page.evaluate(() => fetch(location.href).then(r => r.text()));
    expect(schedeSsr(html)).toEqual(["Sul palco", "I dati", "Modifica"]);

    await schede(page).filter({ hasText: "I dati" }).click();
    await expect(page.locator(".modeswitch-slide")).toHaveAttribute("data-view", "dati");
    await schede(page).filter({ hasText: "Modifica" }).click();
    await expect(page).toHaveURL(new RegExp(`/${io.handle}/modifica$`));
    const modifica = page.getByRole("tab", { name: "Modifica" });
    await expect(modifica).toHaveAttribute("aria-selected", "true");
    await expect(modifica).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".modeswitch-slide")).toHaveAttribute("data-view", "modifica");
    // il cursore copre il terzo segmento e lo switch non tocca il pulsante del tema
    const [slide, bottone, tema] = await Promise.all([
      page.locator(".modeswitch-slide").boundingBox(),
      modifica.boundingBox(),
      page.locator(".theme-toggle").boundingBox(),
    ]);
    expect(Math.abs(slide!.x - bottone!.x)).toBeLessThan(2);
    expect(Math.abs(slide!.width - bottone!.width)).toBeLessThan(2);
    const sw = (await page.locator(".modeswitch").boundingBox())!;
    expect(sw.x + sw.width).toBeLessThanOrEqual(tema!.x);
  });

  test("sulla pagina di un altro: due stati", async ({ page }) => {
    await nuovoProprietario(page, { forma: "m", nome: "Altro" });
    await page.goto("/gabrifila");
    await expect(schede(page)).toHaveText(["Sul palco", "I dati"]);
    const html = await page.evaluate(() => fetch(location.href).then(r => r.text()));
    expect(schedeSsr(html)).toEqual(["Sul palco", "I dati"]);
  });

  test("un utente senza pagina (onboarding) vede due stati", async ({ page }) => {
    await accediConOtp(page, `e2e-switch-${Date.now()}@example.com`);
    await page.goto("/gabrifila");
    await expect(schede(page)).toHaveText(["Sul palco", "I dati"]);
  });
});
