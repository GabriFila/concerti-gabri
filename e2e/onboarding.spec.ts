/* ──────────────────────────────────────────────────────────────
   /benvenuto dall'inizio alla fine (PIANO traguardo 3, Accettazione):
   - dopo il passo 1 la pagina /<handle> esiste, vuota e senza errori;
   - passi 2–5 con lo stub di Nominatim (AddressPicker vero);
   - ripresa dopo un reload, dal passo salvato sul server;
   - a onboarding finito, /benvenuto porta a /<handle>/modifica.
   L'import CSV del passo 3 è della corsia 7 (e2e/onboarding-import.spec.ts).
   ────────────────────────────────────────────────────────────── */

import { accediConOtp, idratata, unico } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { watchErrors } from "./helpers/idratazione.ts";
import { stubNominatim } from "./helpers/nominatim.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

let spegniStub: () => void = () => {};

test.beforeAll(async ({}, info) => {
  if (!onPreview(info.project.name)) spegniStub = await stubNominatim();
});
test.afterAll(() => {
  spegniStub();
  convexRun("devtools:cleanupE2E");
});

test("i 5 passi, la pagina subito pubblica, la ripresa e il redirect finale", { tag: "@sessione" }, async ({ page, browser }, info) => {
  test.skip(onPreview(info.project.name), "solo in locale (OTP e stub)");
  test.setTimeout(180_000);
  const id = unico();
  const handle = `e2e-${id}`;
  const errori = watchErrors(page);

  await page.goto("/");
  await accediConOtp(page, `e2e-${id}@example.test`);
  await page.goto("/benvenuto");
  await expect(page.getByText("Passo 1 di 5")).toBeVisible();
  await idratata(page);

  // ── passo 1: handle (controllo dal vivo), forma, nome
  const handleInput = page.getByLabel("Indirizzo della pagina");
  await handleInput.fill("dati");
  await expect(page.getByText("Questo indirizzo è riservato al sito")).toBeVisible();
  await handleInput.fill("gabrifila");
  await expect(page.getByText(/indirizzo è (riservato|già preso)/)).toBeVisible();
  await handleInput.fill(handle);
  await page.getByLabel(/Al femminile/).check();
  await page.getByLabel("Nome da mostrare").fill("Prova");
  await page.getByRole("button", { name: "Crea la pagina" }).click();
  await expect(page.getByRole("heading", { name: "Da dove parti" })).toBeVisible();
  await expect(page.getByText("Passo 2 di 5")).toBeVisible();

  // la pagina esiste già (vuota) per chiunque, senza errori
  const visitatore = await browser.newContext();
  try {
    const p2 = await visitatore.newPage();
    const errori2 = watchErrors(p2);
    const r = await p2.goto(`/${handle}`);
    expect(r?.status()).toBe(200);
    await expect(p2.getByText("Qui non suona nessuno")).toHaveCount(0);
    await expect.poll(() => p2.evaluate(() => document.readyState)).toBe("complete");
    // nessuna eccezione e nessun errore di idratazione (la mappa vuota può avvisare in console)
    expect(errori2.all.filter(e => e.startsWith("pageerror"))).toEqual([]);
    expect(errori2.hydration()).toEqual([]);
  } finally {
    await visitatore.close();
  }

  // ── passo 2: una partenza con l'indirizzo (stub: candidati deterministici)
  await page.getByLabel("Nome della partenza").fill("Casa");
  await page.getByRole("button", { name: "Aggiungi" }).click();
  await page.getByLabel("Indirizzo (lo vedi solo tu)").fill("Via Roma 1, Milano");
  await page.getByRole("button", { name: "Cerca" }).click();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Conferma l'indirizzo" }).click();
  await expect(page.getByText("indirizzo impostato")).toBeVisible();
  await page.getByRole("button", { name: "Avanti" }).click();

  // ── passo 3: l'agente, col prompt e i modelli; un reload riprende da qui
  await expect(page.getByRole("heading", { name: "Collega il tuo agente" })).toBeVisible();
  const prompt = page.getByRole("textbox", { name: "Prompt per l'agente" });
  await expect(prompt).toHaveValue(new RegExp(`/${handle}`));
  await expect(prompt).toHaveValue(/"Casa"/);
  await expect(prompt).toHaveValue(/Marco Rossi/);
  await expect(page.getByRole("link", { name: "Scarica il modello CSV" })).toHaveAttribute("href", /^data:text\/csv/);
  // la regola dei soprannomi accanto ai modelli (§1.42)
  await expect(page.locator(".acc-modelli > .acc-suggerimento")).toContainText("'Marco Rossi' → 'Marco R.'");
  await page.reload();
  await expect(page.getByText("Passo 3 di 5")).toBeVisible();
  await idratata(page);
  await page.getByRole("button", { name: "Avanti" }).click();

  // ── passo 4: un "regalato da"
  await expect(page.getByRole("heading", { name: "Regalato da" })).toBeVisible();
  await page.getByLabel("Nome", { exact: true }).fill("Marco R.");
  await page.getByLabel("Link (facoltativo)").fill("https://example.com");
  await page.getByRole("button", { name: "Aggiungi" }).click();
  await expect(page.locator(".acc-elenco")).toContainText("Marco R.");
  await page.getByRole("button", { name: "Fine" }).click();

  // ── passo 5: pronta
  await expect(page.getByRole("heading", { name: "La tua pagina è pronta" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Vai alla tua pagina" })).toHaveAttribute("href", `/${handle}`);

  // a onboarding finito /benvenuto porta a Modifica, sulla vista Concerti
  await page.goto("/benvenuto");
  await expect(page).toHaveURL(new RegExp(`/${handle}/modifica$`));
  await expect(page.locator("section#concerti")).toBeVisible();
  expect(errori.hydration()).toEqual([]);
});
