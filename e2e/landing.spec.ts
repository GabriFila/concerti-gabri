/* ──────────────────────────────────────────────────────────────
   La landing `/` (src/routes/index.tsx):
   - il visitatore vede il titolo nuovo, "Crea la tua pagina" come azione
     principale (finestra di accesso, senza JS /accedi) e "Entra" per chi ha
     già un account, un link grigio come "Guarda un esempio"; "Entra con
     email" solo dove il codice arriva a una persona (src/accesso/flags.ts):
     nei build e2e sì, sulla preview no;
   - chi è entrato non la vede: 307 alla sua pagina a onboarding finito,
     a /benvenuto prima (anche `active` a metà dei passi 2–4, da dove un
     link porta comunque alla pagina), nell'SSR (private, no-store) e nelle
     navigazioni del browser; il 308 di `/?chat=` vince anche da entrati;
   - al passo 2 di /benvenuto una sola azione principale alla volta.
   Il login (OTP di sviluppo) c'è solo in locale.
   ────────────────────────────────────────────────────────────── */

import type { Page } from "@playwright/test";
import { accediComeGabrifila, idratata, nuovoProprietario } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { watchErrors } from "./helpers/idratazione.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

const NO_STORE = "private, no-store";

/** GET con i cookie della pagina (la sessione), senza seguire i redirect. */
async function senzaSeguire(page: Page, path: string) {
  const r = await page.request.get(path, { maxRedirects: 0 });
  const location = r.headers()["location"];
  const u = location ? new URL(location, page.url()) : null;
  return { status: r.status(), dove: u ? u.pathname + u.search : "", cache: r.headers()["cache-control"] };
}

/** Una navigazione del router nel browser (niente richiesta al server), con un segno per accorgersi di un ricaricamento. */
async function navigaNelBrowser(page: Page, to: string) {
  await page.evaluate(async dove => {
    const w = window as unknown as { __segno?: number; __TSR_ROUTER__: { navigate(o: { to: string }): Promise<void> } };
    w.__segno = 1;
    await w.__TSR_ROUTER__.navigate({ to: dove });
  }, to);
}
const nessunRicaricamento = (page: Page) => page.evaluate(() => (window as unknown as { __segno?: number }).__segno);

