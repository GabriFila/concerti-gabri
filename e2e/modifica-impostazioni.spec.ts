/* ──────────────────────────────────────────────────────────────
   Le viste di impostazioni e il registro dell'app di modifica (spec
   ux-modifica §5.5, §6.8–6.11):

   - #stile: la barra di salvataggio è attiva solo con modifiche;
     cambiare vista le tiene, lasciare /modifica (anche da un'altra
     vista) chiede «Modifiche non salvate» e dice dove; «Annulla le
     modifiche» torna com'era; il layout ha la sua barra; sul desktop
     l'anteprima sta accanto ai campi del tema;
   - #account: «Salva» solo con modifiche, notifica «Salvato.», la
     guardia; un handle nuovo ricarica sul nuovo indirizzo senza che il
     browser chieda niente; la finestra di `?elimina=1`, chiusa, riporta
     l'hash a #account;
   - #agenti: «Importa da un file» dal ⋯ di #concerti porta alla scheda
     dell'import col focus sul file (e l'hash torna #agenti); un
     <details> per client; il link ad «Attività»;
   - #attivita: una voce scritta con una API key è «nuova» (e la
     navigazione ha il punto teal) finché non si torna qui; pastiglie
     «Chi ha fatto la modifica», «Solo annullabili», ricerca; i giorni
     sono separatori, non voci; niente scroll orizzontale sul telefono.

   I flussi lunghi dei test di sempre (stile, account, import,
   mcp-apikey, mcp-oauth) restano nei loro spec. @sessione, su
   proprietari nuovi (mai gabrifila).
   ────────────────────────────────────────────────────────────── */

import type { Page } from "@playwright/test";
import { idratata, nuovoProprietario } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { watchErrors } from "./helpers/idratazione.ts";
import { strumento } from "./helpers/mcp.ts";
import { vaiA } from "./helpers/modifica.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

/** La voce «Attività» della navigazione (barra laterale, o la scheda in basso sul telefono). */
const voceAttivita = (page: Page, telefono: boolean) =>
  telefono
    ? page.getByRole("navigation", { name: "Sezioni principali" }).locator('a[href$="#attivita"]')
    : page.locator('nav.modifica-indice a[href$="#attivita"]');

