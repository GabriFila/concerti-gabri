/* ──────────────────────────────────────────────────────────────
   Le aperture (DECISIONI «Aperture»), sul seed di gabrifila: Temper City e
   Angelica Bove aprono Lewis Capaldi (17/06/2026, Fiera Milano Live).

   - Pagina pubblica: nell'archivio la chip «apertura di Lewis Capaldi»
     sotto l'artista, il costo della riga e in Viaggio il «—» smorzato;
     «Dove torno più spesso» conta la serata una volta (Fiera Milano Live
     non arriva alle 3 visite); il filtro «Includi aperture», attivo di
     default, spento toglie le aperture.
   - /modifica (@sessione): «Apertura di…» propone i concerti della stessa
     data; scelto l'headliner, data, venue e partenza sono in sola
     lettura; la riga mostra «apertura di …». Alla fine gabrifila torna
     com'era.
   ────────────────────────────────────────────────────────────── */

import type { Locator, Page } from "@playwright/test";
import { accediComeGabrifila } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { menuRiga, vaiA } from "./helpers/modifica.ts";
import { expect, test } from "./helpers/test.ts";

const PROVA = "Canarino d'apertura";

/** Toglie il concerto di prova rimasto da una run interrotta. */
function pulisci(): void {
  const page = convexRun<{ entries: { _id: string; artist?: string }[] } | null>("pages:byHandle", { handle: "gabrifila" });
  for (const e of page?.entries ?? []) if (e.artist === PROVA) convexRun("devtools:removeEntry", { handle: "gabrifila", entryId: e._id });
}

test.describe("aperture sulla pagina pubblica", () => {
  test("chip «apertura di …», Viaggio smorzato, una visita per serata e il filtro «Includi aperture»", async ({ page }) => {
    await page.goto("/gabrifila/dati");
    const archivio = page.locator("#sec-archivio");
    await archivio.getByRole("textbox", { name: "Cerca" }).fill("Temper City");
    const riga = archivio.locator("tbody tr").filter({ hasText: "Temper City" }).first();
    await expect(riga.locator("td.artist .capertura")).toHaveText("apertura di Lewis Capaldi");
    // il biglietto resta della riga (0 €); il viaggio è della serata dell'headliner
    await expect(riga.locator("td.cost")).toContainText("0");
    await expect(riga.locator("td.km .caperturamark")).toHaveText("—");
    await expect(riga.locator("td.km .caperturamark")).toHaveAttribute("title", "Incluso nel viaggio della serata di Lewis Capaldi");
    // cercando l'headliner si trovano anche le sue aperture
    await archivio.getByRole("textbox", { name: "Cerca" }).fill("Capaldi");
    await expect(archivio.locator("tbody tr").filter({ hasText: "Temper City" })).toHaveCount(1);
    await expect(archivio.locator("tbody tr").filter({ hasText: "Angelica Bove" }).filter({ has: page.locator(".capertura") })).toHaveCount(1);

    // una serata, una visita: tre righe a Fiera Milano Live non fanno tre visite
    await expect(page.locator("#sec-venue")).not.toContainText("Fiera Milano Live");

    // «Includi aperture»: attivo di default, spento toglie le aperture
    await archivio.getByRole("textbox", { name: "Cerca" }).fill("");
    await page.getByRole("button", { name: /^Filtri/ }).click();
    const filtri = page.getByRole("dialog", { name: "Filtri" });
    const chip = filtri.getByRole("button", { name: "Includi aperture" });
    await expect(chip).toHaveClass(/\bon\b/);
    await chip.click();
    await expect(chip).not.toHaveClass(/\bon\b/);
    await filtri.getByRole("button", { name: "Chiudi" }).click();
    await expect(archivio.locator(".capertura")).toHaveCount(0);
    await expect(archivio).toContainText("Lewis Capaldi");
  });
});

test.describe("aperture in /modifica", { tag: "@sessione" }, () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(({}, info) => {
    test.skip(info.project.name !== "desktop", "una volta sola, in locale");
    pulisci();
  });
  test.afterAll(({}, info) => {
    if (info.project.name === "desktop") pulisci();
  });

  const concerti = (page: Page) => page.locator("section#concerti");
  const elenco = (page: Page) => concerti(page).getByRole("list", { name: "Concerti e festival" });
  const salva = async (dialogo: Locator) => await dialogo.getByRole("button", { name: "Salva", exact: true }).click();
  const avviso = (page: Page, testo: string) => expect(page.getByRole("status").filter({ hasText: testo })).toBeVisible();

  test("«Apertura di…» propone i concerti della stessa data e rende la serata in sola lettura", async ({ page }) => {
    test.setTimeout(180_000);
    await accediComeGabrifila(page);
    await page.goto("/gabrifila/modifica");
    await vaiA(page, "concerti");

    // un'apertura del seed: il collegamento c'è, data e venue sono di Capaldi
    await concerti(page).getByLabel("Cerca nei concerti").fill("Temper City");
    const temper = elenco(page).getByRole("listitem").filter({ hasText: "Temper City" });
    await expect(temper).toContainText("apertura di Lewis Capaldi");
    await temper.getByRole("button", { name: /^Modifica/ }).click();
    const di = page.getByRole("dialog", { name: "Modifica concerto" });
    await expect(di.locator('select[name="aperturaDi"]')).toHaveValue("Lewis Capaldi");
    await expect(di.locator('input[name="date"]')).toHaveAttribute("readonly", "");
    await expect(di.locator('[data-campo="venue"] .mf-dallheadliner')).toHaveText("Fiera Milano Live · Rho");
    await expect(di.locator('select[name="from"]')).toHaveCount(0);
    await di.getByRole("button", { name: "Annulla" }).click();

    // un concerto nuovo nella stessa data: «Apertura di…» propone Capaldi, non le sue aperture
    await concerti(page).getByRole("button", { name: "Aggiungi un concerto" }).click();
    const nuovo = page.getByRole("dialog", { name: "Nuovo concerto" });
    await nuovo.locator('input[name="artist"]').fill(PROVA);
    await expect(nuovo.locator('select[name="aperturaDi"]')).toHaveCount(0);
    await nuovo.locator('input[name="date"]').fill("2026-06-17");
    const campo = nuovo.locator('select[name="aperturaDi"]');
    await expect(campo.locator("option")).toHaveText(["— no, è un concerto a sé", "Lewis Capaldi · Fiera Milano Live"]);
    await campo.selectOption("Lewis Capaldi");
    await expect(nuovo.locator('input[name="date"]')).toHaveAttribute("readonly", "");
    await expect(nuovo.locator('[data-campo="venue"] .mf-dallheadliner')).toHaveText("Fiera Milano Live · Rho");
    await salva(nuovo);
    await avviso(page, "Concerto aggiunto");

    await concerti(page).getByLabel("Cerca nei concerti").fill(PROVA);
    const riga = elenco(page).getByRole("listitem").filter({ hasText: PROVA });
    await expect(riga).toContainText("apertura di Lewis Capaldi");
    await expect(riga).toContainText("Fiera Milano Live · Rho");
    // non è mai «da completare» per il collegamento, né per la partenza (è dell'headliner)
    await expect(riga).toContainText("serata di Lewis Capaldi");

    // via dal menu ⋯, con conferma: gabrifila torna com'era
    await menuRiga(page, riga, "Cancella…");
    await page.getByRole("dialog", { name: "Cancellare il concerto?" }).getByRole("button", { name: "Cancella" }).click();
    await avviso(page, "Cancellato");
    await expect(riga).toHaveCount(0);
  });
});