test.describe("visitatore", () => {
  test("titolo, azione principale e link secondari", async ({ page }) => {
    const errori = watchErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tutti i tuoi concerti, in un solo posto.");
    await expect(page.getByText("Ogni concerto che vedi")).toHaveCount(0);
    // una sola azione principale; senza JS i link portano ad /accedi
    const crea = page.getByRole("link", { name: "Crea la tua pagina" });
    await expect(crea).toHaveAttribute("href", "/accedi?next=%2Fbenvenuto");
    await expect(crea).toHaveClass(/\bacc-btn\b/);
    await expect(page.locator(".acc-landing .acc-btn")).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Entra \/ Crea/ })).toHaveCount(0);
    const esempio = page.getByRole("link", { name: "Guarda un esempio" });
    await expect(esempio).toHaveAttribute("href", "/gabrifila");
    await expect(page.getByText("Hai già un account?")).toBeVisible();
    const entra = page.getByRole("link", { name: "Entra", exact: true });
    await expect(entra).toHaveAttribute("href", "/accedi?next=%2F");
    // i link secondari sono grigi tutti e due: l'ambra resta a "Crea la tua pagina"
    await expect(entra).toHaveCSS("color", await esempio.evaluate(e => getComputedStyle(e).color));
    expect(await entra.evaluate(e => getComputedStyle(e).color)).not.toBe(await crea.evaluate(e => getComputedStyle(e).backgroundColor));
    // nessun residuo della versione per chi è entrato
    await expect(page.getByText("Riprendi la configurazione")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Esci" })).toHaveCount(0);
    expect(errori.hydration()).toEqual([]);
  });

  test("le due finestre: Crea la tua pagina ed Entra; l'email solo dove arriva a qualcuno", async ({ page }, info) => {
    await page.goto("/");
    await idratata(page);
    await page.getByRole("link", { name: "Crea la tua pagina" }).click();
    const crea = page.getByRole("dialog", { name: "Crea la tua pagina" });
    await expect(crea).toBeVisible();
    if (onPreview(info.project.name)) {
      // build non e2e col sender di sviluppo: solo Google, niente email (il codice non lo leggerebbe nessuno)
      await expect(crea.getByRole("button", { name: "Continua con Google" })).toBeVisible();
      await expect(crea.getByRole("button", { name: "Entra con email" })).toHaveCount(0);
      await expect(crea.getByLabel("Email")).toHaveCount(0);
    } else {
      // build e2e (VITE_E2E=1) e deployment locale senza Google: il campo email subito
      await expect(crea.getByLabel("Email")).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(crea).toHaveCount(0);
    await page.getByRole("link", { name: "Entra", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Entra" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("chi è entrato", () => {
  test.beforeEach(({}, info) => {
    test.skip(onPreview(info.project.name), "solo in locale (OTP di sviluppo)");
    test.skip(info.project.name !== "desktop", "redirect: non dipende dal viewport, basta desktop");
  });
  test.afterAll(({}, info) => {
    if (!onPreview(info.project.name)) convexRun("devtools:cleanupE2E");
  });

  test("onboarding finito: / porta a /<handle>, nell'SSR e nel browser; /?chat= resta un 308", { tag: "@sessione" }, async ({ page }) => {
    await page.goto("/");
    await accediComeGabrifila(page);

    // SSR: 307 per sessione, mai in cache
    expect(await senzaSeguire(page, "/")).toEqual({ status: 307, dove: "/gabrifila", cache: NO_STORE });
    // il 308 dei vecchi link dell'Oracolo vince anche da entrati
    expect(await senzaSeguire(page, "/?chat=x&y=1")).toMatchObject({ status: 308, dove: "/gabrifila?chat=x&y=1" });

    await page.goto("/");
    await expect(page).toHaveURL(/\/gabrifila$/);

    // navigazione nel browser verso `/` (stesso beforeLoad, nessun ricaricamento)
    await page.goto("/gabrifila/dati");
    await idratata(page);
    await navigaNelBrowser(page, "/");
    await expect(page).toHaveURL(/\/gabrifila$/);
    expect(await nessunRicaricamento(page)).toBe(1);

    // il marchio "Concerti" (qui da /privacy) riporta alla propria pagina
    await page.goto("/privacy");
    await page.getByRole("link", { name: "Concerti" }).click();
    await expect(page).toHaveURL(/\/gabrifila$/);
  });

  test("onboarding a metà: / porta a /benvenuto, che lascia andare alla pagina; finiti i passi, / porta alla pagina", { tag: "@sessione" }, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    // passo 1 fatto: profilo `active` con handle, passi 2–4 da fare
    const { handle } = await nuovoProprietario(page);

    expect(await senzaSeguire(page, "/")).toEqual({ status: 307, dove: "/benvenuto", cache: NO_STORE });
    await page.goto("/");
    await expect(page).toHaveURL(/\/benvenuto$/);
    await expect(page.getByText("Passo 2 di 5")).toBeVisible();
    await idratata(page);

    // senza partenze l'azione principale è Aggiungi, "Salta per ora" è secondaria
    const principali = page.locator(".acc-passo .acc-btn:not(.acc-btn--ghost)");
    const aggiungi = page.getByRole("button", { name: "Aggiungi" });
    await expect(aggiungi).not.toHaveClass(/acc-btn--ghost/);
    await expect(page.getByRole("button", { name: "Salta per ora" })).toHaveClass(/acc-btn--ghost/);
    await expect(principali).toHaveCount(1);
    // dopo Aggiungi si apre l'indirizzo: la principale è Cerca, Aggiungi e Avanti restano secondarie
    await page.getByLabel("Nome della partenza").fill("Casa");
    await aggiungi.click();
    await expect(page.getByRole("button", { name: "Cerca" })).toBeVisible();
    await expect(aggiungi).toHaveClass(/acc-btn--ghost/);
    await expect(page.getByRole("button", { name: "Avanti" })).toHaveClass(/acc-btn--ghost/);
    await expect(principali).toHaveText(["Cerca"]);
    // chiuso l'indirizzo, Avanti torna l'azione principale
    await page.getByRole("button", { name: "Annulla" }).click();
    await expect(page.getByRole("button", { name: "Avanti" })).not.toHaveClass(/acc-btn--ghost/);
    await expect(principali).toHaveText(["Avanti"]);

    // nessuna trappola: dal passo un link porta alla pagina, e `/` riporta al passo
    const uscita = page.getByRole("link", { name: "vai alla tua pagina" });
    await expect(uscita).toHaveAttribute("href", `/${handle}`);
    await uscita.click();
    await expect(page).toHaveURL(new RegExp(`/${handle}$`));
    await navigaNelBrowser(page, "/");
    await expect(page).toHaveURL(/\/benvenuto$/);
    await expect(page.getByText("Passo 2 di 5")).toBeVisible();
    expect(await nessunRicaricamento(page)).toBe(1);

    await page.getByRole("button", { name: "Avanti" }).click();
    await expect(page.getByText("Passo 3 di 5")).toBeVisible();
    await page.getByRole("button", { name: "Avanti" }).click();
    await expect(page.getByText("Passo 4 di 5")).toBeVisible();
    await page.getByRole("button", { name: "Fine" }).click();
    await expect(page.getByRole("heading", { name: "La tua pagina è pronta" })).toBeVisible();

    // ora `/` porta alla pagina, anche dal browser
    await navigaNelBrowser(page, "/");
    await expect(page).toHaveURL(new RegExp(`/${handle}$`));
    expect(await nessunRicaricamento(page)).toBe(1);
    expect(await senzaSeguire(page, "/")).toEqual({ status: 307, dove: `/${handle}`, cache: NO_STORE });
  });
});
