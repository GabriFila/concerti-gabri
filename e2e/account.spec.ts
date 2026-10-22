/* ──────────────────────────────────────────────────────────────
   #account (traguardo 5; PIANO §1.31, §5.9): esporta ed elimina.

   - Esporta: il JSON scaricato ha i concerti nel formato di import, le
     persone, le partenze; mai coordinate né id d'utente.
   - Elimina con una sessione NON recente: account:invecchiaSessionePerTest
     fa sembrare vecchia la sessione (la riga `session` di Better Auth, che
     riempie la corsia 3); dopo un reload l'eliminazione chiede di rientrare
     e porta a /accedi con il ritorno a #account?elimina=1.
   - Elimina con una sessione recente: si rientra con l'OTP, il ritorno
     riapre la conferma, si scrive l'handle e la pagina sparisce (404).

   Tutte @sessione (login della corsia 3), su un proprietario nuovo.
   ────────────────────────────────────────────────────────────── */

import { readFileSync } from "node:fs";
import { fileEsportato } from "../shared/schema/dashboard.ts";
import { accediConOtp, nuovoProprietario } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { http } from "./helpers/http.ts";
import { expect, test } from "./helpers/test.ts";

test.describe("account", { tag: "@sessione" }, () => {
  test.beforeAll(({}, info) => test.skip(info.project.name !== "desktop", "una volta sola, in locale"));

  test("esporta i dati nel formato di import, senza coordinate né id d'utente", async ({ page }) => {
    test.setTimeout(180_000);
    const { handle } = await nuovoProprietario(page, { nome: "Esporta" });
    await page.goto(`/${handle}/modifica#persone`);
    await page.locator("section#persone").getByLabel("Nuova persona").fill("Lu");
    await page.locator("section#persone").getByRole("button", { name: "Aggiungi" }).click();
    await expect(page.locator("section#persone").getByRole("list", { name: "Persone" })).toContainText("Lu");
    await page.locator("section#partenze").getByLabel("Nuova partenza").fill("Casa");
    await page.locator("section#partenze").getByRole("button", { name: "Aggiungi" }).click();
    await page.getByRole("dialog", { name: "Imposta l'indirizzo di Casa" }).getByRole("button", { name: "Chiudi" }).click();

    const download = page.waitForEvent("download");
    await page.locator("section#account").getByRole("button", { name: "Scarica i miei dati" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(new RegExp(`^concerti-${handle}-\\d{4}-\\d{2}-\\d{2}\\.json$`));
    const testo = readFileSync((await file.path())!, "utf8");
    const dati = JSON.parse(testo);
    expect(dati).toMatchObject({ formato: "concerti-gabri/export", profilo: { handle }, persone: ["Lu"], partenze: [{ name: "Casa" }], concerti: [] });
    // il file intero passa dallo schema dell'import (i concerti sono import JSON)
    expect(fileEsportato.safeParse(dati).success).toBe(true);
    for (const vietato of ["authUserId", "writeKeyHash", "ipHmac", '"lat"', '"lng"']) expect(testo, vietato).not.toContain(vietato);
  });

  test("elimina: con una sessione vecchia chiede di rientrare; con una recente cancella tutto", async ({ page, baseURL }) => {
    test.setTimeout(240_000);
    const { handle, email } = await nuovoProprietario(page, { nome: "Elimina" });

    // sessione vecchia: dopo il reload il JWT porta la data vecchia
    expect(convexRun<boolean>("account:invecchiaSessionePerTest", { email }), "la corsia 3 deve riempire invecchiaSessioniAuth").toBe(true);
    await page.goto(`/${handle}/modifica#account`);
    await page.locator("section#account").getByRole("button", { name: "Elimina l'account…" }).click();
    const conferma = page.getByRole("dialog", { name: "Eliminare l'account?" });
    // l'handle sbagliato non passa
    await conferma.getByLabel("Conferma").fill(`${handle}x`);
    await conferma.getByRole("button", { name: "Elimina per sempre" }).click();
    await expect(conferma.getByText("Scrivi esattamente l'handle")).toBeVisible();
    await conferma.getByLabel("Conferma").fill(handle);
    await conferma.getByRole("button", { name: "Elimina per sempre" }).click();
    await expect(conferma.getByRole("alert")).toContainText("Per sicurezza rientra");
    const rientra = conferma.getByRole("link", { name: "Entra di nuovo" });
    const href = (await rientra.getAttribute("href")) ?? "";
    expect(decodeURIComponent(href)).toBe(`/accedi?next=/${handle}/modifica#account?elimina=1`);
    // la pagina c'è ancora
    expect((await http(new URL(`/${handle}`, baseURL).href)).status()).toBe(200);

    // si rientra (OTP di sviluppo): il ritorno riapre la conferma
    await accediConOtp(page, email);
    await page.goto(`/${handle}/modifica#account?elimina=1`);
    const di = page.getByRole("dialog", { name: "Eliminare l'account?" });
    await expect(di).toBeVisible();
    await di.getByLabel("Conferma").fill(handle);
    await di.getByRole("button", { name: "Elimina per sempre" }).click();
    await expect(page).toHaveURL(new URL("/", baseURL).href);
    await expect.poll(async () => (await http(new URL(`/${handle}`, baseURL).href)).status()).toBe(404);
    // `convex run` non stampa niente per null
    expect(convexRun("pages:byHandle", { handle }) ?? null).toBeNull();
  });
});
