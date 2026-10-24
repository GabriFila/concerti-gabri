/* ──────────────────────────────────────────────────────────────
   L'accessibilità dell'app di modifica che un agente può controllare da
   solo (spec ux-modifica §9–10, riconciliazione 6), su una proprietaria
   nuova con concerti, un festival, persone, la partenza «Casa» senza
   indirizzo, un artista in wishlist e un "regalato da":

   - contrasto calcolato (e2e/helpers/accessibilita.ts) di ogni testo in
     ogni vista, nei pannelli, nei menu, nelle notifiche, nella testa
     dell'Oracolo e nel foglio «Altro», in chiaro e in scuro;
   - struttura: «Vai al contenuto» porta il focus a <main>, i landmark
     hanno il loro nome, un h1 solo per vista;
   - desktop, solo tastiera: il pannello non modale accanto all'Oracolo
     agganciato non intrappola il focus (Tab va dal pannello
     all'Oracolo), Esc nell'Oracolo chiude solo l'Oracolo e Esc nel
     pannello solo il pannello, e il focus torna a chi li aveva aperti;
     con Tab ogni controllo di ogni vista mostra il focus;
   - telefono: i controlli sono bersagli da 44 px (spec §9, pointer
     coarse), nelle viste, nel pannello del concerto, nel menu ⋯ e nel
     foglio «Altro».
   Il corpo della chat (.mf-oracolo-corpo) è della corsia ux-agente: qui
   resta fuori. VoiceOver, TalkBack, NVDA e un telefono vero con la
   tastiera a schermo restano controlli a mano (la lista è nel report).

   @sessione, in locale (OTP di sviluppo).
   ────────────────────────────────────────────────────────────── */

import type { Page } from "@playwright/test";
import { bersagliPiccoli, contrasti, fuocoInvisibile, senzaTransizioni } from "./helpers/accessibilita.ts";
import { idratata, nuovoProprietario } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { menuRiga, vaiA } from "./helpers/modifica.ts";
import { setTemaCookie } from "./helpers/tema.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

const VISTE = ["concerti", "wishlist", "persone", "partenze", "regali", "stile", "agenti", "attivita", "account"] as const;
const CHAT = ".mf-oracolo-corpo";

const CONCERTI = [
  { kind: "concert", date: "2024-03-10", artist: "Canarino Uno", venue: "Fabrique", city: "Milano", with: ["Lu"], voto: 4, vicinanza: 5, canzoniNote: 3, from: "Casa", comments: "Una serata da ricordare." },
  { kind: "concert", date: "2025-06-01", artist: "Canarino Due", venue: "Alcatraz", city: "Milano", with: ["Ale"] },
  { kind: "concert", date: "2027-05-20", artist: "Canarino Futuro", venue: "Fabrique", city: "Milano", with: ["Lu"] },
  {
    kind: "festival", name: "Canarino Fest", date: "12–13/07/2024", venue: "Fabrique", city: "Milano", from: "Casa",
    concerts: [
      { artist: "Set A", with: [], voto: 5, vicinanza: 6, canzoniNote: 5 },
      { artist: "Set B", with: [], voto: 4, vicinanza: 4, canzoniNote: 4 },
    ],
  },
];

/** Una proprietaria nuova coi dati di prova; aggiunge dalla UI un artista in wishlist e un "regalato da" (righe anche in Attività). */
async function proprietaria(page: Page): Promise<string> {
  const { handle } = await nuovoProprietario(page, { forma: "f", nome: "Accessibile" });
  convexRun("devtools:preparaProfiloDiProva", { handle, persone: ["Lu", "Ale", "Bea"], partenze: ["Casa"], concerti: CONCERTI });
  await page.goto(`/${handle}/modifica#wishlist`);
  await idratata(page);
  const wishlist = page.locator("section#wishlist");
  await wishlist.getByLabel("Aggiungi un artista").fill("Canarino Wish");
  await wishlist.getByRole("button", { name: "Aggiungi", exact: true }).click();
  await expect(wishlist.getByRole("list", { name: "Wishlist" })).toContainText("Canarino Wish");
  await vaiA(page, "regali");
  const regali = page.locator("section#regali");
  await regali.getByLabel("Nome").fill("Canarino Radio");
  await regali.getByRole("button", { name: "Aggiungi", exact: true }).click();
  await expect(regali.getByRole("list", { name: "Regalato da" })).toContainText("Canarino Radio");
  return handle;
}

const elenco = (page: Page) => page.locator("section#concerti").getByRole("list", { name: "Concerti e festival" });
const riga = (page: Page, testo: string) => elenco(page).getByRole("listitem").filter({ hasText: testo });