test.describe("impostazioni e registro di /modifica", { tag: "@sessione" }, () => {
  test.beforeEach(({}, info) => test.skip(onPreview(info.project.name), "solo in locale (OTP di sviluppo)"));
  test.afterAll(({}, info) => {
    if (!onPreview(info.project.name)) convexRun("devtools:cleanupE2E");
  });

  test("#stile: la barra di salvataggio, la guardia uscendo da /modifica, l'anteprima accanto", async ({ page }, info) => {
    test.setTimeout(180_000);
    const telefono = info.project.name === "mobile";
    const errori = watchErrors(page);
    const { handle } = await nuovoProprietario(page, { nome: "Stile" });
    await page.goto(`/${handle}/modifica#stile`);
    await idratata(page);
    const stile = page.locator("section#stile");
    const tema = stile.getByRole("form", { name: "Tema", exact: true });
    const salva = tema.getByRole("button", { name: "Salva lo stile" });
    const neon = tema.getByRole("radio", { name: /Neon/ });

    // senza modifiche niente da salvare
    await expect(salva).toBeDisabled();
    await expect(tema.getByText("Modifiche non salvate")).toHaveCount(0);
    await neon.check();
    await expect(tema.getByText("Modifiche non salvate")).toBeVisible();
    await expect(salva).toBeEnabled();

    // cambiare vista non chiede niente; lasciare /modifica sì, anche da un'altra vista (e dice quale)
    await vaiA(page, "concerti");
    await page.getByRole("tab", { name: "I dati" }).click();
    const guardia = page.getByRole("dialog", { name: "Modifiche non salvate" });
    await expect(guardia).toContainText("Le modifiche in «Stile» non sono salvate");
    await expect(guardia.getByRole("button", { name: "Continua a modificare" })).toBeFocused();
    await guardia.getByRole("button", { name: "Continua a modificare" }).click();
    await expect(guardia).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/${handle}/modifica#concerti$`));
    // la modifica è ancora lì
    await vaiA(page, "stile");
    await expect(neon).toBeChecked();

    // «Annulla le modifiche»: com'era, e la barra si spegne
    await tema.getByRole("button", { name: "Annulla le modifiche" }).click();
    await expect(tema.getByRole("radio", { name: /Predefinito/ })).toBeChecked();
    await expect(salva).toBeDisabled();

    // il layout ha la sua barra: rimettere com'era la spegne di nuovo
    const layout = stile.getByRole("region", { name: "Sezioni de I dati" });
    const salvaLayout = layout.getByRole("button", { name: "Salva il layout" });
    await expect(salvaLayout).toBeDisabled();
    await layout.getByRole("checkbox", { name: "Mostra Quanto spendo" }).uncheck();
    await expect(salvaLayout).toBeEnabled();
    await layout.getByRole("checkbox", { name: "Mostra Quanto spendo" }).check();
    await expect(salvaLayout).toBeDisabled();

    // desktop (1280 px, colonna da 984): l'anteprima accanto ai campi, non sotto
    const campi = (await tema.locator(".mf-tema-campi").boundingBox())!;
    const anteprima = (await tema.locator(".mf-tema-anteprima").boundingBox())!;
    if (telefono) expect(anteprima.y).toBeGreaterThan(campi.y + campi.height - 1);
    else expect(anteprima.x).toBeGreaterThan(campi.x + campi.width - 1);

    // senza modifiche si esce senza domande
    await page.getByRole("tab", { name: "I dati" }).click();
    await expect(page).toHaveURL(new RegExp(`/${handle}/dati$`));
    await expect(guardia).toHaveCount(0);
    expect(errori.hydration()).toEqual([]);
  });

  test("#account: «Salva» con modifiche, la guardia, l'handle nuovo senza domande del browser, ?elimina=1 chiusa", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "una volta sola");
    test.setTimeout(180_000);
    const { handle } = await nuovoProprietario(page, { nome: "Account" });
    // una domanda del browser (beforeunload) annullerebbe il ricaricamento: qui non deve arrivare
    const domande: string[] = [];
    page.on("dialog", d => {
      domande.push(d.type());
      void d.dismiss();
    });
    await page.goto(`/${handle}/modifica#account`);
    await idratata(page);
    const pagina = page.locator("section#account").getByRole("form", { name: "La tua pagina" });
    const salva = pagina.getByRole("button", { name: "Salva", exact: true });
    await expect(salva).toBeDisabled();
    await pagina.getByLabel("Nome sulla pagina").fill("Impostata");
    await expect(pagina.getByText("Modifiche non salvate")).toBeVisible();
    await salva.click();
    await expect(page.getByRole("status").filter({ hasText: "Salvato." })).toBeVisible();
    await expect(salva).toBeDisabled();
    await expect(pagina.getByLabel("Nome sulla pagina")).toHaveValue("Impostata");

    // con modifiche, lasciare /modifica chiede
    await pagina.getByLabel("Nome sulla pagina").fill("Ancora");
    await page.getByRole("tab", { name: "Sul palco" }).click();
    const guardia = page.getByRole("dialog", { name: "Modifiche non salvate" });
    await expect(guardia).toBeVisible();
    await guardia.getByRole("button", { name: "Continua a modificare" }).click();
    await expect(page).toHaveURL(new RegExp(`/${handle}/modifica#account$`));

    // un handle nuovo: si ricarica sul nuovo indirizzo, senza «Vuoi uscire?» del browser
    const nuovo = `${handle}b`;
    await pagina.getByLabel("Indirizzo", { exact: true }).fill(nuovo);
    await expect(pagina.getByText(`/${nuovo} è libero.`)).toBeVisible();
    await salva.click();
    await expect(page).toHaveURL(new RegExp(`/${nuovo}/modifica#account$`));
    await idratata(page);
    expect(domande).toEqual([]);
    await expect(page.locator("section#account").getByRole("form", { name: "La tua pagina" }).getByLabel("Nome sulla pagina")).toHaveValue("Ancora");

    // ?elimina=1 apre la conferma; chiusa, l'hash torna #account (un ricaricamento non la riapre)
    await page.goto(`/${nuovo}`);
    await page.goto(`/${nuovo}/modifica#account?elimina=1`);
    const elimina = page.getByRole("dialog", { name: "Eliminare l'account?" });
    await expect(elimina).toBeVisible();
    await elimina.getByRole("button", { name: "Annulla", exact: true }).click();
    await expect(elimina).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/${nuovo}/modifica#account$`));
    await page.reload();
    await idratata(page);
    await expect(page.locator("section#account").getByRole("button", { name: "Elimina l'account…" })).toBeVisible();
    await expect(elimina).toHaveCount(0);
  });

  test("#agenti: «Importa da un file» porta all'import col focus sul file; un <details> per client", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "una volta sola");
    test.setTimeout(180_000);
    const { handle } = await nuovoProprietario(page, { nome: "Agenti" });
    await page.goto(`/${handle}/modifica`);
    await idratata(page);
    await page.locator("section#concerti").getByRole("button", { name: "Altre azioni", exact: true }).click();
    await page.getByRole("menuitem", { name: "Importa da un file" }).click();

    const agenti = page.locator("section#agenti");
    const importa = agenti.getByRole("region", { name: "Importa da un file" });
    await expect(agenti.getByLabel("File da importare (CSV o JSON)")).toBeFocused();
    await expect(importa).toBeInViewport();
    // l'hash torna #agenti: «indietro» riporta a Concerti
    await expect(page).toHaveURL(new RegExp(`/${handle}/modifica#agenti$`));
    await expect(agenti.getByText("0 API key attive · 0 app collegate")).toBeVisible();

    // «Come collegarlo»: Claude aperto, gli altri chiusi finché non li apri
    await expect(agenti.getByText("Impostazioni → Connettori")).toBeVisible();
    const chatgpt = agenti.locator("details", { hasText: "ChatGPT" });
    await expect(chatgpt.getByText("modalità sviluppatore")).toBeHidden();
    await chatgpt.locator("summary").click();
    await expect(chatgpt.getByText("modalità sviluppatore")).toBeVisible();

    // il link ad «Attività» nella descrizione cambia vista
    await agenti.getByRole("link", { name: "Attività", exact: true }).click();
    await expect(page.locator("section#attivita")).toBeVisible();
    await page.goBack();
    await expect(agenti).toBeVisible();
    await page.goBack();
    await expect(page.locator("section#concerti")).toBeVisible();
  });

  test("#attivita: «nuova» per le voci degli agenti, pastiglie, «Solo annullabili», ricerca e giorni", async ({ page, baseURL }, info) => {
    test.setTimeout(180_000);
    const telefono = info.project.name === "mobile";
    const errori = watchErrors(page);
    const { handle } = await nuovoProprietario(page, { nome: "Registro" });
    const { chiave } = convexRun<{ chiave: string }>("agents:chiaveDiProva", { handle, nome: "Script e2e" });
    await page.goto(`/${handle}/modifica#persone`);
    await idratata(page);

    // una voce dalla dashboard e una da un agente (API key)
    const persone = page.locator("section#persone");
    await persone.getByLabel("Nuova persona").fill("Lu");
    await persone.getByRole("button", { name: "Aggiungi" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Persona aggiunta." })).toBeVisible();
    expect((await strumento(baseURL, chiave, "add_person", { name: "Ale" })).isError).toBe(false);
    await expect(voceAttivita(page, telefono)).toHaveAccessibleName(/modifiche nuove dagli agenti/);

    await vaiA(page, "attivita");
    const attivita = page.locator("section#attivita");
    const registro = attivita.getByRole("list", { name: "Registro delle attività" });
    const ale = registro.getByRole("listitem").filter({ hasText: "persona aggiunta: Ale" });
    const lu = registro.getByRole("listitem").filter({ hasText: "persona aggiunta: Lu" });
    await expect(ale.locator(".mf-nuova")).toHaveText("nuova");
    await expect(lu.locator(".mf-nuova")).toHaveCount(0);
    // i giorni sono separatori nascosti allo screen reader, non voci
    await expect(attivita.locator("li.mf-registro-giorno")).toHaveText(["Oggi"]);
    await expect(registro.getByRole("listitem")).toHaveCount(2);
    // aperta la vista, il punto sparisce
    await expect(voceAttivita(page, telefono)).not.toHaveAccessibleName(/modifiche nuove dagli agenti/);

    // chi ha fatto la modifica
    await attivita.getByRole("radio", { name: /^Agenti/ }).check();
    await expect(registro.getByRole("listitem")).toHaveCount(1);
    await expect(ale).toHaveCount(1);
    await attivita.getByRole("radio", { name: /^Dashboard/ }).check();
    await expect(registro.getByRole("listitem")).toHaveCount(1);
    await expect(lu).toHaveCount(1);
    await attivita.getByRole("radio", { name: /^Oracolo/ }).check();
    await expect(attivita.getByText("Nessuna modifica con questi filtri.")).toBeVisible();
    await attivita.getByRole("button", { name: "Azzera i filtri" }).click();
    await expect(registro.getByRole("listitem")).toHaveCount(2);

    // annullata l'aggiunta di Lu: «Solo annullabili» la nasconde (l'annullamento si annulla, quindi resta)
    await lu.getByRole("button", { name: "Annulla: persona aggiunta: Lu" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Annullato: persona aggiunta: Lu." })).toBeVisible();
    await expect(registro.locator("li.mod-voce-annullata")).toHaveCount(1);
    await attivita.getByRole("switch", { name: "Solo annullabili" }).check();
    await expect(registro.locator("li.mod-voce-annullata")).toHaveCount(0);
    await expect(registro.getByRole("listitem")).toHaveCount(2);
    await attivita.getByRole("switch", { name: "Solo annullabili" }).uncheck();

    // la ricerca, anche con `/`
    await attivita.getByRole("heading", { level: 1, name: "Attività" }).click();
    await page.keyboard.press("/");
    const cerca = attivita.getByRole("searchbox", { name: "Cerca nel registro" });
    await expect(cerca).toBeFocused();
    await cerca.fill("SCRIPT");
    await expect(registro.getByRole("listitem")).toHaveCount(1);
    await expect(attivita.getByText("1 di 3")).toBeAttached();
    await cerca.fill("");

    if (telefono) expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // di nuovo qui: Ale è già vista; una voce nuova dell'agente arrivata intanto sì
    await vaiA(page, "concerti");
    expect((await strumento(baseURL, chiave, "add_person", { name: "Bea" })).isError).toBe(false);
    await expect(voceAttivita(page, telefono)).toHaveAccessibleName(/modifiche nuove dagli agenti/);
    await vaiA(page, "attivita");
    await expect(registro.getByRole("listitem").filter({ hasText: "persona aggiunta: Bea" }).locator(".mf-nuova")).toHaveText("nuova");
    await expect(ale.locator(".mf-nuova")).toHaveCount(0);
    expect(errori.hydration()).toEqual([]);
  });
});
