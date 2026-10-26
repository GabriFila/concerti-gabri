/* ──────────────────────────────────────────────────────────────
   La scheda dell'Oracolo in scrittura (spec ux-agente §9), con il
   modello finto (ORACOLO_FAKE=1: il copione di src/server/oracolo/finto.ts)
   e una proprietaria nuova (nuovoProprietario), mai gabrifila.

   Desktop:
   - un concerto nuovo: «Marco Rossi» è nome e cognome (Salva bloccato) →
     «Usa «Marco R.»» → chip «nuova» → Posizione «6 · Transenna» nella
     riga → «Salva concerto»: un lotto firmato Oracolo (concerto e
     persona), «Aggiunto», «Apri» apre il form del concerto, «Annulla»
     toglie concerto e persona e la conferma diventa «Annullato»;
   - una venue fuori catalogo: «Scegli la venue», il candidato dello stub
     di Nominatim, «Aggiungi e usa», salvato con quella venue;
   - una modifica: solo la riga Voto «5 → 4», «Salva modifiche (1)»;
   - da tastiera: la scheda nuova non prende il focus; Invio apre una
     riga, Esc la chiude rimettendo com'era (l'Oracolo resta aperto),
     Invio in un testo passa alla prossima riga vuota;
   - «Scarta»: «Va bene, non lo salvo.» e niente scritto;
   - una correzione scritta nella chat: UNA ripresa (nessun messaggio
     nuovo), la scheda vecchia «Sostituita dalla tua correzione» con la
     nota, la nuova col voto detto e la modifica fatta a mano prima;
     con solo una cancellazione in sospeso, un messaggio parte lo stesso
     e la domanda dice «Non confermato»;
   - «Nuova chat» con una scheda toccata chiede prima («Resta» / «Scarta e
     apri una nuova chat»); uscire da Modifica («Sul palco») pure
     («Modifiche non salvate»), cambiare vista no;
   - «Annulla» di una scheda il cui nome nuovo ora è in un altro concerto
     (`in_uso`): dice quale nome e cosa fare, senza rimandare ad Attività;
   - una conversazione troppo lunga (413 alla ripresa del Salva): la chat e
     la scheda lo dicono, niente «Riprova», «Apri una nuova chat»;
   - la casella: Invio manda, ⇧/⌥/Ctrl/⌘+Invio vanno a capo;
   - due schede nello stesso run: la barra del lotto, «Da salvare» tolta a
     una → «Salva 1 scheda» → UNA ripresa con due decisioni, una salvata e
     una scartata; poi «Salva tutte (2)» e «Annulla tutti»;
   - un festival: la lineup di tre, un voto nel suo editor, ↑ per
     riordinare, × (spento a due) → «Salva festival» con quei due concerti;
     ⋯ «È un festival» e «Fanne un concerto singolo»;
   - una modifica che toglie un concerto dal festival blocca finché non si
     sceglie «Toglilo»;
   - i doppioni: lo stesso artista lo stesso giorno → «Aggiorna quello» →
     la scheda di modifica, nessun concerto nuovo; un giorno prima è solo
     un avviso;
   - «Modulo completo»: «Scheda: nuovo concerto» accanto all'Oracolo, Esc
     chiude solo il modulo; finché è aperto Salva e Scarta sono spenti e
     una correzione nella chat non parte; «Usa nella scheda» riporta
     l'artista cambiato nella scheda, senza scrivere niente. Una riga
     dell'elenco aperta sopra il modulo tiene il focus; «Aggiungi un
     concerto» sopra il modulo apre un concerto nuovo vuoto.
   Telefono (Pixel 7): la scheda a tutta larghezza fuori dalla nuvoletta,
   campi a 16 px, il salvataggio, «Apri» col foglio del concerto sopra la
   chat e la chat di nuovo lì quando lo si chiude; su un festival lungo il
   piede col Salva resta in vista scorrendo, e smette di stare appiccicato
   mentre si scrive in un campo; a 320 px niente scorre di lato.

   Tutte @sessione. `ORACOLO_FAKE=1 node scripts/wt.mjs exec -- pnpm e2e e2e/oracolo-scheda.spec.ts`.
   ────────────────────────────────────────────────────────────── */

import type { Page } from "@playwright/test";
import { nuovoProprietario, unico } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { vaiA } from "./helpers/modifica.ts";
import { stubNominatim } from "./helpers/nominatim.ts";
import { expect, test } from "./helpers/test.ts";

interface Richiesta { threadId?: string; resume?: { interruptId: string; status: string; payload?: unknown }[]; messages?: { role: string; content?: unknown }[] }

const chat = (page: Page) => page.getByRole("dialog", { name: "Il Tour manager" });
const casella = (page: Page) => chat(page).getByRole("textbox", { name: "Messaggio per il Tour manager" });
async function scrivi(page: Page, testo: string) {
  await casella(page).fill(testo);
  await chat(page).getByRole("button", { name: "Invia" }).click();
}
const scheda = (page: Page, nome: RegExp | string) => chat(page).getByRole("group", { name: nome });
/** Due frame: le richieste di focus in requestAnimationFrame sono passate. */
const dueFrame = (page: Page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const concerti = (page: Page) => page.locator("section#concerti").getByRole("list", { name: "Concerti e festival" });

/** Le POST a /api/chat/scrittura della pagina, col loro corpo. */
function registra(page: Page): Richiesta[] {
  const richieste: Richiesta[] = [];
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/chat/scrittura") richieste.push(r.postDataJSON());
  });
  return richieste;
}

/** Il concerto nei dati della pagina pubblica (per i campi che l'elenco non mostra). */
function datiDi(handle: string, artista: string): Record<string, unknown> | undefined {
  return tuttiDi(handle, artista)[0];
}
/** Tutti i concerti di quell'artista (o i festival con quel nome) nei dati della pagina pubblica. */
function tuttiDi(handle: string, titolo: string): Record<string, unknown>[] {
  const p = convexRun<{ entries: Record<string, unknown>[] } | undefined>("pages:byHandle", { handle });
  return (p?.entries ?? []).filter(e => e.artist === titolo || e.name === titolo);
}

