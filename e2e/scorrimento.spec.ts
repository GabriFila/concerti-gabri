/* ──────────────────────────────────────────────────────────────
   Lo scorrimento di lato col dito (src/ui/scorrimento.ts), sul telefono:

   - pagina pubblica: da «Sul palco» a «I dati» col dito verso sinistra,
     e ritorno verso destra; dal bordo dello schermo non succede niente
     (è il gesto «indietro» del sistema);
   - /modifica: Concerti → Wishlist → Persone e ritorno; dalla prima vista
     verso destra niente; con un pannello aperto niente.

   Tocchi veri (Input.dispatchTouchEvent di CDP), non eventi sintetici:
   passano dagli stessi ascoltatori del dito.
   ────────────────────────────────────────────────────────────── */

import type { CDPSession, Page } from "@playwright/test";
import { idratata, nuovoProprietario } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

async function dito(cdp: CDPSession, da: { x: number; y: number }, a: { x: number; y: number }) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [da] });
  for (let i = 1; i <= 6; i++) {
    const p = { x: da.x + ((a.x - da.x) * i) / 6, y: da.y + ((a.y - da.y) * i) / 6 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** Un passaggio di lato a metà altezza: `verso` -1 = dito verso sinistra. */
async function scorri(page: Page, cdp: CDPSession, verso: -1 | 1, o: { x0?: number; y?: number } = {}) {
  const { width, height } = page.viewportSize()!;
  const y = o.y ?? Math.round(height * 0.45);
  const x0 = o.x0 ?? (verso < 0 ? width * 0.8 : width * 0.2);
  await dito(cdp, { x: x0, y }, { x: x0 + verso * width * 0.5, y: y + 6 });
}

test.describe("scorrimento di lato", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile", "solo sul telefono"));

  test("pagina pubblica: Sul palco ↔ I dati", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await page.goto("/gabrifila");
    await idratata(page);

    // dal bordo: è il gesto «indietro» del sistema, la pagina resta
    await scorri(page, cdp, 1, { x0: 8 });
    await scorri(page, cdp, -1, { x0: page.viewportSize()!.width - 8 });
    await expect(page).toHaveURL(/\/gabrifila$/);

    await scorri(page, cdp, -1);
    await expect(page).toHaveURL(/\/gabrifila\/dati$/);
    await expect(page.getByRole("tab", { name: "I dati" })).toHaveAttribute("aria-selected", "true");

    // ancora verso sinistra: I dati è l'ultima (Modifica non si raggiunge così)
    await scorri(page, cdp, -1);
    await expect(page).toHaveURL(/\/gabrifila\/dati$/);

    // sulla tabella dei concerti, che scorre di lato, il dito muove la tabella e la pagina resta
    const tabella = page.locator(".tablewrap").first();
    await tabella.scrollIntoViewIfNeeded();
    expect(await tabella.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    const box = (await tabella.boundingBox())!;
    await scorri(page, cdp, 1, { y: Math.round(box.y + Math.min(box.height / 2, 120)) });
    await expect(page).toHaveURL(/\/gabrifila\/dati$/);

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await scorri(page, cdp, 1);
    await expect(page).toHaveURL(/\/gabrifila$/);
  });
});

test.describe("scorrimento di lato in /modifica", { tag: "@sessione" }, () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile" || onPreview(info.project.name), "solo sul telefono, in locale"));
  test.afterAll(({}, info) => {
    if (!onPreview(info.project.name)) convexRun("devtools:cleanupE2E");
  });

  test("le viste nell'ordine, ma non con un pannello aperto", async ({ page }) => {
    test.setTimeout(120_000);
    const { handle } = await nuovoProprietario(page, { forma: "f", nome: "Scorrimento" });
    const cdp = await page.context().newCDPSession(page);
    await page.goto(`/${handle}/modifica`);
    await idratata(page);
    await expect(page.locator("section#concerti")).toBeVisible();

    // la prima vista: verso destra non c'è niente
    await scorri(page, cdp, 1);
    await expect(page.locator("section#concerti")).toBeVisible();

    // all'altezza del titolo della vista: un campo di testo tiene il dito per sé (il cursore)
    const sulTitolo = async (id: string, verso: -1 | 1) => {
      const box = (await page.locator(`section#${id} h1`).boundingBox())!;
      await scorri(page, cdp, verso, { y: Math.round(box.y + box.height / 2) });
    };
    await sulTitolo("concerti", -1);
    await expect(page.locator("section#wishlist")).toBeVisible();
    await expect(page).toHaveURL(/#wishlist$/);
    await sulTitolo("wishlist", -1);
    await expect(page.locator("section#persone")).toBeVisible();
    await sulTitolo("persone", 1);
    await expect(page.locator("section#wishlist")).toBeVisible();
    await sulTitolo("wishlist", 1);
    await expect(page.locator("section#concerti")).toBeVisible();

    // con il pannello «Nuovo concerto» aperto il gesto non cambia vista
    await page.goto(`/${handle}/modifica#concerti?nuovo=concerto`);
    await idratata(page);
    await expect(page.getByRole("dialog", { name: /Nuovo concerto/ })).toBeVisible();
    await scorri(page, cdp, -1);
    await expect(page).toHaveURL(/#concerti\?nuovo=concerto$/);
    await expect(page.locator("section#concerti")).toBeAttached();
  });
});
