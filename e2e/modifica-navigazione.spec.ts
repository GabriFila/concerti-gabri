/* ──────────────────────────────────────────────────────────────
   La navigazione dell'app di modifica (spec ux-modifica §2, §4, §5.1,
   §7, §11), su desktop (1280 px) e telefono (Pixel 7):

   - ogni `#<vista>` mostra la sua <section> col suo titolo, segnata nella
     navigazione (barra laterale; sul telefono la scheda o «Altro»);
     senza hash Concerti con l'URL che resta /modifica; un hash che non è
     una vista porta a Concerti e sparisce; avanti e indietro tra le viste;
   - i pannelli stanno nell'hash: `?nuovo=concerto` apre «Nuovo
     concerto» e «indietro» lo chiude; con modifiche non salvate Esc, un
     clic nella navigazione o «indietro» chiedono «Modifiche non salvate»;
   - desktop: l'Oracolo agganciato non è modale, l'elenco resta
     cliccabile e il pannello si apre accanto; resta aperto cambiando
     vista e dopo un reload, e chiuso resta chiuso;
   - telefono: barra in basso, «Altro» e l'Oracolo a tutto schermo che
     «indietro» chiude, il pannello a tutto schermo, niente scroll
     orizzontale a 360 px;
   - le notifiche: «Persona aggiunta.» con «Annulla», che toglie la
     persona (il focus va al titolo della vista e «Annullato.» se ne va
     da sola) e in «Attività» la voce risulta annullata; `/` porta alla
     ricerca; il menu ⋯ della testata con la tastiera, e «Chiedi
     all'Oracolo» che precompila la casella senza mandare niente; il
     numero dei concerti da completare sulla navigazione;
   - gli elenchi (§6.4–6.7): #persone con l'aggiunta rapida («Esiste
     già»), cerca, filtri e ordine, il pannello della persona (`?apri=`:
     rinomina, i suoi concerti, unisci, «non c'è più») e il menu ⋯
     (Rinomina col focus sul nome, Vedi i concerti, Cancella…); #wishlist
     con aggiunte, ↑ ↓ col focus che resta, «Sposta in cima» e «L'ho
     visto» → il concerto → «Togli X dalla wishlist» dalla notifica;
     #partenze con la finestra dell'indirizzo nell'hash (`?indirizzo=`);
     #regali con «Carica il logo» dalla notifica al pannello;
   - nessun errore di idratazione.

   @sessione, su una proprietaria nuova (mai gabrifila).
   ────────────────────────────────────────────────────────────── */

import type { Page } from "@playwright/test";
import { idratata, nuovoProprietario } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { watchErrors } from "./helpers/idratazione.ts";
import { menuRiga, vaiA } from "./helpers/modifica.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

const VISTE = ["concerti", "wishlist", "persone", "partenze", "regali", "stile", "agenti", "attivita", "account"];
const TITOLI: Record<string, string> = {
  concerti: "Concerti", wishlist: "Wishlist", persone: "Persone", partenze: "Partenze", regali: "Regalato da",
  stile: "Stile", agenti: "Agenti", attivita: "Attività", account: "Account",
};
const SCHEDE = new Set(["concerti", "wishlist", "attivita"]);
const ARTISTA = "Canarino in vista";

/** Una proprietaria nuova con un concerto passato, già su /<handle>/modifica. */
async function proprietaria(page: Page): Promise<string> {
  const { handle } = await nuovoProprietario(page, { forma: "f", nome: "Navigazione" });
  convexRun("devtools:addEntry", {
    handle,
    entry: { kind: "concert", date: "2025-05-10", artist: ARTISTA, venue: "Fabrique", city: "Milano", with: [] },
  });
  return handle;
}

/** Per gli elenchi: tre persone (Bea in nessun concerto), la partenza «Casa» senza indirizzo e tre concerti. */
const ELENCHI = [
  { kind: "concert", date: "2024-03-10", artist: "Canarino Uno", venue: "Fabrique", city: "Milano", with: ["Lu", "Ale"], voto: 4, vicinanza: 5, canzoniNote: 3, from: "Casa" },
  { kind: "concert", date: "2025-02-01", artist: "Canarino Due", venue: "Alcatraz", city: "Milano", with: ["Lu"] },
  { kind: "concert", date: "2027-05-20", artist: "Canarino Futuro", venue: "Fabrique", city: "Milano", with: ["Lu"] },
];

