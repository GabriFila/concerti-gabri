/* ──────────────────────────────────────────────────────────────
   /<handle>/modifica negli e2e (spec ux-modifica §11): una vista alla
   volta, quindi ogni passo che cambia vista passa da `vaiA`. Le viste
   nascoste non si vedono con getByRole e si montano solo la prima volta
   che si aprono: un controllo su una vista mai aperta sarebbe a vuoto.

   - `vaiA(page, id)`: sul desktop il link della barra laterale
     (`nav.modifica-indice`); sul telefono la scheda in basso (Concerti,
     Wishlist, Attività) o «Altro» e poi il foglio «Tutte le sezioni».
   - `menuRiga(page, riga, voce)`: il menu ⋯ di una riga, poi la voce.
   ────────────────────────────────────────────────────────────── */

import type { Locator, Page } from "@playwright/test";
import { idratata } from "./auth.ts";
import { expect } from "./test.ts";

/** Le viste che sul telefono stanno nella barra in basso. */
const SCHEDE = new Set(["concerti", "wishlist", "attivita"]);

export async function vaiA(page: Page, id: string): Promise<void> {
  await idratata(page);
  const indice = page.locator("nav.modifica-indice");
  if (await indice.isVisible()) {
    await indice.locator(`a[href$="#${id}"]`).click();
  } else {
    const schede = page.getByRole("navigation", { name: "Sezioni principali" });
    if (SCHEDE.has(id)) {
      await schede.locator(`a[href$="#${id}"]`).click();
    } else {
      await schede.getByRole("button", { name: "Altro", exact: true }).click();
      await page.getByRole("dialog", { name: "Tutte le sezioni" }).locator(`a[href$="#${id}"]`).click();
    }
  }
  await expect(page.locator(`section#${id}`)).toBeVisible();
}

export async function menuRiga(page: Page, riga: Locator, voce: string): Promise<void> {
  await riga.getByRole("button", { name: /^Altre azioni per/ }).click();
  await page.getByRole("menuitem", { name: voce }).click();
}