async function apriOracolo(page: Page) {
  const telefono = !(await page.locator("nav.modifica-indice").isVisible());
  const pulsante = telefono
    ? page.getByRole("navigation", { name: "Sezioni principali" }).getByRole("button", { name: "Apri il Tour manager" })
    : page.getByRole("button", { name: "Apri il Tour manager" });
  await pulsante.click();
  await expect(chat(page)).toBeVisible();
}

test.describe("la scheda dell'Oracolo", { tag: "@sessione" }, () => {
  test.beforeEach(() => {
    test.skip(process.env.ORACOLO_FAKE !== "1", "serve l'Oracolo finto: ORACOLO_FAKE=1");
    convexRun("chat:azzeraLimitiPerTest");
  });
  // una proprietaria nuova per test: alla fine via tutte (le `e2e-*`)
  test.afterAll(() => {
    if (process.env.ORACOLO_FAKE === "1") convexRun("devtools:cleanupE2E");
  });

  test.describe("desktop", () => {
    test.beforeEach(({}, info) => {
      test.skip(info.project.name !== "desktop", "i flussi completi una volta sola, sul desktop");
    });

    test("nuovo concerto: nome e cognome sistemato, posizione nella riga, un lotto, Apri e Annulla", async ({ page }) => {
      test.setTimeout(240_000);
      const { handle } = await nuovoProprietario(page, { forma: "f", nome: "Schedina" });
      const artista = `Canarino scheda ${unico()}`;
      await page.goto(`/${handle}/modifica`);
      await apriOracolo(page);

      await scrivi(page, `Ho visto ${artista} al Fabrique con Marco Rossi, voto 5`);
      const card = scheda(page, `Scheda: nuovo concerto ${artista}`);
      await expect(card).toBeVisible();
      // la scheda sta fuori dalla nuvoletta, e niente è scritto prima del Salva
      await expect(chat(page).locator(".chat-msg .scheda")).toHaveCount(0);
      await expect(card).toContainText("«Marco Rossi» è nome e cognome: sulla pagina pubblica usa un soprannome.");
      await expect(card.getByRole("button", { name: "Salva concerto" })).toBeDisabled();
      await expect(card).toContainText("Prima sistema: persone.");
      await expect(concerti(page).getByText(artista)).toHaveCount(0);

      // da tastiera: il pulsante sparisce col problema, e il focus resta nella scheda (sulla riga Con), non sul <body>
      await card.getByRole("button", { name: "Usa «Marco R.»" }).focus();
      await page.keyboard.press("Enter");
      await expect(card.getByRole("button", { name: "Aggiungi un altro compagno" })).toBeFocused();
      const chip = card.getByRole("list", { name: "Compagni" }).getByRole("listitem").filter({ hasText: "Marco R." });
      await expect(chip).toContainText("nuova");
      await expect(card).toContainText("Persona nuova: «Marco R.» si aggiunge alle tue persone quando salvi.");

      // la posizione dalla sua riga, senza aprire il form
      await card.getByRole("button", { name: "Aggiungi posizione" }).click();
      await card.getByRole("radiogroup", { name: "Posizione" }).getByRole("radio", { name: "6 · Transenna" }).check();
      await expect(card.getByRole("button", { name: /^Posizione 6 · Transenna/ })).toBeVisible();
      await expect(card).toContainText("Mancano: canzoni note, partenza, prezzo.");

      await card.getByRole("button", { name: "Salva concerto" }).click();
      await expect(chat(page).getByText("Fatto: concerto aggiunto.")).toBeVisible();
      const conferma = chat(page).locator(".scheda-esito").filter({ hasText: `Aggiunto · ${artista}` });
      await expect(conferma).toBeVisible();
      await expect(conferma).toContainText("+ Marco R. tra le persone");
      await expect(concerti(page).getByText(artista)).toBeVisible();
      expect(datiDi(handle, artista)).toMatchObject({ vicinanza: 6, voto: 5 });

      // un lotto solo, firmato Oracolo: il concerto e la persona nuova
      await vaiA(page, "persone");
      await expect(page.locator("section#persone").getByText("Marco R.", { exact: true })).toBeVisible();
      await vaiA(page, "attivita");
      const voci = page.locator("section#attivita .mod-voce");
      const aggiunto = voci.filter({ hasText: `aggiunto: ${artista}` });
      const persona = voci.filter({ hasText: "Marco R." });
      await expect(aggiunto.locator(".mod-autore")).toHaveText("Tour manager");
      await expect(persona.locator(".mod-autore")).toHaveText("Tour manager");
      await expect(aggiunto).toContainText("in blocco");
      await expect(persona).toContainText("in blocco");
      // l'Oracolo agganciato resta aperto, con la stessa chat
      await expect(conferma).toBeVisible();
      await vaiA(page, "concerti");

      // «Apri»: il form del concerto, accanto all'Oracolo
      await conferma.getByRole("button", { name: "Apri" }).click();
      const pannello = page.getByRole("dialog", { name: "Modifica concerto" });
      await expect(pannello).toBeVisible();
      await expect(pannello.locator("input[name=artist]")).toHaveValue(artista);
      await expect(chat(page)).toBeVisible();
      await pannello.getByRole("button", { name: "Chiudi" }).click();
      await expect(pannello).toHaveCount(0);

      // «Annulla»: via il concerto e la persona creata con lui
      await conferma.getByRole("button", { name: "Annulla" }).click();
      await expect(chat(page).getByText(`Annullato: «${artista}» non è più in archivio.`)).toBeVisible();
      await expect(concerti(page).getByText(artista)).toHaveCount(0);
      await vaiA(page, "persone");
      await expect(page.locator("section#persone").getByText("Marco R.", { exact: true })).toHaveCount(0);
    });

    test("venue fuori catalogo: il candidato di OpenStreetMap, «Aggiungi e usa»", async ({ page }) => {
      test.setTimeout(180_000);
      const spegni = await stubNominatim();
      try {
        const { handle } = await nuovoProprietario(page);
        const artista = `Canarino venue ${unico()}`;
        const locale = `Locale Prova ${unico()}`;
        await page.goto(`/${handle}/modifica`);
        await apriOracolo(page);

        await scrivi(page, `Ho visto ${artista} al ${locale}`);
        const card = scheda(page, `Scheda: nuovo concerto ${artista}`);
        await expect(card).toContainText(`Scegli la venue: «${locale}» (Milano) non è ancora nel catalogo.`);
        await expect(card.getByRole("button", { name: "Salva concerto" })).toBeDisabled();
        const candidati = card.getByRole("list", { name: "Venue da OpenStreetMap" });
        await expect(candidati.getByRole("listitem")).toHaveCount(1);
        await candidati.getByRole("button", { name: "Aggiungi e usa" }).click();
        await expect(card.getByRole("button", { name: "Salva concerto" })).toBeEnabled();
        await expect(card.getByRole("button", { name: new RegExp(`^Venue ${locale}`) })).toBeVisible();

        await card.getByRole("button", { name: "Salva concerto" }).click();
        await expect(chat(page).getByText("Fatto: concerto aggiunto.")).toBeVisible();
        await expect(chat(page).locator(".scheda-esito")).toContainText(locale);
        await expect(concerti(page).getByRole("listitem").filter({ hasText: artista })).toContainText(locale);
      } finally {
        spegni();
      }
    });

    test("modifica: solo la riga cambiata, «Salva modifiche (1)»", async ({ page }) => {
      test.setTimeout(180_000);
      const { handle } = await nuovoProprietario(page);
      const artista = `Canarino modifica ${unico()}`;
      convexRun("devtools:addEntry", { handle, entry: { kind: "concert", date: "2025-05-10", artist: artista, venue: "Fabrique", city: "Milano", with: [], voto: 5 } });
      await page.goto(`/${handle}/modifica`);
      await apriOracolo(page);

      await scrivi(page, `Cambia il voto di ${artista} in 4`);
      const card = scheda(page, `Scheda: modifica del concerto ${artista}`);
      await expect(card).toBeVisible();
      const righe = card.locator(".scheda-righe .scheda-riga:not(.muta)");
      await expect(righe).toHaveCount(1);
      await expect(righe).toContainText("Voto");
      await expect(righe.locator(".scheda-prima")).toContainText("★★★★★ 5");
      await expect(righe.locator(".scheda-dopo")).toContainText("★★★★ 4");

      await card.getByRole("button", { name: "Salva modifiche (1)" }).click();
      await expect(chat(page).getByText("Fatto: concerto modificato.")).toBeVisible();
      await expect(chat(page).locator(".scheda-esito")).toContainText(`Modificato · ${artista}`);
      expect(datiDi(handle, artista)).toMatchObject({ voto: 4 });
    });

    test("da tastiera (righe, Invio, Esc) e Scarta: niente scritto", async ({ page }) => {
      const { handle } = await nuovoProprietario(page);
      const artista = `Canarino scartato ${unico()}`;
      await page.goto(`/${handle}/modifica`);
      await apriOracolo(page);

      // mandato con Invio: la scheda nuova arriva ma non prende il focus, che resta nella casella
      await casella(page).fill(`Aggiungi il concerto di ${artista}`);
      await casella(page).press("Enter");
      const card = scheda(page, `Scheda: nuovo concerto ${artista}`);
      await expect(card.getByRole("button", { name: "Salva concerto" })).toBeEnabled();
      await expect(casella(page)).toBeFocused();

      // da tastiera: Invio apre la riga, Esc la chiude rimettendo com'era (l'Oracolo resta aperto),
      // Invio nel testo passa alla prossima riga vuota
      const riga = card.getByRole("button", { name: /^Artista/ });
      await riga.focus();
      await page.keyboard.press("Enter");
      const campo = card.getByRole("textbox", { name: "Artista" });
      await expect(campo).toBeFocused();
      await page.keyboard.press("End");
      await page.keyboard.type(" bis");
      await expect(riga).toContainText(`${artista} bis`);
      await page.keyboard.press("Escape");
      await expect(campo).toHaveCount(0);
      await expect(chat(page)).toBeVisible();
      await expect(riga).toBeFocused();
      await expect(riga).not.toContainText(`${artista} bis`);
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
      await expect(card.getByRole("combobox", { name: "Aggiungi un compagno" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(card.getByRole("button", { name: "Aggiungi compagni" })).toBeFocused();
      // in programma: «Dopo la serata» si apre e il focus va alla riga Voto (il pulsante sparisce)
      await card.getByRole("button", { name: /^Dopo la serata/ }).focus();
      await page.keyboard.press("Enter");
      await expect(card.getByRole("button", { name: "Aggiungi voto" })).toBeFocused();

      // Scarta da tastiera: la scheda diventa una riga, e il focus va lì
      await card.getByRole("button", { name: "Scarta", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(chat(page).getByText("Va bene, non lo salvo.")).toBeVisible();
      const scartata = chat(page).locator(".scheda-chiusa").filter({ hasText: `Scheda scartata · ${artista}` });
      await expect(scartata).toBeVisible();
      await expect(scartata).toBeFocused();
      // la risposta del modello sta sopra: la scheda resta l'ultima cosa del turno
      expect(await chat(page).locator(".chat-body").evaluate(el => {
        const figli = [...el.children];
        const risposta = figli.findIndex(c => c.textContent?.includes("Va bene, non lo salvo."));
        const scheda = figli.findIndex(c => c.querySelector(".scheda-chiusa"));
        return risposta !== -1 && risposta < scheda;
      })).toBe(true);
      await expect(concerti(page).getByText(artista)).toHaveCount(0);
      expect(datiDi(handle, artista)).toBeUndefined();
    });

    test("correzione scritta nella chat: una ripresa sola, la bozza toccata resta; altre approvazioni cadono", async ({ page }) => {
      test.setTimeout(240_000);
      const richieste = registra(page);
      const { handle } = await nuovoProprietario(page);
      const artista = `Canarino corretto ${unico()}`;
      await page.goto(`/${handle}/modifica`);
      await apriOracolo(page);

      await scrivi(page, `Ho visto ${artista} al Fabrique con Sara, voto 5`);
      const vecchia = scheda(page, `Scheda: nuovo concerto ${artista}`);
      await expect(vecchia).toBeVisible();
      await expect(casella(page)).toHaveAttribute("placeholder", /^Correggi a parole/);
      await expect(chat(page).getByRole("status").filter({ hasText: "Scheda aperta: correggila lì e premi Salva" })).toBeVisible();
      // una modifica a mano, prima della correzione
      await vecchia.getByRole("button", { name: "Aggiungi posizione" }).click();
      await vecchia.getByRole("radio", { name: "5 · Sottopalco" }).check();
      await expect(vecchia.locator(".scheda-tuo")).toHaveCount(1);

      const prima = richieste.length;
      await scrivi(page, "voto 3");
      await expect(chat(page).getByText("Sostituita dalla tua correzione")).toBeVisible();
      await expect(chat(page).locator(".scheda-nota-utente")).toHaveText("voto 3");
      const nuova = chat(page).locator("article.scheda[data-stato=bozza]");
      await expect(nuova).toHaveCount(1);
      await expect(nuova.getByRole("button", { name: /^Voto 3/ })).toBeVisible();
      await expect(nuova.getByRole("button", { name: /^Posizione 5 · Sottopalco/ })).toBeVisible();
      // una sola richiesta: la ripresa con la correzione (e la bozza), nessun messaggio nuovo
      expect(richieste.length - prima).toBe(1);
      const ripresa = richieste[prima];
      expect(ripresa.resume).toHaveLength(1);
      expect(ripresa.resume![0].payload).toMatchObject({ approved: false, payload: { motivo: "correzione", nota: "voto 3", bozza: { vicinanza: 5, voto: 5 } } });

      await nuova.getByRole("button", { name: "Salva concerto" }).click();
      await expect(chat(page).getByText("Fatto: concerto aggiunto.")).toBeVisible();
      expect(datiDi(handle, artista)).toMatchObject({ voto: 3, vicinanza: 5 });

      // con solo una cancellazione in sospeso un messaggio nuovo parte lo stesso, e la domanda cade
      await scrivi(page, `Cancella il concerto di ${artista}`);
      const domanda = chat(page).getByRole("group", { name: "Conferma richiesta" });
      await expect(domanda).toContainText("Cancellare il concerto");
      await scrivi(page, "Quanti concerti ho visto?");
      await expect(domanda).toContainText("Non confermato: hai scritto un altro messaggio.");
      await expect(chat(page).getByText(/Risposta finta/).last()).toBeVisible();
      expect(datiDi(handle, artista)).toBeTruthy();
    });

    test("«Nuova chat» con una scheda toccata e non salvata chiede prima", async ({ page }) => {
      const { handle } = await nuovoProprietario(page);
      const artista = `Canarino lasciato ${unico()}`;
      await page.goto(`/${handle}/modifica`);
      await apriOracolo(page);
      await scrivi(page, `Aggiungi il concerto di ${artista}`);
      const card = scheda(page, `Scheda: nuovo concerto ${artista}`);
      // una modifica a mano: lasciare la chat la perderebbe
      await card.getByRole("button", { name: "Aggiungi commento" }).click();
      await card.getByRole("textbox", { name: "Commento" }).fill("da non perdere");
      await chat(page).getByRole("button", { name: "Nuova chat" }).click();
      const domanda = page.getByRole("dialog", { name: "Scheda non salvata" });
      await expect(domanda).toContainText("Hai una scheda non salvata: la scarti?");
      await domanda.getByRole("button", { name: "Resta" }).click();
      await expect(domanda).toHaveCount(0);
      await expect(card).toBeVisible();
      await chat(page).getByRole("button", { name: "Nuova chat" }).click();
      await page.getByRole("dialog", { name: "Scheda non salvata" }).getByRole("button", { name: "Scarta e apri una nuova chat" }).click();
      await expect(card).toHaveCount(0);
      await expect(chat(page).getByRole("button", { name: "Ho visto un concerto" })).toBeVisible();
      expect(datiDi(handle, artista)).toBeUndefined();
    });

    test("uscire da Modifica con una scheda toccata e non salvata chiede prima; cambiare vista no", async ({ page }) => {
      const { handle } = await nuovoProprietario(page);
      const artista = `Canarino uscita ${unico()}`;
      await page.goto(`/${handle}/modifica`);
      await apriOracolo(page);
      await scrivi(page, `Aggiungi il concerto di ${artista}`);
      const card = scheda(page, `Scheda: nuovo concerto ${artista}`);
      await card.getByRole("button", { name: "Aggiungi commento" }).click();
      await card.getByRole("textbox", { name: "Commento" }).fill("da non perdere");
      // un'altra vista di Modifica: la chat resta viva, niente domanda
      await vaiA(page, "persone");
      await expect(card).toBeVisible();
      const domanda = page.getByRole("dialog", { name: "Modifiche non salvate" });
      await expect(domanda).toHaveCount(0);
      await page.getByRole("tab", { name: "Sul palco" }).click();
      await expect(domanda).toContainText(`La scheda di «${artista}» nel Tour manager non è salvata: se esci adesso la perdi.`);
      await domanda.getByRole("button", { name: "Continua a modificare" }).click();
      await expect(domanda).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/${handle}/modifica`));
      await expect(card).toBeVisible();
      await page.getByRole("tab", { name: "Sul palco" }).click();
      await domanda.getByRole("button", { name: "Esci senza salvare" }).click();
      await expect(page).toHaveURL(new RegExp(`/${handle}$`));
      expect(datiDi(handle, artista)).toBeUndefined();
    });

    test("«Annulla» di una scheda il cui nome nuovo ora è in un altro concerto: dice quale e cosa fare", async ({ page }) => {
      test.setTimeout(180_000);
      const { handle } = await nuovoProprietario(page);
      const [a, b] = ["A", "B"].map(x => `Canarino in uso ${x} ${unico()}`);
      await page.goto(`/${handle}/modifica`);
      await apriOracolo(page);
      await scrivi(page, `Ho visto ${a} al Fabrique con Cami, voto 5`);
      await scheda(page, `Scheda: nuovo concerto ${a}`).getByRole("button", { name: "Salva concerto" }).click();
      const ea = chat(page).locator(".scheda-esito").filter({ hasText: `Aggiunto · ${a}` });
      await expect(ea).toContainText("+ Cami tra le persone");
      await scrivi(page, `Ho visto ${b} al Fabrique con Cami, voto 5`);
      await scheda(page, `Scheda: nuovo concerto ${b}`).getByRole("button", { name: "Salva concerto" }).click();
      await expect(chat(page).locator(".scheda-esito").filter({ hasText: `Aggiunto · ${b}` })).toBeVisible();
      // il lotto di A va annullato tutto o niente: «Cami» è in B, quindi no (e neanche da Attività)
      await ea.getByRole("button", { name: "Annulla" }).click();
      await expect(ea.getByRole("alert")).toHaveText(
        "Non si può annullare: «Cami», un nome nuovo di questa scheda, ora è usato anche in un altro concerto. Toglilo da lì, poi annulla.",
      );
      expect(datiDi(handle, a)).toBeTruthy();
    });

    test("conversazione troppo lunga (413) al Salva: la scheda lo dice, niente «Riprova», e porta a una chat nuova", async ({ page }) => {
      const { handle } = await nuovoProprietario(page);
      const artista = `Canarino lungo ${unico()}`;
      await page.goto(`/${handle}/modifica`);
      await apriOracolo(page);
      await scrivi(page, `Aggiungi il concerto di ${artista}`);
      const card = scheda(page, `Scheda: nuovo concerto ${artista}`);
      await expect(card).toBeVisible();
      // la ripresa del Salva trova la conversazione piena (come la route oltre i suoi limiti)
      await page.route("**/api/chat/scrittura", route =>
        route.request().postData()?.includes("\"resume\"")
          ? route.fulfill({ status: 413, contentType: "application/json", body: JSON.stringify({ error: "Conversazione troppo lunga: apri una nuova chat." }) })
          : route.continue(),
      );
      await card.getByRole("button", { name: "Salva concerto" }).click();
      await expect(chat(page).locator(".chat-error")).toHaveText("Conversazione troppo lunga: apri una nuova chat.");
      const chiusa = chat(page).locator(".scheda").filter({ hasText: "la conversazione è troppo lunga" });
      await expect(chiusa).toContainText("Non sono riuscito a salvare: la conversazione è troppo lunga. Apri una nuova chat e raccontami di nuovo questo concerto.");
      await expect(chiusa.getByRole("button", { name: "Riprova" })).toHaveCount(0);
      await chiusa.getByRole("button", { name: "Apri una nuova chat" }).click();
      await expect(chat(page).getByRole("button", { name: "Ho visto un concerto" })).toBeVisible();
      await expect(chat(page).locator(".chat-error")).toHaveCount(0);
      expect(datiDi(handle, artista)).toBeUndefined();
    });

    test("la casella: Invio manda, ⇧/⌥/Ctrl/⌘+Invio vanno a capo", async ({ page }) => {
      const richieste = registra(page);
      const { handle } = await nuovoProprietario(page);
      await page.goto(`/${handle}/modifica`);
      await apriOracolo(page);
      const c = casella(page);
      await c.fill("riga 1");
      await c.press("Shift+Enter");
      await c.pressSequentially("riga 2");
      await c.press("Alt+Enter");
      await c.pressSequentially("riga 3");
      await c.press("Control+Enter");
      await c.pressSequentially("riga 4");
      await c.press("Meta+Enter");
      await c.pressSequentially("riga 5");
      await expect(c).toHaveValue("riga 1\nriga 2\nriga 3\nriga 4\nriga 5");
      expect(richieste).toHaveLength(0);
      await c.press("Enter");
      await expect(c).toHaveValue("");
      await expect.poll(() => richieste.length).toBe(1);
      expect(JSON.stringify(richieste[0].messages)).toContain("riga 1\\nriga 2\\nriga 3\\nriga 4\\nriga 5");
    });
  });

  test.describe("desktop, lotti festival e modulo", () => {
    test.beforeEach(({}, info) => {
      test.skip(info.project.name !== "desktop", "i flussi completi una volta sola, sul desktop");
    });

    test("due schede in un run: la barra del lotto, una tolta, una ripresa sola; poi Salva tutte e Annulla tutti", async ({ page }) => {
      test.setTimeout(240_000);
      const richieste = registra(page);
      const { handle } = await nuovoProprietario(page);
      const [a, b, c, d] = ["A", "B", "C", "D"].map(x => `Canarino lotto ${x} ${unico()}`);
      await page.goto(`/${handle}/modifica`);
      await apriOracolo(page);

      await scrivi(page, `Aggiungi i concerti di ${a} e ${b}`);
      const ca = scheda(page, `Scheda: nuovo concerto ${a}`);
      const cb = scheda(page, `Scheda: nuovo concerto ${b}`);
      await expect(ca).toBeVisible();
      await expect(cb).toBeVisible();
      const barra = chat(page).getByRole("group", { name: "Le schede di questo messaggio" });
      await expect(barra).toContainText("2 schede");
      await expect(barra.getByRole("button", { name: "Salva tutte (2)" })).toBeEnabled();
      // al posto del piede, la casella: niente Salva per scheda
      await expect(ca.getByRole("button", { name: /^Salva/ })).toHaveCount(0);
      await expect(ca.getByRole("checkbox", { name: `Da salvare: «${a}»` })).toBeChecked();

      // il «Modulo completo» di B mentre è aperto quello di A: il pannello si rifà con B, e A non si riprende il focus
      const modulo = page.getByRole("dialog", { name: "Scheda: nuovo concerto" });
      await ca.getByRole("button", { name: `Modulo completo per «${a}»` }).click();
      await expect(modulo.locator("input[name=artist]")).toHaveValue(a);
      await cb.getByRole("button", { name: `Modulo completo per «${b}»` }).click();
      await expect(modulo.locator("input[name=artist]")).toHaveValue(b);
      await dueFrame(page);
      expect(await modulo.evaluate(d => d.contains(document.activeElement))).toBe(true);
      // con un modulo aperto il lotto non si decide: i valori del modulo andrebbero persi
      await expect(barra.getByRole("button", { name: "Salva tutte (2)" })).toBeDisabled();
      await expect(barra.getByRole("button", { name: "Scarta tutte" })).toBeDisabled();
      await expect(barra).toContainText("Il modulo completo è aperto");
      await modulo.getByRole("button", { name: "Torna alla scheda" }).click();
      await expect(modulo).toHaveCount(0);
      await expect(cb.getByRole("button", { name: `Modulo completo per «${b}»` })).toBeFocused();

      await cb.getByRole("checkbox", { name: `Da salvare: «${b}»` }).uncheck();
      await expect(cb).toContainText("Non la salvo");
      await expect(barra).toContainText("1 da non salvare");
      const prima = richieste.length;
      await barra.getByRole("button", { name: "Salva 1 scheda" }).click();
      await expect(chat(page).getByText("Fatto: 1 salvati, 1 scartati.")).toBeVisible();
      // una ripresa sola, con le due decisioni
      expect(richieste.length - prima).toBe(1);
      expect(richieste[prima].resume).toHaveLength(2);
      expect(richieste[prima].resume!.map(r => (r.payload as { approved: boolean }).approved).sort()).toEqual([false, true]);
      await expect(chat(page).locator(".scheda-esito").filter({ hasText: `Aggiunto · ${a}` })).toBeVisible();
      await expect(chat(page).getByText(`Scheda scartata · ${b}`)).toBeVisible();
      await expect(concerti(page).getByText(a)).toBeVisible();
      expect(datiDi(handle, b)).toBeUndefined();

      // tutte e due: «Salva tutte (2)», poi «Annulla tutti»
      await scrivi(page, `Aggiungi i concerti di ${c} e ${d}`);
      const barra2 = chat(page).getByRole("group", { name: "Le schede di questo messaggio" });
      await barra2.getByRole("button", { name: "Salva tutte (2)" }).click();
      await expect(chat(page).getByText("Fatto: 2 concerti salvati.")).toBeVisible();
      const salvate = chat(page).getByRole("group", { name: "Le schede salvate di questo messaggio" });
      await expect(salvate).toContainText("2 concerti salvati");
      expect(datiDi(handle, c)).toBeTruthy();
      expect(datiDi(handle, d)).toBeTruthy();
      await salvate.getByRole("button", { name: "Annulla tutti" }).click();
      await expect(chat(page).getByText("Annullati tutti")).toBeVisible();
      await expect(chat(page).getByText(`Annullato: «${c}» non è più in archivio.`)).toBeVisible();
      await expect(chat(page).getByText(`Annullato: «${d}» non è più in archivio.`)).toBeVisible();
      await expect.poll(() => [datiDi(handle, c), datiDi(handle, d)]).toEqual([undefined, undefined]);
      // il primo lotto resta
      expect(datiDi(handle, a)).toBeTruthy();
    });

    test("festival: la lineup modificabile (voto, ↑, ×), Salva festival; ⋯ È un festival e ritorno", async ({ page }) => {
      test.setTimeout(240_000);
      const { handle } = await nuovoProprietario(page);
      const festival = `Canarifest ${unico()}`;
      const [a, b, c] = ["Uno", "Due", "Tre"].map(x => `Canarino ${x} ${unico()}`);
      await page.goto(`/${handle}/modifica`);
      await apriOracolo(page);

      await scrivi(page, `Aggiungi il festival ${festival} con ${a}, ${b} e ${c}`);
      const card = scheda(page, `Scheda: nuovo festival ${festival}`);
      await expect(card).toBeVisible();
      // l'occhiello resta su una riga («Nuovo festival»): quanti concerti lo dice la riga «Concerti · 3»
      await expect(card.locator(".scheda-occhiello")).toHaveText("Nuovo festival");
      await expect(card).toContainText("Concerti · 3");
      const lineup = card.getByRole("list", { name: "Concerti del festival" });
      await expect(lineup.getByRole("listitem")).toHaveCount(3);

      // il voto di un concerto, nel suo editor
      await lineup.getByRole("button", { name: new RegExp(`^1 · ${a}`) }).click();
      await card.getByRole("radiogroup", { name: `Voto di ${a}` }).getByRole("radio", { name: "5 stelle" }).check();
      await card.getByRole("button", { name: "Fatto", exact: true }).click();
      await expect(lineup.getByRole("button", { name: new RegExp(`^1 · ${a}`) })).toContainText("★★★★★");
      // via il terzo; a due concerti × si spegne
      await card.getByRole("button", { name: `Togli ${c} dal festival` }).click();
      await expect(lineup.getByRole("listitem")).toHaveCount(2);
      await expect(card.getByRole("button", { name: `Togli ${a} dal festival` })).toBeDisabled();
      // ↑: il secondo diventa il primo
      await card.getByRole("button", { name: `Sposta su ${b}` }).click();
      await expect(lineup.getByRole("listitem").first()).toContainText(b);

      await card.getByRole("button", { name: "Salva festival" }).click();
      await expect(chat(page).getByText(/^Fatto: festival aggiunto\./)).toBeVisible();
      const salvato = tuttiDi(handle, festival)[0] as { concerts: { artist: string; voto?: number }[] } | undefined;
      expect(salvato?.concerts.map(x => x.artist)).toEqual([b, a]);
      expect(salvato?.concerts[1].voto).toBe(5);
      await expect(concerti(page).getByText(festival)).toBeVisible();

      // ⋯ «È un festival» su un concerto, poi «Fanne un concerto singolo»: torna com'era
      const artista = `Canarino tipo ${unico()}`;
      await scrivi(page, `Aggiungi il concerto di ${artista}`);
      const c2 = scheda(page, `Scheda: nuovo concerto ${artista}`);
      await c2.getByRole("button", { name: `Altre azioni per la scheda «${artista}»` }).click();
      await page.getByRole("menuitem", { name: "È un festival" }).click();
      const f2 = chat(page).locator("article.scheda[data-stato=bozza]");
      await expect(f2.locator(".scheda-occhiello")).toHaveText("Nuovo festival");
      await expect(f2).toContainText("Concerti · 2");
      await expect(f2).toContainText("Manca il nome del festival.");
      await expect(f2.getByRole("button", { name: "Salva festival" })).toBeDisabled();
      await f2.getByRole("button", { name: "Fanne un concerto singolo" }).first().click();
      await expect(scheda(page, `Scheda: nuovo concerto ${artista}`).getByRole("button", { name: "Salva concerto" })).toBeEnabled();
      await scheda(page, `Scheda: nuovo concerto ${artista}`).getByRole("button", { name: "Scarta", exact: true }).click();
      await expect(chat(page).getByText(`Scheda scartata · ${artista}`)).toBeVisible();
    });

    test("una modifica che toglie un concerto dal festival: blocca finché non si sceglie «Toglilo»", async ({ page }) => {
      test.setTimeout(180_000);
      const { handle } = await nuovoProprietario(page);
      const festival = `Canarifest tolto ${unico()}`;
      const [a, b, c] = ["Uno", "Due", "Tre"].map(x => `Canarino ${x} ${unico()}`);
      convexRun("devtools:addEntry", {
        handle,
        entry: { kind: "festival", name: festival, date: "2025-06-20", venue: "Fabrique", city: "Milano", concerts: [a, b, c].map(artist => ({ artist, with: [] })) },
      });
      await page.goto(`/${handle}/modifica`);
      await apriOracolo(page);

      await scrivi(page, `Togli ${b} dal festival ${festival}`);
      const card = scheda(page, `Scheda: modifica del festival ${festival}`);
      await expect(card).toContainText(`Questa modifica toglie ${b} dal festival.`);
      await expect(card.getByRole("button", { name: /^Salva modifiche/ })).toBeDisabled();
      await expect(card).toContainText(`− ${b}`);
      await card.getByRole("button", { name: "Toglilo" }).click();
      await card.getByRole("button", { name: "Salva modifiche (1)" }).click();
      await expect(chat(page).getByText("Fatto: festival modificato.")).toBeVisible();
      const dopo = tuttiDi(handle, festival)[0] as { concerts: { artist: string }[] } | undefined;
      expect(dopo?.concerts.map(x => x.artist)).toEqual([a, c]);
    });

    test("doppioni: lo stesso giorno «Aggiorna quello» diventa una modifica; un giorno prima è solo un avviso", async ({ page }) => {
      test.setTimeout(180_000);
      const { handle } = await nuovoProprietario(page);
      const artista = `Canarino doppio ${unico()}`;
      const vicino = `Canarino vicino ${unico()}`;
      convexRun("devtools:addEntry", { handle, entry: { kind: "concert", date: "2025-10-18", artist: artista, venue: "Fabrique", city: "Milano", with: [] } });
      convexRun("devtools:addEntry", { handle, entry: { kind: "concert", date: "2025-10-17", artist: vicino, venue: "Fabrique", city: "Milano", with: [] } });
      await page.goto(`/${handle}/modifica`);
      await apriOracolo(page);

      await scrivi(page, `Ho visto ${artista} al Fabrique con Sara, voto 5`);
      const card = scheda(page, `Scheda: nuovo concerto ${artista}`);
      await expect(card).toContainText(`Hai già ${artista} il 18/10/2025 (Fabrique, Milano).`);
      await expect(card.getByRole("button", { name: "Salva concerto" })).toBeDisabled();
      await card.getByRole("button", { name: "Aggiorna quello" }).click();
      const modifica = scheda(page, `Scheda: modifica del concerto ${artista}`);
      await expect(modifica).toBeVisible();
      const righe = modifica.locator(".scheda-righe .scheda-riga:not(.muta)");
      await expect(righe).toHaveCount(2);
      await expect(righe.filter({ hasText: "Voto" }).locator(".scheda-dopo")).toContainText("★★★★★ 5");
      await modifica.getByRole("button", { name: "Salva modifiche (2)" }).click();
      await expect(chat(page).getByText("Fatto: concerto modificato.")).toBeVisible();
      // nessun concerto nuovo: quello di prima, aggiornato
      const tutti = tuttiDi(handle, artista);
      expect(tutti).toHaveLength(1);
      expect(tutti[0]).toMatchObject({ voto: 5 });

      // un giorno prima: un avviso con «Apri quello», il Salva resta
      await scrivi(page, `Ho visto ${vicino} al Fabrique`);
      const c2 = scheda(page, `Scheda: nuovo concerto ${vicino}`);
      await expect(c2).toContainText(`Hai già ${vicino} il 17/10/2025, un giorno prima.`);
      await expect(c2.getByRole("button", { name: "Salva concerto" })).toBeEnabled();
      await c2.getByRole("button", { name: "Apri quello" }).click();
      const pannello = page.getByRole("dialog", { name: "Modifica concerto" });
      await expect(pannello.locator("input[name=artist]")).toHaveValue(vicino);
      await pannello.getByRole("button", { name: "Chiudi" }).click();
      await expect(pannello).toHaveCount(0);
      await c2.getByRole("button", { name: "Scarta", exact: true }).click();
      await expect(chat(page).getByText(`Scheda scartata · ${vicino}`)).toBeVisible();
    });

    test("«Modulo completo»: il form in modo scheda, Esc chiude solo lui, «Usa nella scheda» senza scrivere", async ({ page }) => {
      test.setTimeout(180_000);
      const richieste = registra(page);
      const { handle } = await nuovoProprietario(page);
      const artista = `Canarino modulo ${unico()}`;
      await page.goto(`/${handle}/modifica`);
      await apriOracolo(page);

      await scrivi(page, `Aggiungi il concerto di ${artista}`);
      const card = scheda(page, `Scheda: nuovo concerto ${artista}`);
      const link = card.getByRole("button", { name: "Modulo completo" });
      await link.click();
      const modulo = page.getByRole("dialog", { name: "Scheda: nuovo concerto" });
      await expect(modulo).toBeVisible();
      await expect(modulo.locator("input[name=artist]")).toHaveValue(artista);
      await expect(chat(page)).toBeVisible();
      // Esc chiude il modulo e basta: l'Oracolo agganciato e la scheda restano
      await modulo.locator("input[name=artist]").focus();
      await page.keyboard.press("Escape");
      await expect(modulo).toHaveCount(0);
      await expect(chat(page)).toBeVisible();
      await expect(card.getByRole("button", { name: "Salva concerto" })).toBeEnabled();
      await expect(link).toBeFocused();

      await link.click();
      await expect(modulo).toBeVisible();
      // finché il modulo è aperto (non modale, accanto) la scheda non si decide: i suoi valori andrebbero persi
      await expect(card.getByRole("button", { name: "Salva concerto" })).toBeDisabled();
      await expect(card.getByRole("button", { name: "Scarta" })).toBeDisabled();
      await expect(card).toContainText("Il modulo completo è aperto: prima «Usa nella scheda» o «Torna alla scheda».");
      const inviate = richieste.length;
      await scrivi(page, "metti voto 4");
      await expect(chat(page).getByRole("alert").filter({ hasText: "Il modulo completo di una scheda è aperto" })).toBeVisible();
      expect(richieste.length).toBe(inviate);
      await casella(page).fill("");
      await modulo.locator("input[name=artist]").fill(`${artista} live`);
      await modulo.getByRole("button", { name: "Usa nella scheda" }).click();
      await expect(modulo).toHaveCount(0);
      const riga = card.getByRole("button", { name: new RegExp(`^Artista ${artista} live`) });
      await expect(riga).toBeVisible();
      await expect(riga).toContainText("modificato da te");
      // niente scritto: la scheda aspetta il suo Salva
      expect(datiDi(handle, `${artista} live`)).toBeUndefined();
      await card.getByRole("button", { name: "Salva concerto" }).click();
      await expect(chat(page).getByText("Fatto: concerto aggiunto.")).toBeVisible();
      expect(datiDi(handle, `${artista} live`)).toBeTruthy();
      expect(datiDi(handle, artista)).toBeUndefined();

      // più largo, così l'elenco resta cliccabile accanto all'Oracolo e al modulo
      await page.setViewportSize({ width: 1700, height: 1000 });
      const altro = `Canarino modulo bis ${unico()}`;
      await scrivi(page, `Aggiungi il concerto di ${altro}`);
      const card2 = scheda(page, `Scheda: nuovo concerto ${altro}`);
      const link2 = card2.getByRole("button", { name: "Modulo completo" });
      // una riga dell'elenco al posto del modulo (non passa dal ponte): il focus resta nel suo pannello
      await link2.click();
      await expect(modulo).toBeVisible();
      await concerti(page).getByText(`${artista} live`).click();
      const rigaAperta = page.getByRole("dialog", { name: "Modifica concerto" });
      await expect(rigaAperta).toBeVisible();
      await expect(modulo).toHaveCount(0);
      await dueFrame(page);
      expect(await rigaAperta.evaluate(d => d.contains(document.activeElement))).toBe(true);
      await expect(card2.getByRole("button", { name: "Salva concerto" })).toBeEnabled();
      await rigaAperta.getByRole("button", { name: "Chiudi" }).click();
      await expect(rigaAperta).toHaveCount(0);
      // «Aggiungi un concerto» sopra il modulo (da tastiera: la testa del pannello copre il pulsante): un concerto nuovo, vuoto
      await link2.click();
      await expect(modulo).toBeVisible();
      await page.locator("section#concerti").getByRole("button", { name: "Aggiungi un concerto", exact: true }).focus();
      await page.keyboard.press("Enter");
      const vuoto = page.getByRole("dialog", { name: "Nuovo concerto" });
      await expect(vuoto).toBeVisible();
      await expect(modulo).toHaveCount(0);
      await expect(vuoto.locator("input[name=artist]")).toHaveValue("");
      await dueFrame(page);
      expect(await vuoto.evaluate(d => d.contains(document.activeElement))).toBe(true);
      await expect(card2.getByRole("button", { name: "Salva concerto" })).toBeEnabled();
      expect(datiDi(handle, altro)).toBeUndefined();
    });
  });

  test("telefono: la scheda a tutta larghezza, campi a 16 px, Salva e Apri sopra la chat", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "il flusso del telefono");
    test.setTimeout(180_000);
    const { handle } = await nuovoProprietario(page);
    const artista = `Canarino telefono ${unico()}`;
    await page.goto(`/${handle}/modifica`);
    await apriOracolo(page);

    await scrivi(page, `Ho visto ${artista} al Fabrique, voto 4`);
    const card = scheda(page, `Scheda: nuovo concerto ${artista}`);
    await expect(card).toBeVisible();
    // fuori dalla nuvoletta, larga quanto la chat
    const corpo = await chat(page).locator(".chat-body").boundingBox();
    const box = await card.boundingBox();
    expect(box!.width).toBeGreaterThan(corpo!.width - 48);
    // i campi a 16 px (niente zoom di iOS), i bersagli da 44
    await card.getByRole("button", { name: /^Artista/ }).click();
    const campo = card.getByRole("textbox", { name: "Artista" });
    expect(await campo.evaluate(el => getComputedStyle(el).fontSize)).toBe("16px");
    await campo.press("Escape");
    await expect(chat(page)).toBeVisible();
    const salva = card.getByRole("button", { name: "Salva concerto" });
    expect((await salva.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await salva.click();
    await expect(chat(page).getByText("Fatto: concerto aggiunto.")).toBeVisible();
    const conferma = chat(page).locator(".scheda-esito");
    await conferma.getByRole("button", { name: "Apri" }).click();
    const pannello = page.getByRole("dialog", { name: "Modifica concerto" });
    await expect(pannello).toBeVisible();
    await pannello.getByRole("button", { name: "Chiudi" }).click();
    await expect(pannello).toHaveCount(0);
    await expect(conferma).toBeVisible();

    // un festival lungo: il piede col Salva resta in vista scorrendo, e smette di stare appiccicato mentre si scrive
    const festival = `Canarifest lungo ${unico()}`;
    await scrivi(page, `Aggiungi il festival ${festival} con A1, B2, C3, D4 e E5`);
    const lunga = scheda(page, `Scheda: nuovo festival ${festival}`);
    await lunga.getByRole("list", { name: "Concerti del festival" }).getByRole("button", { name: /^1 · A1/ }).click();
    const campoSet = lunga.getByRole("textbox", { name: "Artista" });
    await expect(campoSet).toBeFocused();
    // scorrendo (niente campo col focus) il piede sta appiccicato in fondo alla chat
    await campoSet.evaluate(el => (el as HTMLElement).blur());
    const corpoChat = chat(page).locator(".chat-body");
    await lunga.locator(".scheda-titolo").evaluate(el => el.scrollIntoView({ block: "start" }));
    const piede = lunga.locator(".scheda-piede");
    expect(await piede.evaluate(el => getComputedStyle(el).position)).toBe("sticky");
    const salvaFestival = lunga.getByRole("button", { name: "Salva festival" });
    const area = (await corpoChat.boundingBox())!;
    const pulsante = (await salvaFestival.boundingBox())!;
    expect(pulsante.y + pulsante.height).toBeLessThanOrEqual(area.y + area.height + 1);
    expect(pulsante.y).toBeGreaterThanOrEqual(area.y);
    await campoSet.focus();
    expect(await piede.evaluate(el => getComputedStyle(el).position)).toBe("static");

    // al telefono più stretto (320 px) niente scorre di lato: la chat, il festival con l'editor di un
    // concerto aperto, la conferma di prima
    await page.setViewportSize({ width: 320, height: 640 });
    await expect.poll(() => corpoChat.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    for (const riquadro of [lunga, conferma, salvaFestival]) {
      const b = (await riquadro.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(320.5);
    }
  });
});
