/* ──────────────────────────────────────────────────────────────
   #concerti (traguardo 5), con due contesti: il proprietario di gabrifila
   aggiunge, modifica e annulla dalla dashboard; un visitatore anonimo su
   /gabrifila e /gabrifila/dati vede ogni passo senza ricaricare (la
   pagina resta sottoscritta a Convex). Poi un festival (lineup, cancellato
   con conferma e ripristinato da «Attività») e il riquadro "da completare".

   Tutte @sessione: il login arriva con la corsia 3. Solo desktop; alla
   fine gabrifila torna com'era (la parità con main ne ha bisogno).
   ────────────────────────────────────────────────────────────── */

import type { Locator, Page } from "@playwright/test";
import { accediComeGabrifila } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { menuRiga, vaiA } from "./helpers/modifica.ts";
import { expect, test } from "./helpers/test.ts";

const ARTISTA = "Canarino in dashboard";
const RINVIATO = "Canarino rinviato";
const FESTIVAL = "Festival dei canarini";
const PASSATO = "Canarino da completare";
const PROVE = new Set([ARTISTA, RINVIATO, FESTIVAL, PASSATO]);

/** Toglie i concerti di prova rimasti da una run interrotta. */
function pulisci(): void {
  const page = convexRun<{ entries: { _id: string; artist?: string; name?: string }[] } | null>("pages:byHandle", { handle: "gabrifila" });
  for (const e of page?.entries ?? []) {
    if (PROVE.has(e.artist ?? "") || PROVE.has(e.name ?? "")) convexRun("devtools:removeEntry", { handle: "gabrifila", entryId: e._id });
  }
}

