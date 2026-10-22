/* ──────────────────────────────────────────────────────────────
   #partenze (traguardo 5): l'indirizzo di una partenza resta privato, i
   km li calcola il server e si vedono sulla pagina pubblica.

   - Senza sessione: il canarino entra con devtools sul profilo di prova
     `e2e-partenze` (mai su gabrifila); un concerto partito da lì ha il km
     calcolato, che il visitatore vede in archivio, mentre l'indirizzo non
     c'è né nella pagina né nei frame WebSocket.
   - @sessione (login della corsia 3): il proprietario crea la partenza,
     sceglie il canarino tra i candidati dello stub in AddressPicker, vede
     "indirizzo impostato" e il testo (solo lui, solo nel browser);
     aggiunge un concerto da lì e il km compare dal vivo al visitatore; la
     correzione avvisa del nuovo scarto e poi è bloccata per un giorno.
   ────────────────────────────────────────────────────────────── */

import type { Page } from "@playwright/test";
import { nuovoProprietario } from "./helpers/auth.ts";
import { CANARINO } from "./helpers/canarino.ts";
import { convexRun } from "./helpers/convex.ts";
import { fughe } from "./helpers/fughe.ts";
import { stubNominatim } from "./helpers/nominatim.ts";
import { expect, test } from "./helpers/test.ts";

const PROVA = "e2e-partenze";
const PARTENZA = "Casa canarino";
const ARTISTA = "Canarino in trasferta";

test.describe.configure({ mode: "serial" });

const soloDesktop = (progetto: string) => test.skip(progetto !== "desktop", "una volta sola, in locale: non dipende dal viewport");

/** I frame WebSocket (Convex) ricevuti dalla pagina, da adesso. */
function frameWebSocket(page: Page): string[] {
  const frames: string[] = [];
  page.on("websocket", ws => ws.on("framereceived", f => frames.push(typeof f.payload === "string" ? f.payload : f.payload.toString("utf8"))));
  return frames;
}

/** La riga dell'archivio di "I dati" con l'artista. */
const rigaArchivio = (page: Page, artista: string) => page.locator("#sec-archivio tr").filter({ hasText: artista }).first();

test.describe("senza sessione", () => {
  let entryId: string | undefined;

  test.beforeAll(({}, info) => {
    soloDesktop(info.project.name);
    convexRun("devtools:creaProfiloDiProva", { handle: PROVA, authUserId: "e2e-partenze-utente", displayName: "Partenze" });
    convexRun("account:creaPartenzaPerTest", { handle: PROVA, name: PARTENZA });
    convexRun("devtools:setDepartureForTest", { handle: PROVA, departure: PARTENZA, address: CANARINO.displayName, lng: CANARINO.lng, lat: CANARINO.lat });
    entryId = convexRun<string>("devtools:addEntry", {
      handle: PROVA,
      entry: { kind: "concert", date: "2025-05-10", artist: ARTISTA, venue: "Fabrique", city: "Milano", with: [], from: PARTENZA },
    });
  });

  test.afterAll(() => {
    if (entryId) convexRun("devtools:removeEntry", { handle: PROVA, entryId });
  });

  test("il km è calcolato e visibile; il visitatore non vede mai l'indirizzo", async ({ page }) => {
    const frames = frameWebSocket(page);
    await page.goto(`/${PROVA}/dati`);
    const riga = rigaArchivio(page, ARTISTA);
    // Fabrique da Genova (dove sta il canarino): qualche centinaio di km, col jitter
    await expect(riga.locator("td.km")).toHaveText(/~\d{3} km da Casa canarino/);
    expect(fughe(await page.content())).toEqual([]);
    expect(fughe(frames.join("\n"))).toEqual([]);
  });
});

