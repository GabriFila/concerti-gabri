/* ──────────────────────────────────────────────────────────────
   Screenshot del giro finale (PIANO traguardo 9), da far guardare a Gabri:
   la landing, /gabrifila, /gabrifila/dati e /gabrifila/modifica (da
   proprietario: utente di prova + admin:claimProfile sul deployment
   locale), in chiaro e in scuro; il viewport lo dà il progetto (desktop,
   mobile Pixel 7). 4 pagine × 2 temi × 2 progetti = 16 PNG a pagina
   intera in e2e-shots/finale/ (fuori da git), con il nome
   <pagina>-<tema>-<progetto>.png.
   Nessun confronto: la parità con main la controlla parita.spec.ts. Le
   pagine pubbliche si scattano da visitatore, prima del login. Solo in
   locale (l'accesso usa l'OTP di sviluppo).

   In più le viste dell'app di modifica (spec ux-modifica), in
   e2e-shots/ux/<vista>-<tema>-<progetto>.png: Concerti (con un concerto
   passato da completare, aggiunto per lo scatto e tolto alla fine),
   Persone, Attività, Account, il pannello «Nuovo concerto», «Modifica
   concerto», «Nuovo festival» col riepilogo degli errori e la coda dei
   "da completare", l'Oracolo (agganciato sul desktop, a tutto schermo sul
   telefono) e il foglio «Altro»; sul desktop anche a 1024 e 1600 px. Poi
   gli elenchi coi loro pannelli: una persona, i menu ⋯ di Persone e
   Wishlist, la finestra dell'indirizzo e il pannello di un "regalato da"
   (solo aperti e chiusi: gabrifila non cambia). Infine le impostazioni:
   Stile, Agenti e Account a pagina intera, Stile e Account con una
   modifica in sospeso (la barra di salvataggio, la guardia uscendo; poi
   «Annulla le modifiche»: niente si salva) e Attività filtrata.
   Su una proprietaria di prova (mai gabrifila): Concerti senza concerti
   (una sola azione piena), «Da completare» con cinque voci (tre sul
   telefono) e, sul desktop, la coda «Salva e vai al prossimo» con
   l'Oracolo agganciato a 1440 e 1024 px, notifica compresa (sta fuori
   dal piede del pannello).
   ────────────────────────────────────────────────────────────── */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { accediComeGabrifila, idratata, nuovoProprietario } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { vaiA } from "./helpers/modifica.ts";
import { setTemaCookie } from "./helpers/tema.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

const DIR = join(process.cwd(), "e2e-shots", "finale");
const TEMI = ["light", "dark"] as const;
const PUBBLICHE = [
  { nome: "landing", path: "/" },
  { nome: "palco", path: "/gabrifila" },
  { nome: "dati", path: "/gabrifila/dati" },
] as const;

/* Porta la pagina a riposo: scorre tutta la pagina (le sezioni si rivelano
   allo scroll e la mappa carica le tile), torna in cima, aspetta font e rete. */
async function aRiposo(page: Page) {
  await idratata(page);
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 80));
    }
    window.scrollTo(0, 0);
  });
  await page.evaluate(() => document.fonts.ready);
  // la mappa e la sottoscrizione Convex possono non arrivare mai a "networkidle": basta provarci
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(800);
}

test("16 screenshot del giro finale: 4 pagine in chiaro e in scuro", { tag: "@sessione" }, async ({ page, context, baseURL }, info) => {
  test.skip(onPreview(info.project.name), "solo in locale (l'accesso usa l'OTP di sviluppo)");
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const scatta = async (pagina: string, tema: string) => {
    await aRiposo(page);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(tema);
    await page.screenshot({ path: join(DIR, `${pagina}-${tema}-${info.project.name}.png`), fullPage: true, animations: "disabled" });
  };

  for (const tema of TEMI) {
    await setTemaCookie(context, baseURL!, tema);
    for (const p of PUBBLICHE) {
      await page.goto(p.path);
      await scatta(p.nome, tema);
    }
  }

  await accediComeGabrifila(page);
  for (const tema of TEMI) {
    await setTemaCookie(context, baseURL!, tema);
    await page.goto("/gabrifila/modifica");
    await expect(page).toHaveURL(/\/gabrifila\/modifica$/);
    await expect(page.locator("section.modifica-sezione")).toHaveCount(9);
    await scatta("modifica", tema);
  }
});

