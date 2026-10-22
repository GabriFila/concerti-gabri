/* ──────────────────────────────────────────────────────────────
   L'Oracolo in scrittura (PIANO §1.27, traguardo 6), con il modello finto
   (ORACOLO_FAKE=1: il copione della scrittura in src/server/oracolo/finto.ts)
   e una proprietaria nuova (nuovoProprietario, con un concerto già in
   pagina), mai gabrifila.

   - Aggiunta dal vivo: "aggiungi il concerto di X" → add_concert; il
     concerto compare in #concerti e sulla pagina pubblica aperta da un
     visitatore, senza ricaricare.
   - La cancellazione chiede l'approvazione nella chat, con il nome del
     concerto letto da Convex: "Rifiuta" non cancella niente, "Conferma"
     cancella.
   - In #attivita l'autore di aggiunta e cancellazione è "Oracolo".
   - La chat è privata: sta tra le chat della proprietaria, non nello
     storico pubblico.
   - Senza Origin, su una pagina altrui o senza sessione la route rifiuta.

   Tutte @sessione (il login dell'OTP di sviluppo). Una volta sola
   (desktop). `ORACOLO_FAKE=1 node scripts/wt.mjs exec -- pnpm e2e e2e/oracolo-scrittura.spec.ts`.
   ────────────────────────────────────────────────────────────── */

import type { Page } from "@playwright/test";
import { nuovoProprietario, unico } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { http } from "./helpers/http.ts";
import { expect, test } from "./helpers/test.ts";

const chat = (page: Page) => page.getByRole("dialog", { name: "L'Oracolo in scrittura" });
async function scrivi(page: Page, testo: string) {
  await chat(page).getByRole("textbox", { name: "Messaggio per l'Oracolo" }).fill(testo);
  await chat(page).getByRole("button", { name: "Invia" }).click();
}

/** Le POST a /api/chat/scrittura della pagina, col loro corpo. */
function registra(page: Page): { threadId?: string }[] {
  const richieste: { threadId?: string }[] = [];
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/chat/scrittura") richieste.push(r.postDataJSON());
  });
  return richieste;
}

