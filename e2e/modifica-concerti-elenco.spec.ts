/* ──────────────────────────────────────────────────────────────
   #concerti come elenco di lavoro e il suo modulo (spec ux-modifica
   §6.1–6.2), su una proprietaria nuova con cinque eventi (mai gabrifila):

   - l'elenco: pastiglie con i conteggi, anno, ricerca, «Nessun concerto
     con questi filtri.» → «Azzera i filtri», ordine per artista, i
     separatori (anni e «oggi») che non contano come voci, l'avviso dei km
     in attesa che porta all'indirizzo della partenza, «Duplica» dal menu
     ⋯ della riga, e la riga aggiunta da fuori che lampeggia;
   - «Da completare»: «Riduci» ricordato dopo un reload, «Solo questi
     nell'elenco», «Completa in sequenza» col focus sul primo campo che
     manca, «Salva e vai al prossimo» e «Tutto completo.» alla fine;
   - il modulo: il riepilogo «Controlla 3 campi: …» col focus sul primo,
     «in programma» che chiude «Com'è andata», le scorciatoie (Usate di
     recente, Frequenti, Come l'ultimo), concerto ↔ festival coi valori, e
     «Cancella…» dal menu ⋯ del pannello;
   - la concorrenza: un'altra scheda cambia il concerto aperto (form pulito
     → si ricarica; con modifiche → l'avviso e «Usa i dati nuovi»), poi lo
     cancella («Questo concerto non c'è più.», «Salva» spento);
   - il ponte dell'editor su un pannello già aperto («Duplica» con «Nuovo
     concerto» aperto: il pannello si rifà, e con modifiche decide la
     guardia), Esc nella ricerca che non chiude il pannello, ⌘/Ctrl+Invio
     con «Salva» spento che non scrive, e le notifiche accanto all'Oracolo
     agganciato che non coprono il piede del pannello (a 1440 la barra
     laterale diventa binario);
   - senza concerti una sola azione piena, «Aggiungi il primo concerto».

   @sessione, in locale (OTP di sviluppo).
   ────────────────────────────────────────────────────────────── */

import type { Page } from "@playwright/test";
import { idratata, nuovoProprietario } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { menuRiga, vaiA } from "./helpers/modifica.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

const CONCERTI = [
  { kind: "concert", date: "2024-03-10", artist: "Canarino Uno", venue: "Fabrique", city: "Milano", with: ["Lu"], voto: 4, vicinanza: 5, canzoniNote: 3, from: "Casa" },
  { kind: "concert", date: "2025-06-01", artist: "Canarino Due", venue: "Alcatraz", city: "Milano", with: ["Ale"] },
  { kind: "concert", date: "2025-02-01", artist: "Canarino Tre", venue: "Fabrique", city: "Milano", with: [], voto: 3 },
  { kind: "concert", date: "2027-05-20", artist: "Canarino Futuro", venue: "Fabrique", city: "Milano", with: ["Lu"] },
  {
    kind: "festival", name: "Canarino Fest", date: "12–13/07/2024", venue: "Fabrique", city: "Milano", from: "Casa",
    concerts: [
      { artist: "Set A", with: [], voto: 5, vicinanza: 6, canzoniNote: 5 },
      { artist: "Set B", with: [], voto: 4, vicinanza: 4, canzoniNote: 4 },
    ],
  },
];

/** Una proprietaria nuova con i cinque eventi, le persone e la partenza «Casa» (senza indirizzo), su /<handle>/modifica. */
async function proprietaria(page: Page): Promise<string> {
  const { handle } = await nuovoProprietario(page, { forma: "f", nome: "Elenco" });
  convexRun("devtools:preparaProfiloDiProva", { handle, persone: ["Lu", "Ale"], partenze: ["Casa"], concerti: CONCERTI });
  await page.goto(`/${handle}/modifica`);
  await idratata(page);
  return handle;
}

const concerti = (page: Page) => page.locator("section#concerti");
const elenco = (page: Page) => concerti(page).getByRole("list", { name: "Concerti e festival" });
const riga = (page: Page, testo: string) => elenco(page).getByRole("listitem").filter({ hasText: testo });
const avviso = (page: Page, testo: string) => expect(page.getByRole("status").filter({ hasText: testo }).first()).toBeVisible();