test.describe("dashboard dei concerti", { tag: "@sessione" }, () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(({}, info) => {
    test.skip(info.project.name !== "desktop", "una volta sola, in locale");
    pulisci();
  });
  test.afterAll(({}, info) => {
    if (info.project.name === "desktop") pulisci();
  });

  const concerti = (page: Page) => page.locator("section#concerti");
  /** L'elenco dei concerti (non il riquadro "da completare", che sta nella stessa sezione). */
  const elenco = (page: Page) => concerti(page).getByRole("list", { name: "Concerti e festival" });
  const attivita = (page: Page) => page.locator("section#attivita");
  const salva = async (dialogo: Locator) => await dialogo.getByRole("button", { name: "Salva", exact: true }).click();
  const avviso = (page: Page, testo: string) => expect(page.getByRole("status").filter({ hasText: testo })).toBeVisible();

  /** La venue dal catalogo, scritta e scelta. */
  async function scegliVenue(dialogo: Locator, nome: string) {
    await dialogo.getByLabel("Cerca una venue").fill(nome);
    await dialogo.getByRole("list", { name: "Venue del catalogo" }).getByRole("button", { name: new RegExp(`^${nome}`) }).first().click();
  }

  test("aggiunge, modifica e annulla: i visitatori vedono tutto dal vivo", async ({ page, browser }) => {
    test.setTimeout(240_000);
    await accediComeGabrifila(page);

    // i visitatori, senza sessione, prima di ogni scrittura
    const ospite = await browser.newContext();
    const dati = await ospite.newPage();
    const palco = await ospite.newPage();
    await dati.goto("/gabrifila/dati");
    await palco.goto("/gabrifila");
    const card = dati.locator(".kpi").filter({ hasText: "In programma" });
    await expect(card.locator(".num")).toHaveText("11");
    await expect(palco.getByText("11 concerti programmati")).toBeVisible();

    // aggiunge (in programma: fra "oggi" degli e2e, 21/10/2026, e il prossimo vero)
    await page.goto("/gabrifila/modifica#concerti");
    await concerti(page).getByRole("button", { name: "Aggiungi un concerto" }).click();
    const nuovo = page.getByRole("dialog", { name: "Nuovo concerto" });
    await nuovo.locator('input[name="artist"]').fill(ARTISTA);
    await nuovo.locator('input[name="date"]').fill("2026-10-25");
    await scegliVenue(nuovo, "Fabrique");
    // "Cami <3" è già tra le persone di gabrifila: il bottone è «Aggiungi», non
    // «Nuova persona», quindi il test non crea persone (e non ne lascia)
    await nuovo.getByLabel("Aggiungi un compagno").fill("Cami <3");
    await nuovo.getByRole("button", { name: "Aggiungi", exact: true }).click();
    await expect(nuovo.getByRole("list", { name: "Compagni" })).toContainText("Cami <3");
    await salva(nuovo);
    await avviso(page, "Concerto aggiunto");
    await expect(card.locator(".num")).toHaveText("12", { timeout: 20_000 });
    await expect(card.locator(".hint")).toHaveText("prossimo 25/10/2026");
    await expect(dati.locator("#sec-archivio")).toContainText(ARTISTA);
    await expect(palco.getByText("12 concerti programmati")).toBeVisible();
    await expect(palco.getByText(ARTISTA)).toBeVisible();

    // modifica: nome e data
    await concerti(page).getByRole("button", { name: `Modifica ${ARTISTA} del 25/10/2026` }).click();
    const modifica = page.getByRole("dialog", { name: "Modifica concerto" });
    await modifica.locator('input[name="artist"]').fill(RINVIATO);
    await modifica.locator('input[name="date"]').fill("2026-10-28");
    await salva(modifica);
    await avviso(page, "Concerto modificato");
    await expect(card.locator(".hint")).toHaveText("prossimo 28/10/2026", { timeout: 20_000 });
    await expect(dati.locator("#sec-archivio")).toContainText(RINVIATO);
    await expect(palco.getByText(RINVIATO)).toBeVisible();

    // annulla la modifica, poi l'aggiunta, da «Attività» (l'autore è la dashboard)
    await vaiA(page, "attivita");
    const nomeAnnulla = { name: `Annulla: modificato: ${ARTISTA} (25/10/2026)`, exact: true };
    const annullaModifica = attivita(page).getByRole("button", nomeAnnulla);
    await expect(attivita(page).getByRole("listitem").filter({ has: page.getByRole("button", nomeAnnulla) })).toContainText("Dashboard");
    await annullaModifica.click();
    await expect(card.locator(".hint")).toHaveText("prossimo 25/10/2026", { timeout: 20_000 });
    await expect(dati.locator("#sec-archivio")).toContainText(ARTISTA);
    await expect(annullaModifica).toHaveCount(0);
    await expect(attivita(page).getByRole("listitem").filter({ hasText: "annullata" }).first()).toContainText(`modificato: ${ARTISTA}`);
    await attivita(page).getByRole("button", { name: `Annulla: aggiunto: ${ARTISTA} (25/10/2026)` }).click();
    await expect(card.locator(".num")).toHaveText("11", { timeout: 20_000 });
    await expect(card.locator(".hint")).toHaveText("prossimo 18/11/2026");
    await expect(palco.getByText("11 concerti programmati")).toBeVisible();
    await vaiA(page, "concerti");
    await expect(elenco(page)).toBeVisible();
    await expect(elenco(page).getByRole("button", { name: `Modifica ${ARTISTA} del 25/10/2026` })).toHaveCount(0);

    // i visitatori non hanno mai ricaricato
    for (const p of [dati, palco]) expect(await p.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);
    await ospite.close();
  });

  test("festival: lineup di due concerti, cancellato con conferma e ripristinato da «Attività»", async ({ page }) => {
    test.setTimeout(180_000);
    await accediComeGabrifila(page);
    await page.goto("/gabrifila/modifica#concerti");
    await concerti(page).getByRole("button", { name: "Aggiungi un festival" }).click();
    const f = page.getByRole("dialog", { name: "Nuovo festival" });
    // senza niente: gli errori dello schema, in italiano, e nessun salvataggio
    await salva(f);
    await expect(f.getByText("Obbligatorio").first()).toBeVisible();
    await f.locator('input[name="name"]').fill(FESTIVAL);
    await f.locator('input[name="date"]').fill("12–13/09/2025");
    await scegliVenue(f, "Fabrique");
    await f.locator('input[name="concerts[0].artist"]').fill("Primo set");
    await f.locator('input[name="concerts[1].artist"]').fill("Secondo set");
    await f.locator('input[name="concerts[1].date"]').fill("2025-09-13");
    // voto, posizione e canzoni note sono pastiglie: radio veri con i nomi dei campi
    await f.locator('input[name="concerts[0].voto"][value="4"]').check();
    await salva(f);
    await avviso(page, "Festival aggiunto");
    // l'elenco mostra i più recenti: la ricerca lo trova
    await concerti(page).getByLabel("Cerca nei concerti").fill(FESTIVAL);
    const riga = elenco(page).getByRole("listitem").filter({ hasText: FESTIVAL });
    await expect(riga).toContainText("festival · 2 concerti");

    // cancella dal menu ⋯ della riga: chiede conferma
    await menuRiga(page, riga, "Cancella…");
    const conferma = page.getByRole("dialog", { name: "Cancellare il festival?" });
    await conferma.getByRole("button", { name: "Cancella" }).click();
    await avviso(page, "Cancellato");
    await expect(riga).toHaveCount(0);

    // Annulla lo rimette, con la sua lineup
    await vaiA(page, "attivita");
    await attivita(page).getByRole("button", { name: `Annulla: cancellato: ${FESTIVAL} (12–13/09/2025)` }).click();
    await vaiA(page, "concerti");
    await expect(riga).toContainText("festival · 2 concerti", { timeout: 20_000 });
    await riga.getByRole("button", { name: /^Modifica/ }).click();
    const di = page.getByRole("dialog", { name: "Modifica festival" });
    await expect(di.locator('input[name="concerts[1].artist"]')).toHaveValue("Secondo set");
    await expect(di.locator('input[name="concerts[0].voto"][value="4"]')).toBeChecked();
    await di.getByRole("button", { name: "Annulla" }).click();
  });

  test("da completare: un concerto passato senza voto si completa dal riquadro", async ({ page }) => {
    test.setTimeout(180_000);
    await accediComeGabrifila(page);
    await page.goto("/gabrifila/modifica#concerti");
    await concerti(page).getByRole("button", { name: "Aggiungi un concerto" }).click();
    const nuovo = page.getByRole("dialog", { name: "Nuovo concerto" });
    await nuovo.locator('input[name="artist"]').fill(PASSATO);
    await nuovo.locator('input[name="date"]').fill("2026-10-01");
    await scegliVenue(nuovo, "Fabrique");
    await salva(nuovo);
    await avviso(page, "Concerto aggiunto");

    const box = page.getByRole("region", { name: "Da completare" });
    const voce = box.getByRole("listitem").filter({ hasText: PASSATO });
    await expect(voce).toContainText("manca: voto, posizione, canzoni note, partenza");
    await voce.getByRole("button", { name: /^Completa/ }).click();
    const m = page.getByRole("dialog", { name: "Modifica concerto" });
    await m.locator('input[name="voto"][value="5"]').check();
    await m.locator('input[name="vicinanza"][value="6"]').check();
    await m.locator('input[name="canzoniNote"][value="na"]').check();
    await expect(m.locator('input[name="vicinanza"][value="6"]')).toBeChecked();
    await m.locator('select[name="from"]').selectOption("Milano");
    await salva(m);
    await avviso(page, "Concerto modificato");
    await expect(voce).toHaveCount(0);

    // il visitatore non vede il riquadro (solo il proprietario, §1.36)
    const ospite = await (await page.context().browser()!.newContext()).newPage();
    await ospite.goto("/gabrifila/modifica");
    await expect(ospite).toHaveURL(/\/gabrifila\/?$/);
  });
});