async function conElenchi(page: Page): Promise<string> {
  const { handle } = await nuovoProprietario(page, { forma: "f", nome: "Elenchi" });
  convexRun("devtools:preparaProfiloDiProva", { handle, persone: ["Lu", "Ale", "Bea"], partenze: ["Casa"], concerti: ELENCHI });
  return handle;
}

/** La vista è quella giusta: la sua sezione si vede, col titolo, e le altre no. */
async function inVista(page: Page, id: string) {
  await expect(page.locator(`section#${id}`)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: TITOLI[id], exact: true })).toBeVisible();
  for (const altra of VISTE) if (altra !== id) await expect(page.locator(`section#${altra}`)).toBeHidden();
}

/** La voce di navigazione della vista è quella corrente. */
async function segnata(page: Page, id: string, telefono: boolean) {
  if (!telefono) {
    await expect(page.locator(`nav.modifica-indice a[href$="#${id}"]`)).toHaveAttribute("aria-current", "page");
    return;
  }
  const schede = page.getByRole("navigation", { name: "Sezioni principali" });
  if (SCHEDE.has(id)) await expect(schede.locator(`a[href$="#${id}"]`)).toHaveAttribute("aria-current", "page");
  else await expect(schede.getByRole("button", { name: "Altro", exact: true })).toHaveAttribute("aria-current", "page");
}