test.describe("#concerti: elenco e modulo", { tag: "@sessione" }, () => {
  test.beforeEach(({}, info) => test.skip(onPreview(info.project.name), "solo in locale (OTP di sviluppo)"));
  test.afterAll(({}, info) => {
    if (!onPreview(info.project.name)) convexRun("devtools:cleanupE2E");
  });

  test("l'elenco: filtri, anno, ricerca, ordine, separatori, km in attesa, «Duplica» e la riga che lampeggia", async ({ page }) => {
    test.setTimeout(180_000);
    const handle = await proprietaria(page);
    await expect(concerti(page).locator(".mf-intestazione-meta")).toHaveText("5 eventi · 1 in programma · 2 da completare");
    await expect(elenco(page).getByRole("listitem")).toHaveCount(5);
    // i separatori ci sono ma non contano come voci (aria-hidden)
    await expect(elenco(page).locator("li.mf-separatore").first()).toHaveText("2027 · 1");
    await expect(elenco(page).locator("li.mf-separatore-oggi")).toHaveCount(1);
    await expect(elenco(page).locator("li.mf-separatore").filter({ hasText: "2025" })).toHaveText("2025 · 2");

    // le pastiglie dei filtri, con i conteggi
    const filtri = concerti(page).getByRole("radiogroup", { name: "Filtra i concerti" });
    await filtri.getByRole("radio", { name: /In programma/ }).check();
    await expect(elenco(page).getByRole("listitem")).toHaveCount(1);
    await expect(riga(page, "Canarino Futuro")).toContainText("In programma");
    await expect(concerti(page).locator(".mf-strumenti-conta")).toHaveText("1 di 5");
    await filtri.getByRole("radio", { name: /Da completare/ }).check();
    await expect(elenco(page).getByRole("listitem")).toHaveCount(2);
    await filtri.getByRole("radio", { name: /Tutti/ }).check();
    await concerti(page).getByRole("combobox", { name: "Anno" }).selectOption("2024");
    await expect(elenco(page).getByRole("listitem")).toHaveCount(2);
    await expect(riga(page, "Canarino Fest")).toContainText("festival · 2 concerti");
    // nessun risultato: si azzera tutto
    await concerti(page).getByRole("searchbox", { name: "Cerca nei concerti" }).fill("nessuno così");
    await expect(concerti(page).getByText("Nessun concerto con questi filtri.")).toBeVisible();
    await concerti(page).getByRole("button", { name: "Azzera i filtri" }).click();
    await expect(elenco(page).getByRole("listitem")).toHaveCount(5);
    // per artista: niente separatori
    await concerti(page).getByRole("combobox", { name: "Ordina" }).selectOption("artista");
    await expect(elenco(page).getByRole("listitem").first()).toContainText("Canarino Due");
    await expect(elenco(page).locator("li.mf-separatore")).toHaveCount(0);
    await concerti(page).getByRole("combobox", { name: "Ordina" }).selectOption("recenti");

    // il viaggio di una riga, e l'avviso dei km in attesa (Casa non ha l'indirizzo)
    await expect(riga(page, "Canarino Uno")).toContainText("da Casa · km in attesa");
    const nota = concerti(page).getByRole("note");
    await expect(nota).toHaveText(/2 concerti hanno i km in attesa: la partenza «Casa» non ha ancora un indirizzo\./);

    // «Duplica» dal menu ⋯: un concerto nuovo con artista e venue, senza data; la guardia lo protegge
    await menuRiga(page, riga(page, "Canarino Tre"), "Duplica");
    const nuovo = page.getByRole("dialog", { name: "Nuovo concerto" });
    await expect(nuovo.locator('input[name="artist"]')).toHaveValue("Canarino Tre");
    await expect(nuovo.locator('input[name="date"]')).toHaveValue("");
    await expect(nuovo.getByText("Fabrique · Milano")).toBeVisible();
    await nuovo.getByRole("button", { name: "Annulla", exact: true }).click();
    await page.getByRole("dialog", { name: "Modifiche non salvate" }).getByRole("button", { name: "Esci senza salvare" }).click();
    await expect(nuovo).toHaveCount(0);

    // una riga aggiunta da fuori (un agente, l'Oracolo) lampeggia (gli e2e girano con reduced-motion, dove non lampeggia niente)
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => {
      const w = window as unknown as { lampi: string[] };
      w.lampi = [];
      new MutationObserver(m => {
        for (const x of m) if (x.target instanceof HTMLElement && x.target.hasAttribute("data-lampo")) w.lampi.push(x.target.textContent ?? "");
      }).observe(document.querySelector("section#concerti")!, { subtree: true, attributes: true, attributeFilter: ["data-lampo"], childList: true });
    });
    convexRun("devtools:addEntry", { handle, entry: { kind: "concert", date: "2026-01-10", artist: "Canarino Live", venue: "Fabrique", city: "Milano", with: [] } });
    await expect(riga(page, "Canarino Live")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => (window as unknown as { lampi: string[] }).lampi.join("|"))).toContain("Canarino Live");

    // «Imposta l'indirizzo» porta a Partenze, con l'id della partenza (solo l'id) nell'URL, e apre la sua finestra
    await nota.getByRole("button", { name: "Imposta l'indirizzo" }).click();
    await expect(page.locator("section#partenze")).toBeVisible();
    await expect(page).toHaveURL(/#partenze\?indirizzo=[A-Za-z0-9_-]+$/);
    const finestra = page.getByRole("dialog", { name: "Imposta l'indirizzo di Casa" });
    await expect(finestra).toBeVisible();
    await finestra.getByRole("button", { name: "Chiudi" }).click();
    await expect(finestra).toHaveCount(0);
    await expect(page).toHaveURL(/#partenze$/);
  });

  test("da completare: «Riduci» resta, «Solo questi», «Completa in sequenza» fino a «Tutto completo.»", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "il percorso è lo stesso sul telefono");
    test.setTimeout(180_000);
    await proprietaria(page);
    const box = page.getByRole("region", { name: "Da completare" });
    await expect(box.getByRole("listitem")).toHaveCount(2);

    // ridotto a una riga, anche dopo un reload
    await box.getByRole("button", { name: "Riduci" }).click();
    await expect(box).toContainText("2 concerti da completare");
    await expect(box.getByRole("listitem")).toHaveCount(0);
    // il focus passa al pulsante nuovo, non si perde sul body
    await expect(box.getByRole("button", { name: "Mostra" })).toBeFocused();
    await page.reload();
    await idratata(page);
    await expect(box).toContainText("2 concerti da completare");
    await box.getByRole("button", { name: "Mostra" }).click();
    await expect(box.getByRole("listitem")).toHaveCount(2);
    await expect(box.getByRole("button", { name: "Riduci" })).toBeFocused();

    // «Solo questi nell'elenco» accende la pastiglia
    await box.getByRole("button", { name: "Solo questi nell'elenco" }).click();
    await expect(concerti(page).getByRole("radio", { name: /Da completare/ })).toBeChecked();
    await expect(elenco(page).getByRole("listitem")).toHaveCount(2);

    // in sequenza: il primo, «Salva e vai al prossimo», il secondo, «Salva», fine
    await box.getByRole("button", { name: "Completa in sequenza" }).click();
    const m = page.getByRole("dialog", { name: "Modifica concerto" });
    await expect(m.getByText("Da completare · 1 di 2")).toBeVisible();
    await expect(m.locator('input[name="artist"]')).toHaveValue("Canarino Due");
    await expect(m.getByText("Mancano: voto, posizione, canzoni note.")).toBeVisible();
    // in coda il focus parte dal primo campo che manca
    await expect(m.locator('input[name="voto"][value="5"]')).toBeFocused();
    await m.locator('input[name="voto"][value="4"]').check();
    await m.locator('input[name="vicinanza"][value="6"]').check();
    await m.locator('input[name="canzoniNote"][value="3"]').check();
    await m.locator('select[name="from"]').selectOption("Casa");
    await m.getByRole("button", { name: "Salva e vai al prossimo" }).click();
    await avviso(page, "Concerto modificato");
    await expect(m.getByText("Da completare · 2 di 2")).toBeVisible();
    await expect(m.locator('input[name="artist"]')).toHaveValue("Canarino Tre");
    await expect(m.getByRole("button", { name: "Salva e vai al prossimo" })).toHaveCount(0);
    await expect(m.locator('input[name="vicinanza"][value="6"]')).toBeFocused();
    await m.locator('input[name="vicinanza"][value="5"]').check();
    await m.locator('input[name="canzoniNote"][value="na"]').check();
    await m.locator('select[name="from"]').selectOption("Casa");
    await m.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(m).toHaveCount(0);
    await avviso(page, "Tutto completo.");
    await expect(box).toHaveCount(0);
    await expect(page).toHaveURL(/\/modifica(#concerti)?$/);
  });

  test("il modulo: riepilogo degli errori, in programma, scorciatoie, concerto ↔ festival, «Cancella…» dal pannello", async ({ page }) => {
    test.setTimeout(180_000);
    await proprietaria(page);
    await concerti(page).getByRole("button", { name: "Aggiungi un concerto" }).click();
    const d = page.getByRole("dialog", { name: "Nuovo concerto" });
    await expect(d.locator('input[name="artist"]')).toBeFocused();

    // un invio vuoto: il riepilogo in testa e il focus sul primo campo
    await d.getByRole("button", { name: "Salva", exact: true }).click();
    const riepilogo = d.getByRole("alert").filter({ hasText: "Controlla" });
    await expect(riepilogo).toHaveText("Controlla 3 campi: Artista, Data, Venue.");
    await expect(d.locator('input[name="artist"]')).toBeFocused();
    await riepilogo.getByRole("button", { name: "Venue" }).click();
    await expect(d.getByLabel("Cerca una venue")).toBeFocused();

    // una data in programma: «Com'è andata» si compila dopo, ma si può aprire
    await d.locator('input[name="artist"]').fill("Canarino Nuovo");
    await d.locator('input[name="date"]').fill("2027-01-15");
    await expect(d.getByText("in programma", { exact: true })).toBeVisible();
    await expect(d.getByText("Si compila dopo la serata.")).toBeVisible();
    await expect(d.locator('input[name="voto"][value="5"]')).toBeHidden();
    await d.getByRole("button", { name: "Compila adesso" }).click();
    await d.locator('input[name="voto"][value="5"]').check();
    await expect(d.locator('input[name="voto"][value="5"]')).toBeChecked();
    // «Togli» sparisce col voto: il focus passa alla prima stella, non si perde
    await d.getByRole("button", { name: "Togli voto" }).click();
    await expect(d.locator('input[name="voto"][value="5"]')).not.toBeChecked();
    await expect(d.locator('input[name="voto"][value="5"]')).toBeFocused();
    await d.locator('input[name="voto"][value="5"]').check();

    // le scorciatoie: la venue più recente, un compagno frequente, la partenza dell'ultimo concerto
    await d.getByRole("group", { name: "Usate di recente" }).getByRole("button", { name: /^Fabrique/ }).click();
    await expect(d.getByText("Fabrique · Milano")).toBeVisible();
    await d.getByRole("group", { name: "Frequenti" }).getByRole("button", { name: "Lu", exact: true }).click();
    await expect(d.getByRole("list", { name: "Compagni" })).toContainText("Lu");
    await d.getByRole("button", { name: "Come l'ultimo: Casa" }).click();
    await expect(d.locator('select[name="from"]')).toHaveValue("Casa");
    await expect(d.getByRole("button", { name: "Imposta l'indirizzo di Casa" })).toBeVisible();

    // concerto → festival: l'artista diventa il primo concerto; e ritorno (il pannello cambia: click, non check)
    await d.getByRole("radiogroup", { name: "Tipo" }).getByRole("radio", { name: "Festival" }).click();
    const f = page.getByRole("dialog", { name: "Nuovo festival" });
    await expect(f.locator('input[name="concerts[0].artist"]')).toHaveValue("Canarino Nuovo");
    await expect(f.locator('input[name="date"]')).toHaveValue("15/01/2027");
    await expect(f.locator('select[name="from"]')).toHaveValue("Casa");
    await expect(f.getByRole("radio", { name: "Festival" })).toBeFocused();
    await f.getByRole("radiogroup", { name: "Tipo" }).getByRole("radio", { name: "Concerto" }).click();
    await expect(d.locator('input[name="artist"]')).toHaveValue("Canarino Nuovo");
    await expect(d.locator('input[name="date"]')).toHaveValue("2027-01-15");
    await expect(d.locator('input[name="voto"][value="5"]')).toBeChecked();

    await d.getByRole("button", { name: "Salva", exact: true }).click();
    await avviso(page, "Concerto aggiunto: i km arrivano quando la partenza ha un indirizzo.");
    await expect(d).toHaveCount(0);

    // «Cancella…» dal menu ⋯ del pannello: conferma, notifica, il pannello si chiude
    await riga(page, "Canarino Nuovo").getByRole("button", { name: /^Modifica Canarino Nuovo/ }).click();
    const m = page.getByRole("dialog", { name: "Modifica concerto" });
    await m.getByRole("button", { name: "Altre azioni", exact: true }).click();
    await page.getByRole("menuitem", { name: "Cancella…" }).click();
    await page.getByRole("dialog", { name: "Cancellare il concerto?" }).getByRole("button", { name: "Cancella", exact: true }).click();
    await avviso(page, "Concerto cancellato.");
    await expect(m).toHaveCount(0);
    await expect(riga(page, "Canarino Nuovo")).toHaveCount(0);
  });

  test("concorrenza: un'altra scheda cambia e poi cancella il concerto aperto", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "una volta sola");
    test.setTimeout(180_000);
    const handle = await proprietaria(page);
    const altra = await page.context().newPage();
    await altra.goto(`/${handle}/modifica`);
    await idratata(altra);
    await vaiA(altra, "concerti");

    // pulito: il pannello si ricarica da solo
    await riga(page, "Canarino Futuro").getByRole("button", { name: /^Modifica Canarino Futuro/ }).click();
    const a = page.getByRole("dialog", { name: "Modifica concerto" });
    await expect(a.locator('input[name="artist"]')).toHaveValue("Canarino Futuro");
    await riga(altra, "Canarino Futuro").getByRole("button", { name: /^Modifica Canarino Futuro/ }).click();
    const b = altra.getByRole("dialog", { name: "Modifica concerto" });
    await b.locator('input[name="artist"]').fill("Canarino Futuro bis");
    await b.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(b).toHaveCount(0);
    await expect(a.locator('input[name="artist"]')).toHaveValue("Canarino Futuro bis", { timeout: 20_000 });

    // con una modifica: l'avviso, e «Usa i dati nuovi»
    await a.locator('textarea[name="comments"]').fill("Il mio ricordo");
    await riga(altra, "Canarino Futuro bis").getByRole("button", { name: /^Modifica Canarino Futuro bis/ }).click();
    await b.locator('input[name="artist"]').fill("Canarino Futuro ter");
    await b.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(b).toHaveCount(0);
    const cambiato = a.getByRole("status").filter({ hasText: "Nel frattempo questo concerto è cambiato" });
    await expect(cambiato).toBeVisible({ timeout: 20_000 });
    await expect(a.locator('input[name="artist"]')).toHaveValue("Canarino Futuro bis");
    await cambiato.getByRole("button", { name: "Usa i dati nuovi" }).click();
    await expect(a.locator('input[name="artist"]')).toHaveValue("Canarino Futuro ter");
    await expect(a.locator('textarea[name="comments"]')).toHaveValue("");

    // cancellato da fuori: l'avviso, e «Salva» spento
    const id = convexRun<{ entries: { _id: string; artist?: string }[] }>("pages:byHandle", { handle }).entries.find(e => e.artist === "Canarino Futuro ter")!._id;
    convexRun("devtools:removeEntry", { handle, entryId: id });
    await expect(a.getByText("Questo concerto non c'è più.")).toBeVisible({ timeout: 20_000 });
    await expect(a.getByRole("button", { name: "Salva", exact: true })).toBeDisabled();
    await altra.close();
  });

  test("il ponte su un pannello già aperto, Esc nella ricerca, ⌘/Ctrl+Invio e le notifiche accanto all'Oracolo", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "il pannello non modale accanto all'elenco c'è solo da 1024 px");
    test.setTimeout(240_000);
    const handle = await proprietaria(page);
    // un terzo concerto da completare, per due «Salva e vai al prossimo»
    convexRun("devtools:addEntry", { handle, entry: { kind: "concert", date: "2025-09-09", artist: "Canarino Quattro", venue: "Alcatraz", city: "Milano", with: [] } });
    await expect(riga(page, "Canarino Quattro")).toBeVisible({ timeout: 20_000 });
    const nuovo = page.getByRole("dialog", { name: "Nuovo concerto" });
    const guardia = page.getByRole("dialog", { name: "Modifiche non salvate" });
    /** «Duplica» dal ⋯ di una riga: col pannello aperto il ⋯ gli sta sotto, ci si arriva con la tastiera. */
    const duplica = async (artista: string) => {
      await riga(page, artista).getByRole("button", { name: /^Altre azioni per/ }).focus();
      await page.keyboard.press("Enter");
      await page.getByRole("menuitem", { name: "Duplica" }).click();
    };

    // «Nuovo concerto» vuoto, poi «Duplica»: il pannello si rifà coi valori del duplicato (non resta vuoto)
    await concerti(page).getByRole("button", { name: "Aggiungi un concerto" }).click();
    await expect(nuovo.locator('input[name="artist"]')).toHaveValue("");
    await duplica("Canarino Tre");
    await expect(nuovo.locator('input[name="artist"]')).toHaveValue("Canarino Tre");
    await expect(nuovo.getByText("Fabrique · Milano")).toBeVisible();
    await expect(nuovo.getByRole("radiogroup", { name: "Tipo" })).toHaveCount(0);
    // un duplicato non si perde in silenzio: un altro «Duplica» passa dalla guardia, e «Continua a modificare» tiene tutto
    await nuovo.locator('textarea[name="comments"]').fill("Da non perdere");
    await duplica("Canarino Uno");
    await guardia.getByRole("button", { name: "Continua a modificare" }).click();
    await expect(guardia).toHaveCount(0);
    await expect(nuovo.locator('input[name="artist"]')).toHaveValue("Canarino Tre");
    await expect(nuovo.locator('textarea[name="comments"]')).toHaveValue("Da non perdere");
    await duplica("Canarino Uno");
    await guardia.getByRole("button", { name: "Esci senza salvare" }).click();
    await expect(nuovo.locator('input[name="artist"]')).toHaveValue("Canarino Uno");
    await expect(nuovo.locator('textarea[name="comments"]')).toHaveValue("");
    await expect(nuovo.locator('select[name="from"]')).toHaveValue("Casa");
    await nuovo.getByRole("button", { name: "Annulla", exact: true }).click();
    await guardia.getByRole("button", { name: "Esci senza salvare" }).click();
    await expect(nuovo).toHaveCount(0);

    // Esc nella ricerca dell'elenco è della ricerca: il pannello aperto accanto resta, senza guardia
    await concerti(page).getByRole("button", { name: "Aggiungi un concerto" }).click();
    await nuovo.locator('input[name="artist"]').fill("Canarino Esc");
    const cerca = concerti(page).getByRole("searchbox", { name: "Cerca nei concerti" });
    await cerca.fill("Can");
    await cerca.press("Escape");
    await expect(guardia).toHaveCount(0);
    await expect(nuovo.locator('input[name="artist"]')).toHaveValue("Canarino Esc");
    // Esc nel pannello invece lo chiude (con la guardia, ha modifiche)
    await nuovo.locator('input[name="artist"]').press("Escape");
    await guardia.getByRole("button", { name: "Esci senza salvare" }).click();
    await expect(nuovo).toHaveCount(0);
    await cerca.fill("");

    // ⌘/Ctrl+Invio con «Salva» spento (il nome è quello di prima): nessuna scrittura, nessuna notifica
    await vaiA(page, "persone");
    await page.locator("section#persone").getByRole("button", { name: "Apri Lu" }).click();
    const lu = page.getByRole("dialog", { name: "Lu" });
    await expect(lu.getByRole("button", { name: "Salva", exact: true })).toBeDisabled();
    await lu.locator('input[name="name"]').press("ControlOrMeta+Enter");
    await page.waitForTimeout(1500);
    await expect(page.getByRole("status").filter({ hasText: "Persona rinominata" })).toHaveCount(0);
    await expect(lu).toBeVisible();
    await lu.getByRole("button", { name: "Chiudi" }).click();
    await vaiA(page, "concerti");

    // le notifiche accanto all'Oracolo agganciato non vanno sul piede del pannello: in coda quella del concerto di prima cadrebbe su «Salva» del prossimo
    const piede = () =>
      page.evaluate(() => {
        const d = document.querySelector("#mf-pannelli > dialog.mf-pannello[open]");
        if (!d) return "nessun pannello";
        const coperti: string[] = [];
        for (const b of d.querySelectorAll<HTMLButtonElement>(".mf-pannello-piedi button")) {
          const r = b.getBoundingClientRect();
          for (const f of [0.1, 0.5, 0.9]) {
            const el = document.elementFromPoint(r.left + r.width * f, r.top + r.height / 2);
            if (!el || !b.contains(el)) coperti.push(`${b.textContent} ${f}`);
          }
        }
        return coperti.join(", ") || "libero";
      });
    const app = page.locator(".mf-app");
    const m = page.getByRole("dialog", { name: "Modifica concerto" });
    const box = page.getByRole("region", { name: "Da completare" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: /^Apri L'Oracolo in scrittura/ }).click();
    await expect(page.locator("dialog#oracolo")).toBeVisible();
    await expect(app).toHaveAttribute("data-nav", "barra");
    await box.getByRole("button", { name: "Completa in sequenza" }).click();
    await expect(m.getByText("Da completare · 1 di 3")).toBeVisible();
    // Oracolo, pannello e barra laterale non ci stanno tutti: la barra diventa binario e l'elenco resta in vista
    await expect(app).toHaveAttribute("data-nav", "binario");
    await m.getByRole("button", { name: "Salva e vai al prossimo" }).click();
    await avviso(page, "Concerto modificato");
    await expect(m.getByText("Da completare · 2 di 3")).toBeVisible();
    await expect.poll(piede).toBe("libero");
    // a 1024 il pannello prende tutta la colonna: la notifica sta sopra il suo piede
    await page.setViewportSize({ width: 1024, height: 800 });
    await m.getByRole("button", { name: "Salva e vai al prossimo" }).click();
    await avviso(page, "Concerto modificato");
    await expect(m.getByText("Da completare · 3 di 3")).toBeVisible();
    await expect.poll(piede).toBe("libero");
    await m.getByRole("button", { name: "Annulla", exact: true }).click();
    await expect(m).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(app).toHaveAttribute("data-nav", "barra");
  });

  test("senza concerti: una sola azione piena, «Aggiungi il primo concerto»", async ({ page }) => {
    test.setTimeout(120_000);
    const { handle } = await nuovoProprietario(page, { forma: "f", nome: "Vuota" });
    await page.goto(`/${handle}/modifica`);
    await idratata(page);
    await expect(concerti(page).getByText("Nessun concerto, per ora.")).toBeVisible();
    const piene = concerti(page).locator(".mod-primario:visible, .mf-fab:visible");
    await expect(piene).toHaveCount(1);
    await expect(piene).toHaveText("Aggiungi il primo concerto");
    // in testata «Aggiungi un concerto» resta, a contorno (sul telefono anche senza il pulsante flottante)
    await expect(concerti(page).getByRole("button", { name: "Aggiungi un concerto" })).toBeVisible();
  });
});
