/* ──────────────────────────────────────────────────────────────
   Controllo fughe della vista admin (DECISIONI «Vista admin»): il
   canarino (helpers/canarino.ts) è l'indirizzo di una partenza del
   profilo di prova `e2e-fughe`; con la sessione di un admin né l'HTML
   SSR di /admin né quello di /admin/e2e-fughe lo contengono (in nessuna
   forma, coordinate comprese), mentre la pagina mostra che la partenza
   ha l'indirizzo. @sessione, solo desktop e in locale.
   ────────────────────────────────────────────────────────────── */

import { impostaAdmin, rendiAdmin } from "../helpers/admin.ts";
import { CANARINO } from "../helpers/canarino.ts";
import { idratata, nuovoProprietario } from "../helpers/auth.ts";
import { convexRun } from "../helpers/convex.ts";
import { fughe } from "../helpers/fughe.ts";
import { expect, test } from "../helpers/test.ts";

const PROVA = "e2e-fughe";
const PARTENZA = "Casa canarino";

test.describe("vista admin: il canarino non esce", { tag: "@sessione" }, () => {
  test.beforeAll(({}, info) => test.skip(info.project.name !== "desktop", "una volta sola: non dipende dal viewport"));
  test.afterAll(() => impostaAdmin("-"));

  test("HTML SSR di /admin e /admin/<handle> visti dall'admin", async ({ page }) => {
    test.setTimeout(180_000);
    convexRun("devtools:creaProfiloDiProva", { handle: PROVA, authUserId: "e2e-fughe-utente", displayName: "Fughe" });
    convexRun("account:creaPartenzaPerTest", { handle: PROVA, name: PARTENZA });
    convexRun("devtools:setDepartureForTest", { handle: PROVA, departure: PARTENZA, address: CANARINO.displayName, lng: CANARINO.lng, lat: CANARINO.lat });

    const io = await nuovoProprietario(page, { nome: "Admin fughe" });
    rendiAdmin(io.email);

    for (const percorso of ["/admin", `/admin/${PROVA}`]) {
      const r = await page.goto(percorso);
      expect(r?.status(), percorso).toBe(200);
      await idratata(page);
      const ssr = await page.evaluate(async p => await (await fetch(p, { credentials: "same-origin" })).text(), percorso);
      expect(ssr, percorso).toContain(PROVA);
      expect(fughe(ssr), percorso).toEqual([]);
      // e il DOM dopo l'idratazione (con le query dal vivo)
      expect(fughe(await page.content()), `${percorso} (DOM)`).toEqual([]);
    }
    await expect(page.getByText(`${PARTENZA} · indirizzo impostato`)).toBeVisible();
  });
});
