/* ──────────────────────────────────────────────────────────────
   Landing → finestra di accesso → OTP → /benvenuto (PIANO traguardo 3).
   Il codice arriva dal sender di sviluppo e si legge con devOtp:latest
   sul deployment Convex LOCALE (e2e/helpers/convex.ts). Più i redirect
   della landing e di /benvenuto senza sessione. Solo in locale.
   ────────────────────────────────────────────────────────────── */

import { idratata, unico } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { http } from "./helpers/http.ts";
import { watchErrors } from "./helpers/idratazione.ts";
import { expect, onPreview, test } from "./helpers/test.ts";
import { START_URL } from "./helpers/urls.ts";

test.beforeEach(({}, info) => test.skip(onPreview(info.project.name), "i codici sulla preview li legge l'orchestratore"));

test("/?chat=<id> porta a /gabrifila?chat=<id> con un 308", async () => {
  const r = await http(`${START_URL}/?chat=abc123&x=1`);
  expect(r.status()).toBe(308);
  expect(r.headers().location).toMatch(/\/gabrifila\?chat=abc123&x=1$/);
});

test("senza sessione /benvenuto porta ad /accedi con next", async ({ page }) => {
  await page.goto("/benvenuto");
  await expect(page).toHaveURL(/\/accedi\?next=%2Fbenvenuto$/);
  await expect(page.getByRole("heading", { name: "Entra" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("landing → finestra → codice → /benvenuto, poi Esci", { tag: "@sessione" }, async ({ page }) => {
  const errori = watchErrors(page);
  const email = `e2e-${unico()}@example.test`;
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute("data-auth", "1");
  await idratata(page);
  await page.getByRole("link", { name: "Entra / Crea il tuo sito" }).click();
  const finestra = page.getByRole("dialog", { name: "Entra" });
  await expect(finestra).toBeVisible();
  // con Google attivo l'email è una seconda scelta; nei deployment locali (senza Google) il campo c'è subito
  const conEmail = finestra.getByRole("button", { name: "Entra con email" });
  if (await conEmail.isVisible()) await conEmail.click();
  await finestra.getByLabel("Email").fill(email);
  await finestra.getByRole("button", { name: "Mandami il codice" }).click();
  await expect(finestra.getByLabel("Codice")).toBeVisible();

  // un codice sbagliato dà un errore leggibile e lascia riprovare
  await finestra.getByLabel("Codice").fill("000000");
  await finestra.getByRole("button", { name: "Entra", exact: true }).click();
  await expect(finestra.getByRole("alert")).toContainText(/Codice sbagliato|scaduto/);

  const otp = convexRun<{ otp: string } | null>("devOtp:latest", { email })?.otp;
  expect(otp).toMatch(/^\d{6}$/);
  await finestra.getByLabel("Codice").fill(otp!);
  await finestra.getByRole("button", { name: "Entra", exact: true }).click();

  // ricarica completa con la sessione: l'SSR la vede (data-auth) e porta al passo 1
  await expect(page).toHaveURL(/\/benvenuto$/);
  await expect(page.locator("html")).toHaveAttribute("data-auth", "1");
  await expect(page.getByRole("heading", { name: "Ti diamo il benvenuto" })).toBeVisible();
  await expect(page.getByText("Passo 1 di 5")).toBeVisible();

  // l'HTML di chi è entrato non porta né il JWT di Convex né l'email (lib/auth-sessione.ts)
  const html = await (await page.request.get("/benvenuto")).text();
  expect(html).toContain('data-auth="1"');
  expect(html).not.toMatch(/eyJ[\w-]+\.eyJ[\w-]+\./);
  expect(html).not.toContain(email);

  // la landing manda a /benvenuto chi ha il profilo in onboarding
  await page.goto("/");
  await expect(page).toHaveURL(/\/benvenuto$/);

  await idratata(page);
  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page).toHaveURL(new RegExp(`${START_URL}/$`));
  await expect(page.locator("html")).not.toHaveAttribute("data-auth", "1");
  await expect(page.getByRole("link", { name: "Entra / Crea il tuo sito" })).toBeVisible();
  expect(errori.hydration()).toEqual([]);
});
