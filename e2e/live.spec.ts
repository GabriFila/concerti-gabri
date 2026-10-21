/* ──────────────────────────────────────────────────────────────
   La pagina resta viva dopo l'idratazione (PIANO §6, traguardo 2).

   Un visitatore anonimo apre /gabrifila/dati (SSR con i dati di Convex).
   Senza ricaricare, devtools:addEntry aggiunge un concerto in programma al
   profilo sul deployment LOCALE: la card "In programma" passa da 11 a 12 e
   il "prossimo" diventa la data nuova, solo grazie alla sottoscrizione
   WebSocket (ConvexQueryClient). Poi devtools:removeEntry lo toglie e la
   card torna com'era, sempre dal vivo. Alla fine il deployment locale è
   identico a prima (la parità con main ne ha bisogno).

   Solo in locale e solo desktop: sulla preview le scritture con devtools
   le fa l'orchestratore.
   ────────────────────────────────────────────────────────────── */

import { convexRun } from "./helpers/convex.ts";
import { expect, test } from "./helpers/test.ts";

const ARTISTA = "Canarino dal vivo";

/** Toglie i concerti di prova rimasti da una run interrotta. */
function pulisci(): void {
  const page = convexRun<{ entries: { _id: string; artist?: string }[] } | null>("pages:byHandle", { handle: "gabrifila" });
  for (const e of page?.entries ?? []) {
    if (e.artist === ARTISTA) convexRun("devtools:removeEntry", { handle: "gabrifila", entryId: e._id });
  }
}

test.beforeAll(pulisci);
test.afterAll(pulisci);

test("una pagina anonima si aggiorna quando devtools:addEntry aggiunge un concerto", async ({ page }) => {
  test.setTimeout(120_000);
  // nessuno stato del browser: cookie vuoti, nessuna sessione
  await page.goto("/gabrifila/dati");
  const card = page.locator(".kpi").filter({ hasText: "In programma" });
  await expect(card.locator(".num")).toHaveText("11");
  await expect(card.locator(".hint")).toHaveText("prossimo 18/11/2026");
  // il WebSocket di Convex è aperto: la pagina è idratata e sottoscritta
  await expect.poll(() => page.evaluate(() => document.readyState)).toBe("complete");

  let id: string | undefined;
  try {
    // fra "oggi" (E2E_NOW, 21/10/2026) e il prossimo concerto vero: diventa il prossimo
    id = convexRun<string>("devtools:addEntry", {
      handle: "gabrifila",
      entry: { kind: "concert", date: "2026-10-25", artist: ARTISTA, venue: "Fabrique", city: "Milano", with: [] },
    });
    expect(typeof id).toBe("string");
    await expect(card.locator(".num")).toHaveText("12", { timeout: 20_000 });
    await expect(card.locator(".hint")).toHaveText("prossimo 25/10/2026");
    // anche l'archivio ha la riga nuova
    await expect(page.locator("#sec-archivio")).toContainText(ARTISTA);
  } finally {
    if (id) convexRun("devtools:removeEntry", { handle: "gabrifila", entryId: id });
  }
  // e la cancellazione arriva dal vivo allo stesso modo
  await expect(card.locator(".num")).toHaveText("11", { timeout: 20_000 });
  await expect(card.locator(".hint")).toHaveText("prossimo 18/11/2026");
  // mai ricaricata: la navigazione è ancora la prima
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);
});