test.describe("navigazione di /modifica", { tag: "@sessione" }, () => {
  test.beforeEach(({}, info) => test.skip(onPreview(info.project.name), "solo in locale (OTP di sviluppo)"));
  test.afterAll(({}, info) => {
    if (!onPreview(info.project.name)) convexRun("devtools:cleanupE2E");
  });

  test("le 9 viste dall'hash, Concerti senza hash, hash sconosciuto, avanti e indietro", async ({ page }, info) => {
    test.setTimeout(180_000);
    const telefono = info.project.name === "mobile";
    const errori = watchErrors(page);
    const handle = await proprietaria(page);

    // senza hash: Concerti, e l'URL resta /modifica
    await page.goto(`/${handle}/modifica`);
    await idratata(page);
    await inVista(page, "concerti");
    await expect(page).toHaveURL(new RegExp(`/${handle}/modifica$`));
    await segnata(page, "concerti", telefono);

    // i link diretti a ogni vista
    for (const id of VISTE) {
      await page.goto(`/${handle}/modifica#${id}`);
      await inVista(page, id);
      await segnata(page, id, telefono);
    }

    // una vista che non c'è: Concerti, e l'hash sparisce
    await page.goto(`/${handle}/modifica#boh`);
    await inVista(page, "concerti");
    await expect(page).toHaveURL(new RegExp(`/${handle}/modifica$`));

    // da caricamento pulito, con la navigazione dell'app: avanti e indietro
    await page.goto(`/${handle}/modifica#concerti`);
    await page.reload();
    await idratata(page);
    await vaiA(page, "persone");
    await vaiA(page, "attivita");
    await expect(page).toHaveURL(new RegExp(`/${handle}/modifica#attivita$`));
    await page.goBack();
    await inVista(page, "persone");
    await page.goBack();
    await inVista(page, "concerti");
    await page.goForward();
    await inVista(page, "persone");
    // cambiando vista il focus va al titolo
    await vaiA(page, "wishlist");
    await expect(page.locator("#wishlist-titolo")).toBeFocused();

    expect(errori.hydration()).toEqual([]);
  });

  test("il pannello sta nell'hash: indietro lo chiude, la guardia protegge le modifiche", async ({ page }, info) => {
    test.setTimeout(180_000);
    const telefono = info.project.name === "mobile";
    const handle = await proprietaria(page);
    const concerti = page.locator("section#concerti");
    const nuovo = page.getByRole("dialog", { name: "Nuovo concerto" });
    const guardia = page.getByRole("dialog", { name: "Modifiche non salvate" });

    // link diretto al pannello; «indietro» lo chiude restando su Concerti
    await page.goto(`/${handle}/modifica`);
    await idratata(page);
    await page.goto(`/${handle}/modifica#concerti?nuovo=concerto`);
    await expect(nuovo).toBeVisible();
    await expect(nuovo.locator('input[name="artist"]')).toBeFocused();
    await page.goBack();
    await expect(nuovo).toHaveCount(0);
    await inVista(page, "concerti");

    // dal pulsante: un pannello pulito si chiude senza domande
    await concerti.getByRole("button", { name: "Aggiungi un concerto" }).click();
    await expect(nuovo).toBeVisible();
    await expect(page).toHaveURL(/#concerti\?nuovo=concerto$/);
    if (telefono) {
      // sul telefono il pannello è a tutto schermo
      const box = await nuovo.boundingBox();
      const vp = page.viewportSize()!;
      expect(box && Math.round(box.width)).toBe(vp.width);
      expect(box && Math.round(box.height)).toBe(vp.height);
    } else {
      // sul desktop sta a destra, non è modale e l'elenco resta cliccabile
      expect(await nuovo.evaluate(d => d.matches(":modal"))).toBe(false);
    }
    await nuovo.getByRole("button", { name: "Annulla" }).click();
    await expect(nuovo).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/${handle}/modifica(#concerti)?$`));

    // con una modifica: Esc chiede, «Continua a modificare» tiene il valore
    await concerti.getByRole("button", { name: "Aggiungi un concerto" }).click();
    await nuovo.locator('input[name="artist"]').fill("Da non perdere");
    await expect(nuovo.getByText("Modifiche non salvate")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(guardia).toBeVisible();
    await expect(guardia.getByText("Se esci adesso perdi le modifiche.")).toBeVisible();
    await expect(guardia.getByRole("button", { name: "Continua a modificare" })).toBeFocused();
    await guardia.getByRole("button", { name: "Continua a modificare" }).click();
    await expect(guardia).toHaveCount(0);
    await expect(nuovo.locator('input[name="artist"]')).toHaveValue("Da non perdere");
    await expect(page).toHaveURL(/#concerti\?nuovo=concerto$/);

    // anche «indietro» passa dalla guardia
    await page.goBack();
    await expect(guardia).toBeVisible();
    await guardia.getByRole("button", { name: "Continua a modificare" }).click();
    await expect(nuovo.locator('input[name="artist"]')).toHaveValue("Da non perdere");
    await expect(page).toHaveURL(/#concerti\?nuovo=concerto$/);

    if (!telefono) {
      // un clic nella navigazione, col pannello sporco: prima la guardia
      await page.locator('nav.modifica-indice a[href$="#wishlist"]').click();
      await expect(guardia).toBeVisible();
      await guardia.getByRole("button", { name: "Continua a modificare" }).click();
      await expect(page.locator("section#concerti")).toBeVisible();
      await expect(nuovo.locator('input[name="artist"]')).toHaveValue("Da non perdere");
    }

    // «Esci senza salvare» chiude, e il focus torna al pulsante che l'aveva aperto
    await nuovo.locator('input[name="artist"]').focus();
    await page.keyboard.press("Escape");
    await guardia.getByRole("button", { name: "Esci senza salvare" }).click();
    await expect(nuovo).toHaveCount(0);
    await expect(concerti.getByRole("button", { name: "Aggiungi un concerto" })).toBeFocused();
    expect(convexRun<{ entries: { artist?: string }[] }>("pages:byHandle", { handle }).entries.map(e => e.artist)).toEqual([ARTISTA]);
  });

  test("desktop: l'Oracolo agganciato non è modale, resta tra le viste e dopo un reload", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "l'aggancio c'è solo da 1024 px");
    test.setTimeout(180_000);
    const handle = await proprietaria(page);
    const oracolo = page.getByRole("dialog", { name: "Il Tour manager" });
    await page.goto(`/${handle}/modifica`);
    await idratata(page);

    // a 1280 px parte chiuso (alla prima visita è aperto solo da 1440)
    await expect(oracolo).toBeHidden();
    await page.getByRole("button", { name: "Apri il Tour manager" }).click();
    await expect(oracolo).toBeVisible();
    await expect(oracolo.getByRole("textbox", { name: "Messaggio per il Tour manager" })).toBeFocused();
    expect(await oracolo.evaluate(d => d.id === "oracolo" && !d.matches(":modal"))).toBe(true);
    await expect(page.getByRole("button", { name: "Chiudi il Tour manager" })).toHaveAttribute("aria-expanded", "true");

    // l'elenco resta cliccabile, e il pannello si apre accanto all'Oracolo
    await page.locator("section#concerti").getByRole("button", { name: `Modifica ${ARTISTA} del 10/05/2025` }).click();
    const pannello = page.getByRole("dialog", { name: "Modifica concerto" });
    await expect(pannello).toBeVisible();
    const [p, o] = [await pannello.boundingBox(), await oracolo.boundingBox()];
    expect(p!.x + p!.width).toBeLessThanOrEqual(o!.x + 1);
    await pannello.getByRole("button", { name: "Chiudi" }).click();
    await expect(pannello).toHaveCount(0);

    // resta aperto cambiando vista e dopo un reload
    await vaiA(page, "attivita");
    await expect(oracolo).toBeVisible();
    await page.reload();
    await idratata(page);
    await expect(oracolo).toBeVisible();
    await expect(page.locator("section#attivita")).toBeVisible();

    // chiuso resta chiuso
    await page.getByRole("button", { name: "Chiudi il Tour manager" }).click();
    await expect(oracolo).toBeHidden();
    await page.reload();
    await idratata(page);
    await expect(page.locator("section#attivita")).toBeVisible();
    await expect(oracolo).toBeHidden();
  });

  test("telefono: barra in basso, «Altro» e l'Oracolo a tutto schermo che «indietro» chiude", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "solo sul telefono");
    test.setTimeout(240_000);
    const handle = await proprietaria(page);
    await page.goto(`/${handle}/modifica`);
    await idratata(page);

    const schede = page.getByRole("navigation", { name: "Sezioni principali" });
    for (const nome of ["Concerti", "Wishlist", "Attività"]) await expect(schede.getByRole("link", { name: nome })).toBeVisible();
    await expect(schede.getByRole("button", { name: "Apri il Tour manager" })).toBeVisible();
    await expect(schede.getByRole("button", { name: "Altro", exact: true })).toBeVisible();
    await expect(page.locator("nav.modifica-indice")).toBeHidden();

    // «Altro»: il foglio con le altre viste; «indietro» lo chiude senza lasciare /modifica
    await schede.getByRole("button", { name: "Altro", exact: true }).click();
    const altro = page.getByRole("dialog", { name: "Tutte le sezioni" });
    await expect(altro).toBeVisible();
    await expect(altro.getByRole("navigation", { name: "Altre sezioni" }).getByRole("link")).toHaveCount(6);
    await page.goBack();
    await expect(altro).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/${handle}/modifica$`));
    await inVista(page, "concerti");
    // scegliere una vista chiude il foglio, e il focus va al titolo della vista
    await schede.getByRole("button", { name: "Altro", exact: true }).click();
    await altro.getByRole("link", { name: "Persone" }).click();
    await expect(altro).toHaveCount(0);
    await inVista(page, "persone");
    await expect(page.locator("#persone-titolo")).toBeFocused();
    // la stessa vista, scelta di nuovo: il foglio si chiude lo stesso, e si riapre
    await schede.getByRole("button", { name: "Altro", exact: true }).click();
    await altro.getByRole("link", { name: "Persone" }).click();
    await expect(altro).toHaveCount(0);
    await schede.getByRole("button", { name: "Altro", exact: true }).click();
    await expect(altro).toBeVisible();
    await page.goBack();
    await expect(altro).toHaveCount(0);
    await inVista(page, "persone");

    // l'Oracolo: a tutto schermo; «indietro» lo chiude e il focus torna al pulsante
    const pulsante = schede.getByRole("button", { name: "Apri il Tour manager" });
    await pulsante.click();
    const oracolo = page.getByRole("dialog", { name: "Il Tour manager" });
    await expect(oracolo).toBeVisible();
    const box = await oracolo.boundingBox();
    const vp = page.viewportSize()!;
    expect([Math.round(box!.x), Math.round(box!.y), Math.round(box!.width), Math.round(box!.height)]).toEqual([0, 0, vp.width, vp.height]);
    await page.goBack();
    await expect(oracolo).toBeHidden();
    await inVista(page, "persone");
    await expect(schede.getByRole("button", { name: "Apri il Tour manager" })).toBeFocused();

    // niente scroll orizzontale a 360 px, in nessuna vista
    await page.setViewportSize({ width: 360, height: 780 });
    for (const id of VISTE) {
      await vaiA(page, id);
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), id).toBe(true);
    }
  });

  test("notifiche con «Annulla», `/` per cercare, il menu ⋯ della testata e i segni della navigazione", async ({ page }, info) => {
    test.setTimeout(180_000);
    const telefono = info.project.name === "mobile";
    const errori = watchErrors(page);
    const handle = await proprietaria(page);
    await page.goto(`/${handle}/modifica#persone`);
    await idratata(page);

    // il concerto di prova è passato e senza voto: la navigazione lo conta
    const voceConcerti = telefono
      ? page.getByRole("navigation", { name: "Sezioni principali" }).locator('a[href$="#concerti"]')
      : page.locator('nav.modifica-indice a[href$="#concerti"]');
    await expect(voceConcerti).toHaveAccessibleName(/1 da completare/);

    // una persona nuova: la notifica (una sola, la regione non è role=status) con «Annulla»
    const persone = page.locator("section#persone");
    await persone.getByLabel("Nuova persona").fill("Canarino N.");
    await persone.getByRole("button", { name: "Aggiungi" }).click();
    const notifica = page.getByRole("status").filter({ hasText: "Persona aggiunta." });
    await expect(notifica).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Notifiche" }).getByRole("status")).toHaveCount(1);
    await expect(persone.getByRole("list", { name: "Persone" })).toContainText("Canarino N.");
    await notifica.getByRole("button", { name: "Annulla", exact: true }).click();
    const annullato = page.getByRole("status").filter({ hasText: "Annullato." });
    await expect(annullato).toBeVisible();
    await expect(persone.getByText("Canarino N.")).toHaveCount(0);
    // «Annulla» è sparito col focus (Chrome non manda blur): il focus va al titolo della vista, e «Annullato.» se ne va da sola (6 s)
    await expect(page.locator("#persone-titolo")).toBeFocused();
    await page.mouse.move(0, 0);
    await expect(annullato).toHaveCount(0, { timeout: 12_000 });
    // in «Attività» l'aggiunta risulta annullata (e c'è la voce dell'annullamento)
    await vaiA(page, "attivita");
    const registro = page.locator("section#attivita").getByRole("list", { name: "Registro delle attività" });
    await expect(registro.locator("li.mod-voce-annullata").filter({ hasText: "persona aggiunta: Canarino N." })).toContainText("annullata");
    await expect(registro.getByRole("listitem").filter({ hasText: "annullato: persona aggiunta: Canarino N." })).toHaveCount(1);

    // `/` porta alla ricerca della vista; dentro un campo si scrive e basta
    await vaiA(page, "concerti");
    const concerti = page.locator("section#concerti");
    const cerca = concerti.getByRole("searchbox", { name: "Cerca nei concerti" });
    await page.keyboard.press("/");
    await expect(cerca).toBeFocused();
    await page.keyboard.type("Can/");
    await expect(cerca).toHaveValue("Can/");
    await cerca.fill("");

    // il menu ⋯ della testata: si apre con la tastiera, Esc lo chiude e il focus torna al pulsante
    const altre = concerti.getByRole("button", { name: "Altre azioni", exact: true });
    await altre.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Altre azioni" });
    await expect(menu).toBeVisible();
    // sul telefono le azioni secondarie della testata stanno qui, prima delle altre
    const voci = telefono ? ["Aggiungi un festival", "Importa da un file", "Chiedi al Tour manager", "Chiudi"] : ["Importa da un file", "Chiedi al Tour manager"];
    await expect(menu.getByRole("menuitem")).toHaveText(voci);
    await expect(menu.getByRole("menuitem", { name: voci[0] })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: voci[1] })).toBeFocused();
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: voci[voci.length - 1] })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(altre).toBeFocused();

    // «Chiedi al Tour manager»: si apre con la casella precompilata, e non manda niente
    await altre.click();
    await menu.getByRole("menuitem", { name: "Chiedi al Tour manager" }).click();
    const oracolo = page.getByRole("dialog", { name: "Il Tour manager" });
    await expect(oracolo).toBeVisible();
    await expect(oracolo.getByRole("textbox", { name: "Messaggio per il Tour manager" })).toHaveValue("Aggiungi un concerto: ");
    await expect(oracolo.locator(".chat-row")).toHaveCount(0);

    expect(errori.hydration()).toEqual([]);
  });
  test("#persone: aggiunta rapida, cerca e filtri, il pannello della persona e il menu ⋯", async ({ page }, info) => {
    test.setTimeout(240_000);
    const telefono = info.project.name === "mobile";
    const errori = watchErrors(page);
    const handle = await conElenchi(page);
    await page.goto(`/${handle}/modifica#persone`);
    await idratata(page);
    const persone = page.locator("section#persone");
    const elenco = persone.getByRole("list", { name: "Persone" });
    const riga = (nome: string) => elenco.getByRole("listitem").filter({ has: page.getByRole("button", { name: `Apri ${nome}`, exact: true }) });
    await expect(elenco.getByRole("listitem")).toHaveCount(3);
    await expect(persone.locator(".mf-intestazione-meta")).toHaveText("3 persone");

    // un nome che c'è già si dice mentre si scrive, e non parte niente
    const nuova = persone.getByLabel("Nuova persona");
    await nuova.fill("  lu ");
    await expect(persone.getByText("Esiste già «Lu»")).toBeVisible();
    await persone.getByRole("button", { name: "Aggiungi" }).click();
    await expect(nuova).toHaveValue("  lu ");
    // un nome nuovo: la notifica, il campo vuoto che tiene il focus
    await nuova.fill("Cami");
    await persone.getByRole("button", { name: "Aggiungi" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Persona aggiunta." })).toBeVisible();
    await expect(nuova).toHaveValue("");
    await expect(nuova).toBeFocused();
    await expect(elenco.getByRole("listitem")).toHaveCount(4);

    // cerca (senza maiuscole), «Mai in un concerto», ordine
    const cerca = persone.getByRole("searchbox", { name: "Cerca una persona" });
    await cerca.fill("CA");
    await expect(elenco.getByRole("listitem")).toHaveCount(1);
    await expect(persone.locator(".mf-strumenti-conta")).toHaveText("1 di 4");
    await cerca.fill("");
    const filtri = persone.getByRole("radiogroup", { name: "Filtra le persone" });
    await filtri.getByRole("radio", { name: /Mai in un concerto/ }).check();
    await expect(elenco.getByRole("button", { name: /^Apri / })).toHaveText(["Bea", "Cami"]);
    await filtri.getByRole("radio", { name: /Tutte/ }).check();
    await persone.getByRole("combobox", { name: "Ordina" }).selectOption("piu");
    await expect(elenco.getByRole("button", { name: /^Apri / })).toHaveText(["Lu", "Ale", "Bea", "Cami"]);
    await expect(riga("Lu")).toContainText("3 concerti");
    if (!telefono) await expect(riga("Lu").locator(".mf-riga-ultima")).toHaveText("ultima volta 01/02/2025");

    // il pannello della persona: nell'hash, coi suoi concerti; rinominarla
    await elenco.getByRole("button", { name: "Apri Lu" }).click();
    const lu = page.getByRole("dialog", { name: "Lu", exact: true });
    await expect(lu).toBeVisible();
    await expect(page).toHaveURL(/#persone\?apri=[A-Za-z0-9_-]+$/);
    if (!telefono) await expect(riga("Lu")).toHaveAttribute("aria-current", "true");
    await expect(lu.getByText("3 concerti · ultima volta 01/02/2025")).toBeVisible();
    await expect(lu.locator(".mf-collegamenti").getByRole("button")).toHaveText([
      /20\/05\/2027\s*Canarino Futuro/, /01\/02\/2025\s*Canarino Due/, /10\/03\/2024\s*Canarino Uno/,
    ]);
    await lu.getByLabel("Nome").fill("Lu B.");
    await lu.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Persona rinominata: i concerti seguono da soli." })).toBeVisible();
    await expect(lu).toHaveCount(0);
    await expect(riga("Lu B.")).toBeVisible();

    // un concerto della persona apre il suo pannello; chiuso, si torna a Persone
    await elenco.getByRole("button", { name: "Apri Ale" }).click();
    const ale = page.getByRole("dialog", { name: "Ale", exact: true });
    await ale.getByRole("button", { name: /Canarino Uno/ }).click();
    const concerto = page.getByRole("dialog", { name: "Modifica concerto" });
    await expect(concerto.locator('input[name="artist"]')).toHaveValue("Canarino Uno");
    await concerto.getByRole("button", { name: "Chiudi" }).click();
    await expect(concerto).toHaveCount(0);
    await expect(persone).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${handle}/modifica#persone$`));

    // il menu ⋯: «Rinomina» apre il pannello col focus sul nome
    await menuRiga(page, riga("Cami"), "Rinomina");
    const cami = page.getByRole("dialog", { name: "Cami", exact: true });
    await expect(cami.getByLabel("Nome")).toBeFocused();
    await cami.getByRole("button", { name: "Annulla" }).click();
    await expect(cami).toHaveCount(0);
    // «Cancella…» di chi è in un concerto: bloccato, con i concerti
    await menuRiga(page, riga("Ale"), "Cancella…");
    const blocco = page.getByRole("dialog", { name: "Cancellare Ale?" });
    await expect(blocco).toContainText("Canarino Uno");
    await blocco.getByRole("button", { name: "Ho capito" }).click();
    await expect(blocco).toHaveCount(0);

    // unire dal pannello: un passo solo, e il pannello si chiude
    await elenco.getByRole("button", { name: "Apri Bea" }).click();
    const bea = page.getByRole("dialog", { name: "Bea", exact: true });
    await bea.getByRole("button", { name: "Unisci…" }).click();
    const unisci = page.getByRole("dialog", { name: "Unire Bea a un'altra persona?" });
    await unisci.getByRole("combobox").selectOption({ label: "Cami" });
    await unisci.getByRole("button", { name: "Unisci", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Persone unite: Bea → Cami." })).toBeVisible();
    await expect(bea).toHaveCount(0);
    await expect(elenco.getByRole("button", { name: "Apri Bea" })).toHaveCount(0);

    // «Vedi i concerti»: #concerti col filtro «Con X»
    await menuRiga(page, riga("Lu B."), "Vedi i concerti");
    const concerti = page.locator("section#concerti");
    await expect(concerti.getByRole("button", { name: "Togli il filtro «Con Lu B.»" })).toBeVisible();
    await expect(concerti.getByRole("list", { name: "Concerti e festival" }).getByRole("listitem")).toHaveCount(3);
    await expect(page).toHaveURL(new RegExp(`/${handle}/modifica#concerti$`));

    // un link a una persona che non c'è
    await page.goto(`/${handle}/modifica#persone?apri=nonesiste12345`);
    await expect(page.getByRole("dialog", { name: "Persona", exact: true })).toContainText("Questa persona non c'è più");

    expect(errori.hydration()).toEqual([]);
  });

  test("#wishlist, #partenze e #regali: aggiunte, spostamenti, «L'ho visto», l'indirizzo nell'hash e il logo dalla notifica", async ({ page }) => {
    test.setTimeout(240_000);
    const errori = watchErrors(page);
    const handle = await conElenchi(page);
    await page.goto(`/${handle}/modifica#wishlist`);
    await idratata(page);

    // wishlist: tre artisti; un nome già in lista si dice mentre si scrive
    const wishlist = page.locator("section#wishlist");
    const campo = wishlist.getByLabel("Aggiungi un artista");
    const lista = wishlist.getByRole("list", { name: "Wishlist" });
    const voci = lista.locator(".mf-voce-nome");
    for (const a of ["Canarino Wish", "Secondo W", "Terzo W"]) {
      await campo.fill(a);
      await wishlist.getByRole("button", { name: "Aggiungi", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: `${a} è nella wishlist.` })).toBeVisible();
      await expect(campo).toHaveValue("");
    }
    await expect(voci).toHaveText(["Canarino Wish", "Secondo W", "Terzo W"]);
    await campo.fill("canarino WISH");
    await expect(wishlist.getByText("È già nella lista")).toBeVisible();
    await campo.fill("");

    // ↓: la riga scende e il focus resta sul suo pulsante; ⋯ «Sposta in cima»
    await lista.getByRole("button", { name: "Sposta giù Canarino Wish" }).click();
    await expect(voci).toHaveText(["Secondo W", "Canarino Wish", "Terzo W"]);
    await expect(lista.getByRole("button", { name: "Sposta giù Canarino Wish" })).toBeFocused();
    await menuRiga(page, lista.getByRole("listitem").filter({ hasText: "Terzo W" }), "Sposta in cima");
    await expect(voci).toHaveText(["Terzo W", "Secondo W", "Canarino Wish"]);

    // «L'ho visto»: il form del concerto con l'artista; salvato, la notifica lo toglie dalla wishlist
    await menuRiga(page, lista.getByRole("listitem").filter({ hasText: "Canarino Wish" }), "L'ho visto: aggiungi il concerto");
    const nuovo = page.getByRole("dialog", { name: "Nuovo concerto" });
    await expect(nuovo.locator('input[name="artist"]')).toHaveValue("Canarino Wish");
    await nuovo.locator('input[name="date"]').fill("2025-04-12");
    await nuovo.getByLabel("Cerca una venue").fill("Fabrique");
    await nuovo.getByRole("list", { name: "Venue del catalogo" }).getByRole("button", { name: /^Fabrique/ }).first().click();
    await nuovo.getByRole("button", { name: "Salva", exact: true }).click();
    const aggiunto = page.getByRole("status").filter({ hasText: "Concerto aggiunto." });
    await aggiunto.getByRole("button", { name: "Togli Canarino Wish dalla wishlist" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Canarino Wish tolto dalla wishlist." })).toBeVisible();
    await vaiA(page, "wishlist");
    await expect(voci).toHaveText(["Terzo W", "Secondo W"]);

    // partenze: la finestra dell'indirizzo sta nell'hash, «indietro» la chiude
    await vaiA(page, "partenze");
    const partenze = page.locator("section#partenze");
    const casa = partenze.getByRole("listitem").filter({ hasText: "Casa" });
    await expect(casa).toContainText("indirizzo mancante");
    await casa.getByRole("button", { name: "Imposta l'indirizzo di Casa" }).click();
    const indirizzo = page.getByRole("dialog", { name: "Imposta l'indirizzo di Casa" });
    await expect(indirizzo).toBeVisible();
    await expect(page).toHaveURL(/#partenze\?indirizzo=[A-Za-z0-9_-]+$/);
    await page.goBack();
    await expect(indirizzo).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/${handle}/modifica#partenze$`));
    // una partenza nuova apre subito la sua finestra; un id che non c'è torna a #partenze
    await partenze.getByLabel("Nuova partenza").fill("Ufficio");
    await partenze.getByRole("button", { name: "Aggiungi" }).click();
    const ufficio = page.getByRole("dialog", { name: "Imposta l'indirizzo di Ufficio" });
    await expect(ufficio).toBeVisible();
    await ufficio.getByRole("button", { name: "Chiudi" }).click();
    await expect(ufficio).toHaveCount(0);
    await expect(partenze.getByRole("listitem").filter({ hasText: "Ufficio" })).toContainText("indirizzo mancante");
    await page.goto(`/${handle}/modifica#partenze?indirizzo=nonesiste12345`);
    await expect(page).toHaveURL(new RegExp(`/${handle}/modifica#partenze$`));
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // regalato da: «Carica il logo» dalla notifica apre il pannello, col focus sul logo
    await vaiA(page, "regali");
    const regali = page.locator("section#regali");
    await regali.getByLabel("Nome").fill("Canarino Radio");
    await regali.getByRole("button", { name: "Aggiungi", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Aggiunto: ora puoi caricare il logo." }).getByRole("button", { name: "Carica il logo" }).click();
    const pannello = page.getByRole("dialog", { name: "Modifica Canarino Radio" });
    await expect(pannello).toBeVisible();
    await expect(page).toHaveURL(/#regali\?apri=[A-Za-z0-9_-]+$/);
    await expect(pannello.getByRole("button", { name: "Carica il logo di Canarino Radio" })).toBeFocused();
    await expect(pannello).toContainText("png, jpeg o webp fino a 256 KB. Un cambio di logo non si annulla.");
    await pannello.getByLabel("Nome").fill("Canarino Radio 2");
    await pannello.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Modificato." })).toBeVisible();
    await expect(pannello).toHaveCount(0);
    await expect(regali.getByRole("listitem").filter({ hasText: "Canarino Radio 2" })).toContainText("0 concerti");

    expect(errori.hydration()).toEqual([]);
  });
});
