/* ──────────────────────────────────────────────────────────────
   Import CSV da #agenti (PIANO traguardo 7): un file con un errore non
   importa niente e dice la riga; 12 righe valide → anteprima → conferma
   (sopra le 10) → la pagina pubblica si aggiorna dal vivo in un secondo
   contesto → "Annulla l'import" toglie tutto il lotto, sempre dal vivo.
   Serve il login (corsia 3): tag @sessione.
   ────────────────────────────────────────────────────────────── */

import { nuovoProprietario } from "./helpers/auth.ts";
import { CELLA_CANARINO, csvConErrore, csvConcerti, fileCsv, inputFile } from "./helpers/import.ts";
import { expect, test } from "./helpers/test.ts";

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "flusso lungo: basta una volta");
});

test("upload in #agenti: anteprima, conferma sopra le 10 righe, pagina aggiornata, Annulla del lotto", { tag: "@sessione" }, async ({ page, browser }) => {
  test.setTimeout(180_000);
  const { handle } = await nuovoProprietario(page);
  const visitatore = await (await browser.newContext()).newPage();
  try {
    await visitatore.goto(`/${handle}/dati`);
    await page.goto(`/${handle}/modifica#agenti`);
    const sezione = page.locator("#agenti");

    // un errore: nessuna riga importata, la riga e la colonna sì, il valore no
    await inputFile(sezione).setInputFiles(fileCsv("sbagliato.csv", csvConErrore("Prova")));
    const errori = sezione.getByRole("alert");
    await expect(errori).toContainText("nessuna riga verrà importata");
    await expect(errori).toContainText("Riga 3 · voto");
    await expect(errori).toContainText("Riga 4 · voto");
    // né i valori sbagliati (9, il canarino) né le altre celle delle righe
    await expect(sezione).not.toContainText(CELLA_CANARINO);
    await expect(errori).not.toContainText(/\b9\b/);
    await expect(errori).not.toContainText("Prova ko");
    await expect(sezione.getByRole("button", { name: /^Importa \d/ })).toHaveCount(0);

    // 12 righe valide: 10 concerti e un festival di 2
    await inputFile(sezione).setInputFiles(fileCsv("concerti.csv", csvConcerti("Import e2e", 10, true)));
    await expect(sezione.getByTestId("import-conteggio")).toHaveText("12 righe: 10 concerti e 1 festival (12 concerti in tutto)");
    await expect(sezione.getByText("Persone nuove (2): Lu, Cami.")).toBeVisible();
    await sezione.getByRole("button", { name: "Importa 12 righe" }).click();
    // sopra le 10 righe chiede conferma
    await expect(sezione.getByRole("group", { name: "Conferma l'import" })).toContainText("più di 10");
    await sezione.getByRole("button", { name: "Sì, importa 12 righe" }).click();
    await expect(sezione.getByRole("status")).toHaveText("Importate 11 voci, con 2 persone nuove.");

    // il visitatore vede i concerti senza ricaricare
    await expect(visitatore.getByText("Import e2e 1", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(visitatore.getByText("Import e2e festival B").first()).toBeVisible();

    // Annulla: tutto il lotto (anche le persone nate con l'import)
    await sezione.getByRole("button", { name: "Annulla l'import" }).click();
    await expect(sezione.getByRole("status")).toContainText("Import annullato");
    await expect(visitatore.getByText("Import e2e 1", { exact: true })).toHaveCount(0, { timeout: 20_000 });
    await expect(visitatore.getByText("Import e2e festival B")).toHaveCount(0);
  } finally {
    await visitatore.context().close();
  }
});
