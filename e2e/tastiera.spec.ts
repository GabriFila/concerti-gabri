/* ──────────────────────────────────────────────────────────────
   La tastiera del telefono non copre le finestre (src/ui/tastiera.ts).

   Chromium headless non apre una tastiera: la si finge sostituendo
   `window.visualViewport` prima che la pagina parta, poi `__tastiera(h,
   alto)` lo restringe come fa la tastiera vera (alto > 0 è iOS che sposta
   la parte visibile in giù). Si controlla che finestra e campo stiano
   dentro la parte visibile, e che a tastiera chiusa tutto torni com'era.
   Solo nel progetto mobile.
   ────────────────────────────────────────────────────────────── */

import type { Locator, Page } from "@playwright/test";
import { nuovoProprietario } from "./helpers/auth.ts";
import { expect, test } from "./helpers/test.ts";

declare global {
  interface Window {
    __tastiera: (altezza: number | null, alto?: number) => void;
  }
}

const TASTIERA = 330;

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "la tastiera c'è solo sul telefono");
  await page.addInitScript(() => {
    const finto = new EventTarget();
    let altezza: number | null = null;
    let alto = 0;
    const leggi = (v: () => number) => ({ get: v, configurable: true });
    Object.defineProperties(finto, {
      height: leggi(() => altezza ?? window.innerHeight),
      width: leggi(() => window.innerWidth),
      offsetTop: leggi(() => alto),
      offsetLeft: leggi(() => 0),
      pageTop: leggi(() => window.scrollY + alto),
      pageLeft: leggi(() => window.scrollX),
      scale: leggi(() => 1),
    });
    Object.defineProperty(window, "visualViewport", { get: () => finto, configurable: true });
    window.__tastiera = (h, a = 0) => {
      altezza = h;
      alto = a;
      finto.dispatchEvent(new Event("resize"));
    };
  });
});

/** Apre la tastiera finta (`alto`: quanto iOS sposta in giù la parte visibile). */
async function apri(page: Page, alto = 0) {
  await page.evaluate(([t, a]) => window.__tastiera(window.innerHeight - t - a, a), [TASTIERA, alto]);
  await expect(page.locator("html")).toHaveAttribute("data-tastiera", "");
}

/** Il riquadro sta dentro la parte visibile [alto, innerHeight − tastiera]. */
async function dentroVisibile(page: Page, el: Locator, alto = 0) {
  const fondo = await page.evaluate(t => window.innerHeight - t, TASTIERA);
  await expect(async () => {
    const r = await el.boundingBox();
    expect(r).not.toBeNull();
    expect(r!.y).toBeGreaterThanOrEqual(alto - 1);
    expect(r!.y + r!.height).toBeLessThanOrEqual(fondo + 1);
  }).toPass({ timeout: 5_000 });
}

test("la chat pubblica resta sopra la tastiera", async ({ page }) => {
  await page.goto("/gabrifila");
  await page.getByRole("button", { name: "Apri L'Oracolo, la chat AI" }).click();
  const chat = page.getByRole("dialog", { name: "L'Oracolo, chat AI" });
  const casella = chat.getByRole("textbox", { name: "Messaggio" });
  await casella.focus();
  const prima = await chat.boundingBox();

  await apri(page);
  await dentroVisibile(page, chat);
  await dentroVisibile(page, casella);

  // chiusa la tastiera, la chat torna alla sua altezza
  await page.evaluate(() => window.__tastiera(null));
  await expect(page.locator("html")).not.toHaveAttribute("data-tastiera", "");
  await expect.poll(async () => (await chat.boundingBox())?.height).toBe(prima?.height);
});

test("l'indirizzo di una partenza, il form di un concerto e il Tour manager restano sopra la tastiera", { tag: "@sessione" }, async ({ page }) => {
  test.setTimeout(120_000);
  const { handle } = await nuovoProprietario(page, { nome: "Tastiera" });
  await page.goto(`/${handle}/modifica#partenze`);
  const sezione = page.locator("section#partenze");
  await sezione.getByLabel("Nuova partenza").fill("Casa tastiera");
  await sezione.getByRole("button", { name: "Aggiungi" }).click();

  // il foglio dal basso dell'indirizzo, anche con iOS che sposta la parte visibile
  const foglio = page.getByRole("dialog", { name: "Imposta l'indirizzo di Casa tastiera" });
  const campo = foglio.getByRole("textbox").first();
  await campo.focus();
  await apri(page);
  await dentroVisibile(page, foglio);
  await dentroVisibile(page, campo);
  await dentroVisibile(page, foglio.getByRole("button", { name: /cerca/i }));
  await apri(page, 80);
  await dentroVisibile(page, foglio, 80);
  await dentroVisibile(page, campo, 80);

  // un campo senza focus non è una tastiera; chiusa, il foglio torna appoggiato al fondo
  await page.evaluate(() => window.__tastiera(null));
  await expect(page.locator("html")).not.toHaveAttribute("data-tastiera", "");
  const fondo = await page.evaluate(() => window.innerHeight);
  await expect.poll(async () => { const r = await foglio.boundingBox(); return r && Math.round(r.y + r.height); }).toBe(fondo);
  await foglio.getByRole("button", { name: "Chiudi" }).click();
  await expect(foglio).toBeHidden();

  // il form a tutto schermo di un concerto: il piede con «Salva» sopra la tastiera
  await page.goto(`/${handle}/modifica#concerti`);
  await page.locator("section#concerti").getByRole("button", { name: "Aggiungi un concerto" }).click();
  const modulo = page.getByRole("dialog", { name: "Nuovo concerto" });
  await modulo.locator('input[name="artist"]').focus();
  await apri(page);
  await dentroVisibile(page, modulo);
  await dentroVisibile(page, modulo.getByRole("button", { name: "Salva", exact: true }));
  await page.evaluate(() => window.__tastiera(null));
  await modulo.getByRole("button", { name: "Chiudi" }).click();
  await expect(modulo).toBeHidden();

  // il Tour manager: la casella in fondo resta sopra la tastiera
  await page.getByRole("button", { name: "Apri il Tour manager" }).click();
  const chat = page.getByRole("dialog", { name: "Il Tour manager" });
  const casella = chat.getByRole("textbox", { name: "Messaggio per il Tour manager" });
  await casella.focus();
  await apri(page);
  await dentroVisibile(page, chat);
  await dentroVisibile(page, casella);
});
