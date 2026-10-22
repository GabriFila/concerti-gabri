/* ──────────────────────────────────────────────────────────────
   Onboarding, passo 3 con l'import (PIANO traguardo 7; il resto di
   /benvenuto è e2e/onboarding.spec.ts, della corsia 3): un CSV caricato
   nello slot dell'upload riempie /<handle> dal vivo in un secondo
   contesto. Tre righe: sotto la soglia, nessuna conferma.
   Serve il login (corsia 3): tag @sessione.
   ────────────────────────────────────────────────────────────── */

import { nuovoProprietario } from "./helpers/auth.ts";
import { csvConcerti, fileCsv, inputFile } from "./helpers/import.ts";
import { expect, test } from "./helpers/test.ts";

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "flusso lungo: basta una volta");
});

test("passo 3: l'import CSV riempie la pagina dal vivo", { tag: "@sessione" }, async ({ page, browser }) => {
  test.setTimeout(180_000);
  const { handle } = await nuovoProprietario(page);
  const visitatore = await (await browser.newContext()).newPage();
  try {
    // la pagina esiste dal passo 1, vuota
    await visitatore.goto(`/${handle}/dati`);
    await expect(visitatore.getByText("Onboarding e2e 1", { exact: true })).toHaveCount(0);

    // passo 2 (partenze) senza partenze, poi il passo 3
    await page.goto("/benvenuto");
    // senza partenze il passo 2 offre "Salta per ora" (corsia 3)
    await page.getByRole("button", { name: "Salta per ora" }).click();
    await expect(page.getByRole("heading", { name: "Collega il tuo agente" })).toBeVisible();
    const passo = page.locator(".ag-import[data-contesto='onboarding']");

    await inputFile(passo).setInputFiles(fileCsv("concerti.csv", csvConcerti("Onboarding e2e", 3)));
    await expect(passo.getByTestId("import-conteggio")).toHaveText("3 righe: 3 concerti");
    // sotto le 10 righe si importa al primo clic
    await passo.getByRole("button", { name: "Importa 3 righe" }).click();
    await expect(passo.getByRole("status")).toHaveText("Importate 3 voci, con 2 persone nuove.");

    for (const n of [1, 2, 3]) await expect(visitatore.getByText(`Onboarding e2e ${n}`, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    // l'onboarding prosegue
    await page.getByRole("button", { name: "Avanti" }).click();
    await expect(page.getByRole("heading", { name: "Regalato da" })).toBeVisible();
  } finally {
    await visitatore.context().close();
  }
});
