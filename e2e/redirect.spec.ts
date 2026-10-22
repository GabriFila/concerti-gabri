/* ──────────────────────────────────────────────────────────────
   I vecchi link (SPEC §3, PIANO traguardo 4, §6):
   - `/dati` del sito di prima → 308 `/gabrifila/dati`, con la query
     string; nel browser il frammento `#sec-…` sopravvive;
   - `/?chat=<id>` → 308 `/gabrifila?chat=<id>`. Il redirect è della
     corsia 3 (routes/index.tsx, la landing): qui si controlla soltanto;
   - un handle cambiato (alias) → 301 verso l'handle nuovo, stesso
     sotto-percorso e query string; il frammento resta.
   ────────────────────────────────────────────────────────────── */

import { http } from "./helpers/http.ts";
import { prepara } from "./helpers/profili.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

const get = (baseURL: string | undefined, path: string) => http(new URL(path, baseURL).href);
const dove = (baseURL: string | undefined, location: string) => {
  const u = new URL(location, baseURL);
  return u.pathname + u.search;
};

test.describe("/dati del sito di prima", () => {
  test("/dati → 308 /gabrifila/dati, con la query string", async ({ baseURL }) => {
    for (const [da, a] of [["/dati", "/gabrifila/dati"], ["/dati?x=1&y=2", "/gabrifila/dati?x=1&y=2"]]) {
      const res = await get(baseURL, da);
      expect(res.status(), da).toBe(308);
      expect(dove(baseURL, res.headers()["location"]), da).toBe(a);
    }
  });

  test("nel browser /dati#sec-mappa arriva a /gabrifila/dati#sec-mappa", async ({ page }) => {
    await page.goto("/dati#sec-mappa");
    await expect(page).toHaveURL(/\/gabrifila\/dati#sec-mappa$/);
    await expect(page.locator("#sec-mappa")).toBeAttached();
  });
});

test.describe("/?chat= del sito di prima", () => {
  test("nel browser /?chat=x arriva a /gabrifila?chat=x", async ({ page }) => {
    // il widget dell'Oracolo poi toglie ?chat dall'indirizzo: conta la risposta
    const res = await page.goto("/?chat=x");
    const arrivo = new URL(res!.url());
    expect(arrivo.pathname + arrivo.search).toBe("/gabrifila?chat=x");
  });

  test("/?chat=x → 308 /gabrifila?chat=x, con il resto della query string", async ({ baseURL }) => {
    const res = await get(baseURL, "/?chat=x&y=1");
    expect(res.status()).toBe(308);
    expect(dove(baseURL, res.headers()["location"])).toBe("/gabrifila?chat=x&y=1");
  });
});

test.describe("handle cambiato (alias)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(onPreview(testInfo.project.name), "i profili di prova vivono solo sul Convex locale");
  });
  test.beforeAll(({}, testInfo) => {
    if (onPreview(testInfo.project.name)) return;
    prepara({ handle: "e2e-nuovo", displayName: "Nuovo", forma: "n", alias: ["e2e-vecchio"], concerti: [{ date: "2025-04-01", artist: "Qualcuno" }] });
  });

  test("301 verso l'handle nuovo, stesso sotto-percorso e query string", async ({ baseURL }) => {
    for (const [da, a] of [
      ["/e2e-vecchio", "/e2e-nuovo"],
      ["/e2e-vecchio/dati", "/e2e-nuovo/dati"],
      ["/e2e-vecchio/dati?chat=abc", "/e2e-nuovo/dati?chat=abc"],
    ]) {
      const res = await get(baseURL, da);
      expect(res.status(), da).toBe(301);
      expect(dove(baseURL, res.headers()["location"]), da).toBe(a);
    }
  });

  test("nel browser il frammento resta", async ({ page }) => {
    await page.goto("/e2e-vecchio/dati#sec-mappa");
    await expect(page).toHaveURL(/\/e2e-nuovo\/dati#sec-mappa$/);
    await expect(page.locator(".kpi").first()).toBeVisible();
  });
});