const UX = join(process.cwd(), "e2e-shots", "ux");
const DA_SCATTARE = "Canarino da scattare";

/** Toglie da gabrifila il concerto passato aggiunto per gli scatti (anche quello di una run interrotta). */
function togliDaScattare(): void {
  const pagina = convexRun<{ entries: { _id: string; artist?: string }[] } | null>("pages:byHandle", { handle: "gabrifila" });
  for (const e of pagina?.entries ?? []) if (e.artist === DA_SCATTARE) convexRun("devtools:removeEntry", { handle: "gabrifila", entryId: e._id });
}

test("ux: le viste di /modifica in chiaro e in scuro", { tag: "@sessione" }, async ({ page, context, baseURL }, info) => {
  test.skip(onPreview(info.project.name), "solo in locale (l'accesso usa l'OTP di sviluppo)");
  test.setTimeout(400_000);
  mkdirSync(UX, { recursive: true });
  const telefono = info.project.name === "mobile";
  const scatta = async (vista: string, tema: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(UX, `${vista}-${tema}-${info.project.name}.png`), animations: "disabled" });
  };
  const concerti = page.locator("section#concerti");
  const oracolo = page.getByRole("dialog", { name: "L'Oracolo in scrittura" });

  await page.goto("/");
  await accediComeGabrifila(page);
  // un concerto passato senza voto: il riquadro «Da completare» e la coda (tolto alla fine)
  togliDaScattare();
  convexRun("devtools:addEntry", { handle: "gabrifila", entry: { kind: "concert", date: "2026-09-01", artist: DA_SCATTARE, venue: "Fabrique", city: "Milano", with: [] } });
  try {
    for (const tema of TEMI) {
      await setTemaCookie(context, baseURL!, tema);
      await page.goto("/gabrifila/modifica");
      await idratata(page);
      await expect(concerti.getByRole("list", { name: "Concerti e festival" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Da completare" })).toBeVisible();
      await scatta("concerti", tema);
      for (const v of ["wishlist", "persone", "partenze", "regali", "stile", "agenti", "attivita", "account"]) {
        await vaiA(page, v);
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
        await scatta(v, tema);
      }

      // una notifica con «Annulla» (la persona di prova sparisce subito, annullata)
      await vaiA(page, "persone");
      const persone = page.locator("section#persone");
      await persone.getByLabel("Nuova persona").fill("Canarino F.");
      await persone.getByRole("button", { name: "Aggiungi" }).click();
      const notifica = page.getByRole("status").filter({ hasText: "Persona aggiunta." });
      await expect(notifica.getByRole("button", { name: "Annulla", exact: true })).toBeVisible();
      await scatta("notifica", tema);
      await notifica.getByRole("button", { name: "Annulla", exact: true }).click();
      const annullato = page.getByRole("status").filter({ hasText: "Annullato." });
      await expect(annullato).toBeVisible();
      await expect(persone.getByText("Canarino F.")).toHaveCount(0);
      await annullato.getByRole("button", { name: "Chiudi la notifica" }).click();
      await expect(page.getByRole("region", { name: "Notifiche" }).getByRole("status")).toHaveCount(0);

      // il menu ⋯ della testata di Concerti (sul telefono un foglio di azioni)
      await vaiA(page, "concerti");
      await concerti.getByRole("button", { name: "Altre azioni", exact: true }).click();
      await expect(page.getByRole("menu", { name: "Altre azioni" })).toBeVisible();
      await scatta("menu", tema);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu", { name: "Altre azioni" })).toBeHidden();

      await concerti.getByRole("button", { name: "Aggiungi un concerto" }).click();
      await expect(page.getByRole("dialog", { name: "Nuovo concerto" })).toBeVisible();
      await scatta("pannello-nuovo", tema);
      await page.getByRole("dialog", { name: "Nuovo concerto" }).getByRole("button", { name: "Chiudi" }).click();
      await concerti.getByRole("list", { name: "Concerti e festival" }).getByRole("button", { name: /^Modifica / }).first().click();
      await expect(page.getByRole("dialog", { name: "Modifica concerto" })).toBeVisible();
      await scatta("pannello-modifica", tema);
      await page.getByRole("dialog", { name: "Modifica concerto" }).getByRole("button", { name: "Chiudi" }).click();
      await expect(page.getByRole("dialog", { name: "Modifica concerto" })).toHaveCount(0);

      // un festival nuovo mandato vuoto: il riepilogo degli errori in testa
      if (telefono) {
        await concerti.getByRole("button", { name: "Altre azioni", exact: true }).click();
        await page.getByRole("menuitem", { name: "Aggiungi un festival" }).click();
      } else {
        await concerti.getByRole("button", { name: "Aggiungi un festival" }).click();
      }
      const festival = page.getByRole("dialog", { name: "Nuovo festival" });
      await festival.getByRole("button", { name: "Salva", exact: true }).click();
      await expect(festival.getByRole("alert").filter({ hasText: "Controlla" })).toBeVisible();
      await scatta("pannello-festival", tema);
      await festival.getByRole("button", { name: "Chiudi" }).click();
      await expect(festival).toHaveCount(0);

      // la coda dei "da completare": la parte «Com'è andata» in ambra
      await page.getByRole("region", { name: "Da completare" }).getByRole("button", { name: `Completa ${DA_SCATTARE} del 01/09/2026` }).click();
      const coda = page.getByRole("dialog", { name: "Modifica concerto" });
      await expect(coda.getByText(/^Da completare · 1 di/)).toBeVisible();
      await scatta("pannello-completa", tema);
      await coda.getByRole("button", { name: "Chiudi" }).click();
      await expect(coda).toHaveCount(0);

      if (telefono) {
        await page.getByRole("navigation", { name: "Sezioni principali" }).getByRole("button", { name: "Altro", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Tutte le sezioni" })).toBeVisible();
        await scatta("altro", tema);
        await page.goBack();
        await expect(page.getByRole("dialog", { name: "Tutte le sezioni" })).toHaveCount(0);
        await page.getByRole("navigation", { name: "Sezioni principali" }).getByRole("button", { name: "Apri L'Oracolo in scrittura" }).click();
        await expect(oracolo).toBeVisible();
        await scatta("oracolo", tema);
        await page.goBack();
        await expect(oracolo).toBeHidden();
      } else {
        await page.getByRole("button", { name: "Apri L'Oracolo in scrittura" }).click();
        await expect(oracolo).toBeVisible();
        await scatta("oracolo", tema);
        await concerti.getByRole("list", { name: "Concerti e festival" }).getByRole("button", { name: /^Modifica / }).first().click();
        await expect(page.getByRole("dialog", { name: "Modifica concerto" })).toBeVisible();
        await scatta("oracolo-pannello", tema);
        await page.getByRole("dialog", { name: "Modifica concerto" }).getByRole("button", { name: "Chiudi" }).click();
        for (const larghezza of [1024, 1600]) {
          await page.setViewportSize({ width: larghezza, height: 900 });
          await scatta(`oracolo-${larghezza}`, tema);
        }
        // tablet: lo stesso Oracolo, aperto, diventa un foglio modale a destra
        await page.setViewportSize({ width: 820, height: 1000 });
        await expect(oracolo).toBeVisible();
        // il cambio di modo arriva dopo il resize (useMisura): si aspetta, non si legge subito
        await expect.poll(() => oracolo.evaluate(d => d.matches(":modal"))).toBe(true);
        await scatta("oracolo-820", tema);
        await oracolo.getByRole("button", { name: "Chiudi L'Oracolo", exact: true }).click();
        await expect(oracolo).toBeHidden();
        await scatta("concerti-820", tema);
        await concerti.getByRole("button", { name: "Aggiungi un concerto" }).click();
        await expect(page.getByRole("dialog", { name: "Nuovo concerto" })).toBeVisible();
        await scatta("pannello-820", tema);
        await page.getByRole("dialog", { name: "Nuovo concerto" }).getByRole("button", { name: "Chiudi" }).click();
        await expect(page.getByRole("dialog", { name: "Nuovo concerto" })).toHaveCount(0);
        await page.setViewportSize({ width: 1280, height: 1000 });
        await page.getByRole("button", { name: "Apri L'Oracolo in scrittura" }).click();
        await expect(oracolo).toBeVisible();
        await page.getByRole("button", { name: "Chiudi L'Oracolo in scrittura" }).click();
        await expect(oracolo).toBeHidden();
        for (const larghezza of [1024, 1600]) {
          await page.setViewportSize({ width: larghezza, height: 900 });
          await scatta(`concerti-${larghezza}`, tema);
        }
        await page.setViewportSize({ width: 1280, height: 1000 });
      }
    }
  } finally {
    togliDaScattare();
  }
});

test("ux: gli elenchi di /modifica (persone, wishlist, partenze, regalato da) coi loro pannelli", { tag: "@sessione" }, async ({ page, context, baseURL }, info) => {
  test.skip(onPreview(info.project.name), "solo in locale (l'accesso usa l'OTP di sviluppo)");
  test.setTimeout(300_000);
  mkdirSync(UX, { recursive: true });
  const scatta = async (vista: string, tema: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(UX, `${vista}-${tema}-${info.project.name}.png`), animations: "disabled" });
  };
  const pannello = page.locator("dialog.mf-pannello[open]");

  await page.goto("/");
  await accediComeGabrifila(page);
  for (const tema of TEMI) {
    await setTemaCookie(context, baseURL!, tema);
    // senza hash: solo l'hash diverso non ricaricherebbe la pagina (e il tema)
    await page.goto("/gabrifila/modifica");
    await idratata(page);
    await vaiA(page, "persone");

    // persone: il pannello di una persona (con i suoi concerti) e il menu ⋯ di una riga
    const persone = page.locator("section#persone");
    const elenco = persone.getByRole("list", { name: "Persone" });
    await expect(elenco).toBeVisible();
    await persone.getByRole("combobox", { name: "Ordina" }).selectOption("piu");
    await elenco.getByRole("button", { name: /^Apri / }).first().click();
    await expect(pannello).toBeVisible();
    await scatta("persona", tema);
    await pannello.getByRole("button", { name: "Chiudi" }).click();
    await expect(pannello).toHaveCount(0);
    await persone.getByRole("combobox", { name: "Ordina" }).selectOption("nome");
    await elenco.getByRole("button", { name: /^Altre azioni per/ }).nth(2).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await scatta("persone-menu", tema);
    await page.keyboard.press("Escape");

    // wishlist: il menu ⋯ di una riga
    await vaiA(page, "wishlist");
    const wishlist = page.locator("section#wishlist");
    await wishlist.getByRole("list", { name: "Wishlist" }).getByRole("button", { name: /^Altre azioni per/ }).nth(1).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await scatta("wishlist-menu", tema);
    await page.keyboard.press("Escape");

    // partenze: la finestra dell'indirizzo (dall'hash)
    await vaiA(page, "partenze");
    const partenze = page.locator("section#partenze");
    await expect(partenze.getByRole("list", { name: "Partenze" })).toBeVisible();
    await partenze.getByRole("button", { name: /l'indirizzo di/ }).first().click();
    const indirizzo = page.getByRole("dialog", { name: /l'indirizzo di/ });
    await expect(indirizzo).toBeVisible();
    await scatta("indirizzo", tema);
    await indirizzo.getByRole("button", { name: "Chiudi" }).click();
    await expect(indirizzo).toHaveCount(0);

    // regalato da: il pannello col logo
    await vaiA(page, "regali");
    const regali = page.locator("section#regali");
    await regali.getByRole("list", { name: "Regalato da" }).getByRole("button", { name: /^Modifica / }).first().click();
    await expect(pannello).toBeVisible();
    await scatta("regalo", tema);
    await pannello.getByRole("button", { name: "Chiudi" }).click();
    await expect(pannello).toHaveCount(0);
  }
});

test("ux: le impostazioni di /modifica (stile, agenti, attività, account) a pagina intera, con le modifiche in sospeso", { tag: "@sessione" }, async ({ page, context, baseURL }, info) => {
  test.skip(onPreview(info.project.name), "solo in locale (l'accesso usa l'OTP di sviluppo)");
  test.setTimeout(300_000);
  mkdirSync(UX, { recursive: true });
  const telefono = info.project.name === "mobile";
  const scatta = async (vista: string, tema: string, intera = false) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(UX, `${vista}-${tema}-${info.project.name}.png`), animations: "disabled", fullPage: intera });
  };

  await page.goto("/");
  await accediComeGabrifila(page);
  for (const tema of TEMI) {
    await setTemaCookie(context, baseURL!, tema);
    await page.goto("/gabrifila/modifica");
    await idratata(page);

    // stile: a pagina intera, poi con una modifica in sospeso (mai salvata: gabrifila non cambia)
    await vaiA(page, "stile");
    const stile = page.locator("section#stile");
    const formTema = stile.getByRole("form", { name: "Tema", exact: true });
    await expect(formTema).toBeVisible();
    await scatta("stile-intera", tema, true);
    await formTema.getByRole("radio", { name: /Teatro/ }).check();
    await expect(formTema.getByText("Modifiche non salvate")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await scatta("stile-modifiche", tema);
    // lasciare /modifica con la modifica in sospeso: la guardia
    await page.getByRole("tab", { name: "I dati" }).click();
    const guardia = page.getByRole("dialog", { name: "Modifiche non salvate" });
    await expect(guardia).toBeVisible();
    await scatta("stile-guardia", tema);
    await guardia.getByRole("button", { name: "Continua a modificare" }).click();
    await expect(guardia).toBeHidden();
    if (!telefono) {
      await page.setViewportSize({ width: 1600, height: 1000 });
      await scatta("stile-1600", tema);
      await page.setViewportSize({ width: 1280, height: 1000 });
    }
    await formTema.getByRole("button", { name: "Annulla le modifiche" }).click();
    await expect(formTema.getByRole("button", { name: "Salva lo stile" })).toBeDisabled();

    // agenti
    await vaiA(page, "agenti");
    await expect(page.locator("section#agenti").getByTestId("mcp-url")).toBeVisible();
    await scatta("agenti-intera", tema, true);

    // attività: filtrata (dashboard, solo annullabili)
    await vaiA(page, "attivita");
    const attivita = page.locator("section#attivita");
    await expect(attivita.getByRole("list", { name: "Registro delle attività" })).toBeVisible();
    await attivita.getByRole("radio", { name: /^Dashboard/ }).check();
    await attivita.getByRole("switch", { name: "Solo annullabili" }).check();
    await scatta("attivita-filtri", tema);
    await attivita.getByRole("radio", { name: /^Tutte/ }).check();
    await attivita.getByRole("switch", { name: "Solo annullabili" }).uncheck();

    // account: a pagina intera, poi con il nome cambiato e non salvato
    await vaiA(page, "account");
    const formPagina = page.locator("section#account").getByRole("form", { name: "La tua pagina" });
    await expect(formPagina).toBeVisible();
    await scatta("account-intera", tema, true);
    const nome = formPagina.getByLabel("Nome sulla pagina");
    const prima = await nome.inputValue();
    await nome.fill(`${prima} (prova)`);
    await expect(formPagina.getByText("Modifiche non salvate")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await scatta("account-modifiche", tema);
    await formPagina.getByRole("button", { name: "Annulla le modifiche" }).click();
    await expect(nome).toHaveValue(prima);
  }
});

test.describe("ux: su una proprietaria di prova", { tag: "@sessione" }, () => {
  test.afterAll(({}, info) => {
    if (!onPreview(info.project.name)) convexRun("devtools:cleanupE2E");
  });

  test("ux: Concerti vuoto, «Da completare» lungo e la coda accanto all'Oracolo", async ({ page, context, baseURL }, info) => {
    test.skip(onPreview(info.project.name), "solo in locale (l'accesso usa l'OTP di sviluppo)");
    test.setTimeout(300_000);
    mkdirSync(UX, { recursive: true });
    const telefono = info.project.name === "mobile";
    const scatta = async (vista: string, tema: string) => {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(UX, `${vista}-${tema}-${info.project.name}.png`), animations: "disabled" });
    };
    const concerti = page.locator("section#concerti");
    const { handle } = await nuovoProprietario(page, { forma: "f", nome: "Scatti" });
    for (const tema of TEMI) {
      await setTemaCookie(context, baseURL!, tema);
      await page.goto(`/${handle}/modifica`);
      await idratata(page);
      await expect(concerti.getByText("Nessun concerto, per ora.")).toBeVisible();
      await scatta("vuoto", tema);
    }

    // cinque concerti passati da completare
    const concertiDiProva = ["Uno", "Due", "Tre", "Quattro", "Cinque"].map((n, i) => ({
      kind: "concert", date: `2025-0${i + 3}-1${i}`, artist: `Canarino ${n} con un nome lungo`, venue: "Fabrique", city: "Milano", with: ["Lu"],
    }));
    convexRun("devtools:preparaProfiloDiProva", { handle, persone: ["Lu"], partenze: ["Casa"], concerti: concertiDiProva });
    const box = page.getByRole("region", { name: "Da completare" });
    const m = page.getByRole("dialog", { name: "Modifica concerto" });
    for (const tema of TEMI) {
      await setTemaCookie(context, baseURL!, tema);
      await page.goto(`/${handle}/modifica`);
      await idratata(page);
      await expect(box.getByRole("listitem")).toHaveCount(telefono ? 3 : 5);
      await scatta("dacompletare", tema);
      if (telefono) continue;

      await page.setViewportSize({ width: 1440, height: 900 });
      const apri = page.getByRole("button", { name: /^Apri L'Oracolo in scrittura/ });
      if (await apri.isVisible()) await apri.click();
      await expect(page.getByRole("dialog", { name: "L'Oracolo in scrittura" })).toBeVisible();
      await box.getByRole("button", { name: "Completa in sequenza" }).click();
      await m.getByRole("button", { name: "Salva e vai al prossimo" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Concerto modificato" }).first()).toBeVisible();
      await expect(m.getByText("Da completare · 2 di 5")).toBeVisible();
      await scatta("coda-oracolo-1440", tema);
      await page.setViewportSize({ width: 1024, height: 800 });
      await m.getByRole("button", { name: "Salva e vai al prossimo" }).click();
      await expect(m.getByText("Da completare · 3 di 5")).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "Concerto modificato" }).first()).toBeVisible();
      await scatta("coda-oracolo-1024", tema);
      await m.getByRole("button", { name: "Annulla", exact: true }).click();
      await expect(m).toHaveCount(0);
      await page.setViewportSize({ width: 1280, height: 1000 });
    }
  });
});