test.describe("accessibilità di /modifica", { tag: "@sessione" }, () => {
  test.beforeEach(({}, info) => test.skip(onPreview(info.project.name), "solo in locale (OTP di sviluppo)"));
  test.afterAll(({}, info) => {
    if (!onPreview(info.project.name)) convexRun("devtools:cleanupE2E");
  });

  test("contrasto calcolato: ogni testo, in chiaro e in scuro", async ({ page, context, baseURL }, info) => {
    test.setTimeout(300_000);
    const telefono = info.project.name === "mobile";
    const handle = await proprietaria(page);
    // un testo per elemento e coppia di colori, col primo posto in cui si è visto
    const fuori = new Map<string, string>();
    const scansiona = async (dove: string) => {
      await page.evaluate(() => document.fonts.ready);
      // l'anteprima del tema in #stile mostra i colori della pagina pubblica, non quelli di /modifica
      for (const c of await contrasti(page, ".mf-app", [CHAT, ".mod-anteprima"])) {
        const chiave = `${c.dove}|${c.colore}|${c.sfondo}`;
        if (!fuori.has(chiave)) fuori.set(chiave, `${dove}: ${JSON.stringify(c)}`);
      }
    };

    for (const tema of ["dark", "light"] as const) {
      await setTemaCookie(context, baseURL!, tema);
      await page.goto(`/${handle}/modifica`);
      await idratata(page);
      expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(tema);
      for (const v of VISTE) {
        await vaiA(page, v);
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
        await scansiona(`${tema} #${v}`);
      }

      // una notifica (con «Annulla»)
      await vaiA(page, "persone");
      await page.locator("section#persone").getByLabel("Nuova persona").fill(`Canarino Notifica ${tema}`);
      await page.locator("section#persone").getByRole("button", { name: "Aggiungi" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Persona aggiunta." })).toBeVisible();
      await scansiona(`${tema} notifica`);
      // il pannello di una persona
      await page.locator("section#persone").getByRole("button", { name: "Apri Lu", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Lu", exact: true })).toBeVisible();
      await scansiona(`${tema} pannello persona`);
      await page.getByRole("dialog", { name: "Lu", exact: true }).getByRole("button", { name: "Chiudi" }).click();

      // il menu ⋯ di una riga, il pannello di un festival e quello di un concerto nuovo mandato vuoto
      await vaiA(page, "concerti");
      await riga(page, "Canarino Fest").getByRole("button", { name: /^Altre azioni per/ }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await scansiona(`${tema} menu riga`);
      await page.keyboard.press("Escape");
      await menuRiga(page, riga(page, "Canarino Fest"), "Modifica");
      const festival = page.getByRole("dialog", { name: "Modifica festival" });
      await expect(festival).toBeVisible();
      await scansiona(`${tema} pannello festival`);
      await festival.getByRole("button", { name: "Chiudi" }).click();
      await expect(festival).toHaveCount(0);
      await page.goto(`/${handle}/modifica#concerti?nuovo=concerto`);
      const nuovo = page.getByRole("dialog", { name: "Nuovo concerto" });
      await nuovo.getByRole("button", { name: "Salva", exact: true }).click();
      await expect(nuovo.getByRole("alert").filter({ hasText: "Controlla" })).toBeVisible();
      await scansiona(`${tema} pannello nuovo con errori`);
      await nuovo.getByRole("button", { name: "Chiudi" }).click();
      await expect(nuovo).toHaveCount(0);

      // la testa dell'Oracolo (il corpo è della chat) e, sul telefono, il foglio «Altro»
      const schede = page.getByRole("navigation", { name: "Sezioni principali" });
      if (telefono) {
        await schede.getByRole("button", { name: "Altro", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Tutte le sezioni" })).toBeVisible();
        await scansiona(`${tema} foglio Altro`);
        await page.goBack();
        await schede.getByRole("button", { name: "Apri L'Oracolo in scrittura" }).click();
      } else {
        await page.getByRole("button", { name: "Apri L'Oracolo in scrittura" }).click();
      }
      const oracolo = page.getByRole("dialog", { name: "L'Oracolo in scrittura" });
      await expect(oracolo).toBeVisible();
      await scansiona(`${tema} Oracolo`);
      await oracolo.getByRole("button", { name: "Chiudi L'Oracolo", exact: true }).click();
      await expect(oracolo).toBeHidden();
    }
    expect([...fuori.values()], [...fuori.values()].join("\n")).toEqual([]);
  });

  test("struttura: «Vai al contenuto», landmark con un nome, un h1 per vista", async ({ page }, info) => {
    test.setTimeout(180_000);
    const telefono = info.project.name === "mobile";
    const handle = await proprietaria(page);
    await page.goto(`/${handle}/modifica`);
    await idratata(page);

    // dopo i comandi dello Shell (tema e Sul palco · I dati · Modifica), prima di ogni controllo
    // dell'app: il link per saltare al contenuto, che si vede e porta il focus a <main>
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const salta = page.getByRole("link", { name: "Vai al contenuto" });
    for (let i = 0; i < 6 && !(await salta.evaluate(a => a === document.activeElement)); i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest(".mf-app")), "un controllo dell'app prima di «Vai al contenuto»").toBe(false);
    }
    await expect(salta).toBeFocused();
    const box = await salta.boundingBox();
    expect(box && box.y >= 0 && box.width > 0).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();

    await expect(page.getByRole("main")).toHaveCount(1);
    if (telefono) await expect(page.getByRole("navigation", { name: "Sezioni principali" })).toBeVisible();
    else await expect(page.getByRole("navigation", { name: "Sezioni di Modifica" })).toBeVisible();
    for (const v of VISTE) {
      await vaiA(page, v);
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      // un h1 solo, quello della vista, e sotto i titoli non saltano livelli
      await expect(page.locator("h1:visible")).toHaveCount(1);
      await expect(page.locator(`#${v}-titolo`)).toBeVisible();
      const livelli = await page.locator(`section#${v}`).evaluate(s =>
        [...s.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(h => h.checkVisibility()).map(h => Number(h.tagName[1])),
      );
      expect(livelli[0], `#${v}: il primo titolo`).toBe(1);
      expect(livelli.filter((l, i) => i > 0 && l > livelli[i - 1] + 1), `#${v}: livelli dei titoli ${livelli.join(",")}`).toEqual([]);
      // ogni pulsante e link visibile ha un nome
      const senzaNome = await page.locator(`section#${v}`).evaluate(s =>
        [...s.querySelectorAll<HTMLElement>("button, a[href], [role=button], input:not([type=hidden]), select, textarea")]
          .filter(el => el.checkVisibility())
          .filter(el => {
            const n = (el.getAttribute("aria-label") ?? "").trim() || (el.getAttribute("aria-labelledby") ? "x" : "") || (el.textContent ?? "").trim() || el.getAttribute("title") || "";
            const etichetta = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            return !n && !etichetta && !el.closest("label") && !(el as HTMLInputElement).labels?.length;
          })
          .map(el => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`),
      );
      expect(senzaNome, `#${v}: controlli senza nome`).toEqual([]);
    }
  });

  test("desktop, solo tastiera: il pannello accanto all'Oracolo agganciato", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "l'aggancio c'è solo da 1024 px");
    test.setTimeout(180_000);
    const handle = await proprietaria(page);
    await page.goto(`/${handle}/modifica`);
    await idratata(page);
    const oracolo = page.getByRole("dialog", { name: "L'Oracolo in scrittura" });
    const composer = oracolo.getByRole("textbox", { name: "Messaggio per l'Oracolo" });

    // l'Oracolo dal suo pulsante, con la tastiera: il focus nella casella
    const toggle = page.getByRole("button", { name: "Apri L'Oracolo in scrittura" });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(composer).toBeFocused();

    // una riga dall'elenco, con la tastiera: il pannello si apre accanto e prende il focus
    const apri = elenco(page).getByRole("button", { name: "Modifica Canarino Due del 01/06/2025" });
    await apri.focus();
    await page.keyboard.press("Enter");
    const pannello = page.getByRole("dialog", { name: "Modifica concerto" });
    await expect(pannello).toBeVisible();
    expect(await pannello.evaluate(d => d.contains(document.activeElement))).toBe(true);
    expect(await pannello.evaluate(d => d.matches(":modal"))).toBe(false);

    // niente trappola: dall'ultimo controllo del pannello Tab porta nell'Oracolo, Maiusc+Tab torna indietro
    const salva = pannello.getByRole("button", { name: "Salva", exact: true });
    await salva.focus();
    await page.keyboard.press("Tab");
    expect(await oracolo.evaluate(d => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect(salva).toBeFocused();

    // Esc nell'Oracolo chiude solo l'Oracolo; il focus torna al pulsante che l'aveva aperto
    await composer.focus();
    await page.keyboard.press("Escape");
    await expect(oracolo).toBeHidden();
    await expect(pannello).toBeVisible();
    await expect(page.getByRole("button", { name: "Apri L'Oracolo in scrittura" })).toBeFocused();

    // riaperto, Esc nel pannello chiude solo il pannello; il focus torna alla riga
    await page.keyboard.press("Enter");
    await expect(composer).toBeFocused();
    await pannello.locator('input[name="artist"]').focus();
    await page.keyboard.press("Escape");
    await expect(pannello).toHaveCount(0);
    await expect(oracolo).toBeVisible();
    await expect(apri).toBeFocused();

    // con modifiche: Esc nel pannello chiede, e la domanda è modale (il focus resta lì)
    await page.keyboard.press("Enter");
    await expect(pannello).toBeVisible();
    await pannello.locator('input[name="artist"]').fill("Canarino Due bis");
    await page.keyboard.press("Escape");
    const guardia = page.getByRole("dialog", { name: "Modifiche non salvate" });
    await expect(guardia.getByRole("button", { name: "Continua a modificare" })).toBeFocused();
    await page.keyboard.press("Tab");
    expect(await guardia.evaluate(d => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(guardia).toHaveCount(0);
    await expect(pannello.locator('input[name="artist"]')).toHaveValue("Canarino Due bis");
    await pannello.getByRole("button", { name: "Annulla" }).click();
    await page.getByRole("dialog", { name: "Modifiche non salvate" }).getByRole("button", { name: "Esci senza salvare" }).click();
    await expect(pannello).toHaveCount(0);
  });

  test("desktop, solo tastiera: con Tab ogni controllo mostra il focus", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "il focus da tastiera si prova sul desktop");
    test.setTimeout(300_000);
    const handle = await proprietaria(page);
    await page.goto(`/${handle}/modifica`);
    await idratata(page);
    await senzaTransizioni(page);
    const invisibili: string[] = [];

    /** Tab da `inizio` finché il focus resta dentro `dentro` (al massimo `passi` volte). */
    const giro = async (dove: string, inizio: string, dentro: string, passi = 80) => {
      await page.locator(inizio).first().focus();
      for (let i = 0; i < passi; i++) {
        await page.keyboard.press("Tab");
        const ancora = await page.evaluate(sel => !!document.activeElement?.closest(sel), dentro);
        if (!ancora) break;
        const x = await fuocoInvisibile(page);
        if (x) invisibili.push(`${dove}: ${x}`);
      }
    };

    await giro("navigazione", "nav.modifica-indice a", "nav.modifica-indice", 20);
    for (const v of VISTE) {
      await vaiA(page, v);
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      await giro(`#${v}`, `#${v}-titolo`, `section#${v}`);
    }
    await vaiA(page, "concerti");
    await menuRiga(page, riga(page, "Canarino Fest"), "Modifica");
    await expect(page.getByRole("dialog", { name: "Modifica festival" })).toBeVisible();
    await giro("pannello festival", "dialog.mf-pannello h2", "dialog.mf-pannello", 120);
    await page.getByRole("dialog", { name: "Modifica festival" }).getByRole("button", { name: "Chiudi" }).click();

    expect([...new Set(invisibili)], invisibili.join("\n")).toEqual([]);
  });

  test("telefono: bersagli da 44 px", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "solo sul telefono (pointer coarse)");
    test.setTimeout(240_000);
    const handle = await proprietaria(page);
    await page.goto(`/${handle}/modifica`);
    await idratata(page);
    const piccoli: string[] = [];
    const misura = async (dove: string, radice = ".mf-app") => {
      for (const b of await bersagliPiccoli(page, radice, 44, [CHAT])) piccoli.push(`${dove}: ${JSON.stringify(b)}`);
    };

    for (const v of VISTE) {
      await vaiA(page, v);
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      await misura(`#${v}`);
    }
    await vaiA(page, "concerti");
    await riga(page, "Canarino Fest").getByRole("button", { name: /^Altre azioni per/ }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await misura("menu riga", ".mf-menu:popover-open");
    await page.getByRole("menuitem", { name: "Modifica" }).click();
    await expect(page.getByRole("dialog", { name: "Modifica festival" })).toBeVisible();
    await misura("pannello festival", "dialog.mf-pannello");
    await page.getByRole("dialog", { name: "Modifica festival" }).getByRole("button", { name: "Chiudi" }).click();
    await page.getByRole("navigation", { name: "Sezioni principali" }).getByRole("button", { name: "Altro", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Tutte le sezioni" })).toBeVisible();
    await misura("foglio Altro", "dialog.mf-foglio");

    expect([...new Set(piccoli)], piccoli.join("\n")).toEqual([]);
  });
});