test.describe("Oracolo in scrittura", { tag: "@sessione" }, () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "una volta sola, sul progetto desktop in locale");
    test.skip(process.env.ORACOLO_FAKE !== "1", "serve l'Oracolo finto: ORACOLO_FAKE=1");
    convexRun("chat:azzeraLimitiPerTest");
  });

  test("aggiunge dal vivo, chiede l'approvazione per cancellare, firma «Oracolo» in Attività", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const richieste = registra(page);
    const { handle } = await nuovoProprietario(page, { forma: "f", nome: "Scrittrice" });
    // un concerto già in pagina, così la pagina pubblica non parte vuota
    convexRun("devtools:addEntry", {
      handle,
      entry: { kind: "concert", date: "2025-05-10", artist: "Canarino di partenza", venue: "Fabrique", city: "Milano", with: [] },
    });
    const artista = `Canarino scritto ${unico()}`;

    // un visitatore guarda la pagina pubblica, senza sessione
    const ospite = await browser.newContext();
    const pubblica = await ospite.newPage();
    await pubblica.goto(`/${handle}/dati`);
    await expect(pubblica.getByText("Canarino di partenza").first()).toBeVisible();
    await expect(pubblica.getByText(artista)).toHaveCount(0);

    await page.goto(`/${handle}/modifica`);
    // l'elenco di #concerti (non il riquadro "da completare", che sta nella stessa sezione)
    const concerti = page.locator("section#concerti").getByRole("list", { name: "Concerti e festival" });
    const attivita = page.locator("section#attivita");
    await expect(concerti.getByText("Canarino di partenza")).toBeVisible();
    // qui l'Oracolo è quello in scrittura: quello dei visitatori si fa da parte
    await expect(page.getByRole("button", { name: "Apri L'Oracolo, la chat AI" })).toHaveCount(0);
    await page.getByRole("button", { name: "Apri L'Oracolo in scrittura" }).click();

    // 1. aggiunta: dal vivo nella dashboard e sulla pagina pubblica
    await scrivi(page, `Aggiungi il concerto di ${artista}`);
    await expect(chat(page).getByText("Fatto: concerto aggiunto.")).toBeVisible();
    await expect(chat(page).getByText("Concerto aggiunto", { exact: true })).toBeVisible();
    await expect(concerti.getByText(artista)).toBeVisible();
    await expect(pubblica.getByText(artista).first()).toBeVisible();
    await expect(attivita.locator(".mod-voce").filter({ hasText: `aggiunto: ${artista}` }).locator(".mod-autore")).toHaveText("Oracolo");
    const threadId = richieste[0].threadId!;

    // 2. cancellazione: la chat chiede, con il nome del concerto; "Rifiuta" non tocca niente
    await scrivi(page, `Cancella il concerto di ${artista}`);
    const domanda = chat(page).getByRole("group", { name: "Conferma richiesta" });
    await expect(domanda).toContainText(`Cancellare il concerto «${artista} del 20/11/2026»?`);
    await domanda.getByRole("button", { name: "Rifiuta" }).click();
    await expect(chat(page).getByText("Va bene, non lo cancello.")).toBeVisible();
    await expect(concerti.getByText(artista)).toBeVisible();

    // ...e "Conferma" cancella: sparisce dalla dashboard e dalla pagina pubblica
    await scrivi(page, `Cancella il concerto di ${artista}`);
    await chat(page).getByRole("group", { name: "Conferma richiesta" }).getByRole("button", { name: "Conferma" }).click();
    await expect(chat(page).getByText("Fatto: concerto cancellato.")).toBeVisible();
    await expect(concerti.getByText(artista)).toHaveCount(0);
    await expect(pubblica.getByText(artista)).toHaveCount(0);
    await expect(attivita.locator(".mod-voce").filter({ hasText: `cancellato: ${artista}` }).locator(".mod-autore")).toHaveText("Oracolo");
    await ospite.close();

    // 3. tutto nello stesso thread, privato: tra le chat della proprietaria, mai nello storico pubblico
    expect(new Set(richieste.map(r => r.threadId))).toEqual(new Set([threadId]));
    await chat(page).getByRole("button", { name: "Le tue chat private" }).click();
    await expect(chat(page).locator(".chat-hist-item").filter({ hasText: `Aggiungi il concerto di ${artista}` })).toContainText("chat aperta");
    expect(convexRun<unknown[]>("chat:listThreads", { handle })).toEqual([]);
    expect(convexRun<unknown>("chat:getThread", { handle, threadId }) ?? null).toBeNull();
    expect(convexRun<string | undefined>("chat:visibilitaPerTest", { threadId })).toBe("proprietario");
  });

  test("senza Origin, su una pagina altrui o senza sessione: rifiutato", async ({ page, baseURL }) => {
    const { handle } = await nuovoProprietario(page);
    const url = new URL("/api/chat/scrittura", baseURL).href;
    const origin = new URL(baseURL!).origin;
    const corpo = (h: string) => ({ messages: [{ role: "user", content: "aggiungi il concerto di Nessuno" }], forwardedProps: { handle: h } });

    // con la sessione (i cookie della pagina) ma senza Origin
    const senzaOrigin = await page.request.post(url, { data: corpo(handle), failOnStatusCode: false });
    expect(senzaOrigin.status()).toBe(403);
    // con sessione e Origin, ma sulla pagina di un altro
    const altrui = await page.request.post(url, { headers: { origin }, data: corpo("gabrifila"), failOnStatusCode: false });
    expect(altrui.status()).toBe(403);
    // Origin giusto ma nessuna sessione (fetch di Node, niente cookie)
    const anonimo = await http(url, { headers: { origin }, data: corpo(handle) });
    expect(anonimo.status()).toBe(401);
    // niente di tutto questo ha scritto
    const pagina = convexRun<{ entries: unknown[] } | undefined>("pages:byHandle", { handle });
    expect(pagina?.entries ?? []).toEqual([]);
  });
});