test.describe("il proprietario", { tag: "@sessione" }, () => {
  let spegniStub: () => void = () => {};
  test.beforeAll(async ({}, info) => {
    soloDesktop(info.project.name);
    spegniStub = await stubNominatim();
  });
  test.afterAll(() => spegniStub());

  test("imposta l'indirizzo dal canarino dello stub; km dal vivo al visitatore; correzione una al giorno", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const { handle } = await nuovoProprietario(page, { nome: "Partenze" });
    await page.goto(`/${handle}/modifica#partenze`);
    const sezione = page.locator("section#partenze");

    await sezione.getByLabel("Nuova partenza").fill(PARTENZA);
    await sezione.getByRole("button", { name: "Aggiungi" }).click();
    // la partenza nuova apre subito l'indirizzo (AddressPicker della corsia 3)
    const picker = page.getByRole("dialog", { name: `Imposta l'indirizzo di ${PARTENZA}` });
    await picker.getByRole("textbox").first().fill(CANARINO.indirizzo);
    await picker.getByRole("button", { name: /cerca/i }).click();
    await picker.getByText(CANARINO.displayName).click();
    await picker.getByRole("button", { name: /conferma|usa questo/i }).click();
    await expect(page.getByRole("status").filter({ hasText: "Indirizzo impostato" })).toBeVisible();
    const riga = sezione.getByRole("listitem").filter({ hasText: PARTENZA });
    await expect(riga).toContainText("indirizzo impostato");
    await expect(riga).toContainText(CANARINO.displayName);

    // il visitatore, in un altro contesto, guarda "I dati" senza ricaricare
    const visitatore = await (await browser.newContext()).newPage();
    const frames = frameWebSocket(visitatore);
    await visitatore.goto(`/${handle}/dati`);

    // un concerto da quella partenza: km calcolato subito (l'indirizzo c'è)
    await page.locator("section#concerti").getByRole("button", { name: "Aggiungi un concerto" }).click();
    const modale = page.getByRole("dialog", { name: "Nuovo concerto" });
    await modale.locator('input[name="artist"]').fill(ARTISTA);
    await modale.locator('input[name="date"]').fill("2025-05-10");
    await modale.getByLabel("Cerca una venue").fill("Fabrique");
    await modale.getByRole("list", { name: "Venue del catalogo" }).getByRole("button", { name: /^Fabrique/ }).first().click();
    await modale.locator('select[name="from"]').selectOption(PARTENZA);
    await modale.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Concerto aggiunto" })).toBeVisible();
    await expect(page.locator("section#concerti").getByRole("list", { name: "Concerti e festival" }).getByRole("listitem").filter({ hasText: ARTISTA })).toContainText(/da Casa canarino · \d+ km/);

    await expect(rigaArchivio(visitatore, ARTISTA).locator("td.km")).toHaveText(/~\d{3} km da Casa canarino/, { timeout: 20_000 });
    expect(await visitatore.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);
    expect(fughe(await visitatore.content())).toEqual([]);
    expect(fughe(frames.join("\n"))).toEqual([]);

    // correzione: l'avviso del nuovo scarto; una al giorno (la seconda è bloccata)
    await riga.getByRole("button", { name: `Correggi l'indirizzo di ${PARTENZA}` }).click();
    const correzione = page.getByRole("dialog", { name: `Correggi l'indirizzo di ${PARTENZA}` });
    await expect(correzione).toContainText("nuovo scarto casuale");
    await correzione.getByRole("textbox").first().fill("Via di prova 1, Milano");
    await correzione.getByRole("button", { name: /cerca/i }).click();
    await correzione.getByText("Indirizzo di prova 1").click();
    await correzione.getByRole("button", { name: /conferma|usa questo/i }).click();
    await expect(page.getByRole("status").filter({ hasText: "Indirizzo corretto" })).toBeVisible();
    await expect(riga.getByRole("button", { name: `Correggi l'indirizzo di ${PARTENZA}` })).toBeDisabled();
    await expect(riga).toContainText("puoi correggerlo di nuovo dal");

    // cancellare una partenza usata è bloccato, con l'elenco dei concerti
    await riga.getByRole("button", { name: `Cancella ${PARTENZA}` }).click();
    const blocco = page.getByRole("dialog", { name: `Cancellare ${PARTENZA}?` });
    await expect(blocco).toContainText(ARTISTA);
    await blocco.getByRole("button", { name: "Ho capito" }).click();
  });
});
