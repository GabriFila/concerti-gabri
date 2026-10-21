/* ──────────────────────────────────────────────────────────────
   La mappa è viva (PIANO §7 traguardo 1, DECISIONI "Mappa"): il token pk.
   di Mapbox è limitato per URL e la restrizione vale sulle tile vettoriali
   (`/v4/…vector.pbf`: 200 dagli URL ammessi, 403 dagli altri), non su
   stili e font. Quindi la mappa si giudica dalle tile:
   - `canvas.mapboxgl-canvas` presente;
   - niente "Mappa non disponibile";
   - almeno una risposta `vector.pbf` con 200 e nessuna con 403.
   In locale gira su http://localhost:3100 (ammesso dal token); sul progetto
   preview sull'URL del branch.
   ────────────────────────────────────────────────────────────── */

import { expect, test } from "./helpers/test.ts";

const TILE = /\.vector\.pbf(\?|$)/;

test("la mappa carica tile vere da Mapbox", async ({ page, context }) => {
  const tiles: number[] = [];
  // dal contesto: le tile le scarica un web worker di Mapbox
  context.on("response", r => { if (TILE.test(new URL(r.url()).pathname + "?")) tiles.push(r.status()); });

  await page.goto("/gabrifila/dati", { waitUntil: "domcontentloaded" });
  const section = page.locator("#sec-mappa");
  await section.scrollIntoViewIfNeeded();
  await expect(page.locator("canvas.mapboxgl-canvas")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => tiles.filter(s => s === 200).length, {
    message: "almeno una tile vector.pbf con 200",
    timeout: 30_000,
  }).toBeGreaterThan(0);
  // un attimo per le tile ancora in volo, poi il giudizio
  await page.waitForLoadState("networkidle");

  expect(tiles.filter(s => s === 403), "tile rifiutate (403): l'origine non è ammessa dal token").toEqual([]);
  await expect(page.getByText("Mappa non disponibile")).toHaveCount(0);
});
