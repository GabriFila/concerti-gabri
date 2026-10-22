/* ──────────────────────────────────────────────────────────────
   Il guard di /<handle>/modifica (PIANO §6, traguardo 3): il visitatore
   anonimo e un altro utente tornano a /<handle>; il proprietario vede le
   9 sezioni con le loro ancore, nell'ordine del contratto
   (src/modifica/sezioni.ts). Il guard è solo UX: le scritture le
   controlla requireOwner (convex/isolation.test.ts).
   ────────────────────────────────────────────────────────────── */

import { accediComeGabrifila, nuovoProprietario } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { http } from "./helpers/http.ts";
import { expect, onPreview, test } from "./helpers/test.ts";
import { START_URL } from "./helpers/urls.ts";

const ANCORE = ["concerti", "wishlist", "persone", "partenze", "regali", "stile", "agenti", "attivita", "account"];

test.beforeEach(({}, info) => test.skip(onPreview(info.project.name), "solo in locale (OTP di sviluppo)"));
test.afterAll(() => convexRun("devtools:cleanupE2E"));

test("visitatore anonimo: 307 dall'SSR e niente Modifica", async ({ page }) => {
  const r = await http(`${START_URL}/gabrifila/modifica`);
  expect(r.status()).toBe(307);
  expect(r.headers().location).toMatch(/\/gabrifila$/);
  await page.goto("/gabrifila/modifica");
  await expect(page).toHaveURL(/\/gabrifila$/);
  await expect(page.locator("section#account")).toHaveCount(0);
});

test("un altro utente torna alla pagina, il proprietario vede le 9 ancore", { tag: "@sessione" }, async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const b = await nuovoProprietario(page);

  // B su /gabrifila/modifica: rimandato a /gabrifila
  await page.goto("/gabrifila/modifica");
  await expect(page).toHaveURL(/\/gabrifila$/);
  await expect(page.locator("section#account")).toHaveCount(0);

  // B sulla sua: le 9 sezioni, in ordine, con l'indice
  await page.goto(`/${b.handle}/modifica`);
  await expect(page).toHaveURL(new RegExp(`/${b.handle}/modifica$`));
  await expect(page.locator("section.modifica-sezione")).toHaveCount(9);
  expect(await page.locator("section.modifica-sezione").evaluateAll(s => s.map(x => x.id))).toEqual(ANCORE);
  for (const id of ANCORE) await expect(page.locator(`nav.modifica-indice a[href="#${id}"]`)).toHaveCount(1);
  await expect(page.locator("section#account").getByRole("button", { name: "Esci" })).toBeVisible();
});

test("il proprietario di gabrifila entra in /gabrifila/modifica", { tag: "@sessione" }, async ({ page }) => {
  await page.goto("/");
  await accediComeGabrifila(page);
  await page.goto("/gabrifila/modifica");
  await expect(page).toHaveURL(/\/gabrifila\/modifica$/);
  await expect(page.locator("section.modifica-sezione")).toHaveCount(9);
  // e "Esci" nel footer delle pagine, solo da loggati
  await page.goto("/gabrifila/dati");
  await expect(page.locator(".sitefooter").getByRole("button", { name: "Esci" })).toBeVisible();
});
