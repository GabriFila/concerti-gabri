/* ──────────────────────────────────────────────────────────────
   Le pagine nelle tre forme grammaticali e lo stile del profilo
   (PIANO traguardo 4).

   Tre profili di prova con gli stessi concerti, uno per forma (f "Giulia",
   m "Marco", n "Alex"): ogni etichetta in prima persona segue la forma
   (titoli di mappa e vicinanza, TOC, KPI e filtro "da solo/a", legenda del
   5★, commenti, Ritratto) e al posto di "Gabri" c'è il nome del profilo.
   Poi il tema: i token di un preset arrivano già nell'HTML SSR, in un
   <style> dopo styles.css; il tema predefinito non aggiunge niente.

   In fondo, solo su desktop, gli screenshot da far guardare a Gabri: le
   tre forme, i preset (scuro e chiaro) e i quattro font dei titoli, in
   e2e-shots/forme/ (fuori da git).

   Solo dati di prova sul Convex LOCALE del worktree (helpers/profili.ts).
   ────────────────────────────────────────────────────────────── */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { idratata } from "./helpers/auth.ts";
import { http } from "./helpers/http.ts";
import { watchErrors } from "./helpers/idratazione.ts";
import { prepara, type ConcertoDiProva, type Forma } from "./helpers/profili.ts";
import { setTemaCookie } from "./helpers/tema.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

const CONCERTI: ConcertoDiProva[] = [
  { date: "2025-03-10", artist: "Primo", voto: 5, vicinanza: 6, canzoniNote: 4, cost: 40 },
  { date: "2025-05-10", artist: "Secondo", venue: "Politeama Genovese", city: "Genova", with: ["Ale"], voto: 4, vicinanza: 4, canzoniNote: 3, cost: 30, comments: "Serata splendida" },
  { date: "2025-09-12", artist: "Terzo", venue: "Alcatraz", with: ["Ale"], voto: 3, vicinanza: 2, canzoniNote: 2, cost: 25 },
  { date: "2026-11-20", artist: "Quarto", venue: "Alcatraz" },
];

const FORME: Record<Forma, { handle: `e2e-${string}`; nome: string; atteso: Record<string, string> }> = {
  f: {
    handle: "e2e-forma-f", nome: "Giulia",
    atteso: { mappa: "Dove sono andata", vicinanza: "Quanto sono vicina", kpi: "Concerti da sola", filtro: "Da sola", voto5: "se non ci fossi stata mi sarei buttata", commenti: "Quello che mi sono segnata dopo la serata.", ritratto: "concerti vissuti da sola" },
  },
  m: {
    handle: "e2e-forma-m", nome: "Marco",
    atteso: { mappa: "Dove sono andato", vicinanza: "Quanto sono vicino", kpi: "Concerti da solo", filtro: "Da solo", voto5: "se non ci fossi stato mi sarei buttato", commenti: "Quello che mi sono segnato dopo la serata.", ritratto: "concerti vissuti da solo" },
  },
  n: {
    handle: "e2e-forma-n", nome: "Alex",
    atteso: { mappa: "Dove ho visto concerti", vicinanza: "Quanto mi avvicino al palco", kpi: "Concerti senza compagnia", filtro: "Senza compagnia", voto5: "se l'avessi perso non me lo sarei mai perdonato", commenti: "Quello che ho annotato dopo la serata.", ritratto: "concerti vissuti senza compagnia" },
  },
};

/** Le parole al maschile che una pagina f o n non deve mai mostrare. */
const MASCHILI = /\b(andato|vicino|da solo|segnato|stato|buttato)\b/;
const FEMMINILI = /\b(andata|vicina|da sola|segnata|stata|buttata)\b/;

// i profili di prova esistono solo sul Convex locale: sulla preview (§8.4) questa spec non gira
test.beforeEach(({}, testInfo) => {
  test.skip(onPreview(testInfo.project.name), "i profili di prova vivono solo sul Convex locale");
});

test.beforeAll(({}, testInfo) => {
  if (onPreview(testInfo.project.name)) return;
  for (const [forma, p] of Object.entries(FORME) as [Forma, (typeof FORME)[Forma]][]) {
    prepara({ handle: p.handle, displayName: p.nome, forma, persone: ["Ale"], concerti: CONCERTI });
  }
});

for (const [forma, p] of Object.entries(FORME) as [Forma, (typeof FORME)[Forma]][]) {
  test.describe(`forma ${forma} (${p.nome})`, () => {
    test("I dati: titoli, TOC, KPI, filtro, legenda e commenti", async ({ page }) => {
      const errori = watchErrors(page);
      await page.goto(`/${p.handle}/dati`);
      await expect(page).toHaveTitle(`${p.nome} ai concerti`);
      await expect(page.locator("#sec-mappa h2")).toHaveText(p.atteso.mappa);
      await expect(page.locator("#sec-vicinanza h2")).toHaveText(p.atteso.vicinanza);
      await expect(page.locator(".kpi .lbl").filter({ hasText: /^Concerti (da|senza)/ })).toHaveText(p.atteso.kpi);
      await expect(page.locator("#sec-voti .starlegend")).toContainText(p.atteso.voto5);
      await expect(page.locator("#sec-commenti .desc")).toHaveText(p.atteso.commenti);

      // l'indice elenca le sezioni con i titoli della forma
      await page.getByRole("button", { name: "Indice della pagina" }).click();
      const toc = page.locator(".tocpop .toc-link");
      await expect(toc.filter({ hasText: p.atteso.mappa })).toHaveCount(1);
      await expect(toc.filter({ hasText: p.atteso.vicinanza })).toHaveCount(1);
      await page.keyboard.press("Escape");

      // il filtro "nessun compagno", in testa all'elenco dei compagni
      await page.locator(".filterbtn").filter({ hasText: "Filtri" }).click();
      await page.locator(".fsec").filter({ hasText: "Compagni" }).locator(".ssel-field").click();
      await expect(page.locator(".ssel-pop .ssel-otxt").first()).toHaveText(p.atteso.filtro);

      const testo = await page.locator("main").innerText();
      if (forma !== "m") expect(testo).not.toMatch(MASCHILI);
      if (forma === "n") expect(testo).not.toMatch(FEMMINILI);
      expect(errori.hydration()).toEqual([]);
    });

    test("Sul palco: il nome del profilo al posto di Gabri e il Ritratto nella forma", async ({ page }) => {
      const errori = watchErrors(page);
      await page.goto(`/${p.handle}`);
      await expect(page.locator(".rt-h1")).toContainText(p.nome);
      await expect(page.locator(".rt-peopleact .rt-lead")).toContainText(p.atteso.ritratto);
      await expect(page.locator(".rt-oracolo-pitch")).toContainText(`ogni concerto di ${p.nome}`);
      const tutto = await page.locator(".rt").innerText();
      expect(tutto).not.toContain("Gabri");
      if (forma !== "m") expect(tutto).not.toMatch(MASCHILI);
      expect(errori.hydration()).toEqual([]);
    });
  });
}

test.describe("stile del profilo", () => {
  test.beforeAll(({}, testInfo) => {
    if (onPreview(testInfo.project.name)) return;
    prepara({ handle: "e2e-stile", displayName: "Neon", forma: "n", theme: { preset: "neon" }, persone: ["Ale"], concerti: CONCERTI.slice(0, 2) });
  });

  test("i token del preset sono già nell'HTML SSR; il predefinito non aggiunge niente", async ({ baseURL }) => {
    const html = await (await http(new URL("/e2e-stile/dati", baseURL).href)).text();
    const style = html.match(/<style[^>]*>([^<]*--lamp:[^<]*)<\/style>/)?.[1] ?? "";
    expect(style).toContain("--lamp:#ff4fa3");
    expect(style).toContain("--font-titoli:'Space Grotesk'");
    expect(style).toContain('[data-theme="light"]{--lamp:#');
    // dopo i fogli di stile: vince a parità di specificità
    expect(html.indexOf(style)).toBeGreaterThan(html.lastIndexOf('rel="stylesheet"'));
    const gabri = await (await http(new URL("/gabrifila/dati", baseURL).href)).text();
    expect(gabri).not.toMatch(/<style[^>]*>[^<]*--lamp:/);
  });

  test("nel browser: accento in scuro, versione scurita in chiaro, font dei titoli", async ({ page, context, baseURL }) => {
    await page.goto("/e2e-stile/dati");
    const lamp = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--lamp").trim());
    expect(await lamp()).toBe("#ff4fa3");
    expect(await page.locator("#sec-mappa h2").evaluate(el => getComputedStyle(el).fontFamily)).toContain("Space Grotesk");
    expect(await page.locator(".panel").first().evaluate(el => getComputedStyle(el).borderTopLeftRadius)).toBe("4px");
    await setTemaCookie(context, baseURL!, "light");
    await page.reload();
    const chiaro = await lamp();
    expect(chiaro).toMatch(/^#[0-9a-f]{6}$/);
    expect(chiaro).not.toBe("#ff4fa3");
    // la pagina di Gabri resta quella di sempre
    await page.goto("/gabrifila/dati");
    expect(await lamp()).toBe("#e0a82e");
    expect(await page.locator("#sec-mappa h2").evaluate(el => getComputedStyle(el).fontFamily)).toContain("Fraunces");
  });

  test("tema cambiato dal vivo: il <style> si aggiorna e il loader di root non rigira", async ({ page }) => {
    const handle = "e2e-stile-vivo";
    prepara({ handle, displayName: "Vivo", forma: "n", theme: { preset: "neon" }, concerti: CONCERTI.slice(0, 1) });
    await page.goto(`/${handle}/dati`);
    await idratata(page);
    const lamp = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--lamp").trim());
    expect(await lamp()).toBe("#ff4fa3");
    // il loader di root (now, tema, origine) è una server function: dopo
    // l'idratazione non deve ripartire (§1.3), nemmeno quando cambia il tema
    const serverFn: string[] = [];
    page.on("request", r => { if (r.url().includes("/_serverFn/")) serverFn.push(r.url()); });
    prepara({ handle, displayName: "Vivo", forma: "n", theme: { preset: "teatro" }, concerti: CONCERTI.slice(0, 1) });
    await expect.poll(lamp).toBe("#e2553f");
    expect(serverFn).toEqual([]);
  });
});

test.describe("screenshot per Gabri", () => {
  const DIR = join(process.cwd(), "e2e-shots", "forme");

  test("tre forme, tre preset in scuro e in chiaro, quattro font", async ({ page, context, baseURL }, info) => {
    test.skip(info.project.name !== "desktop", "una volta basta");
    test.setTimeout(300_000);
    mkdirSync(DIR, { recursive: true });
    const scatta = async (nome: string) => {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(DIR, `${nome}.png`) });
    };

    // le forme: l'indice aperto (titoli di mappa e vicinanza) e la card della vicinanza
    for (const [forma, p] of Object.entries(FORME) as [Forma, (typeof FORME)[Forma]][]) {
      await page.goto(`/${p.handle}/dati`);
      await page.getByRole("button", { name: "Indice della pagina" }).click();
      await scatta(`forma-${forma}-indice`);
      await page.keyboard.press("Escape");
      await page.locator("#sec-vicinanza").scrollIntoViewIfNeeded();
      await scatta(`forma-${forma}-vicinanza`);
    }

    // preset e font su un solo profilo, cambiando il tema tra uno scatto e l'altro
    const handle = "e2e-stile-shot";
    const vai = async (theme: { preset: string; fontTitoli?: string }, nome: string, temi: ("dark" | "light")[]) => {
      prepara({ handle, displayName: "Stile", forma: "n", theme, persone: ["Ale"], concerti: CONCERTI });
      for (const t of temi) {
        await setTemaCookie(context, baseURL!, t);
        await page.goto(`/${handle}/dati`);
        // il router ripristina lo scorrimento della visita precedente: le KPI stanno in cima
        await page.evaluate(() => window.scrollTo(0, 0));
        await scatta(`${nome}-${t}-kpi`);
        await page.locator("#sec-vicinanza").scrollIntoViewIfNeeded();
        await scatta(`${nome}-${t}-card`);
      }
    };
    for (const preset of ["predefinito", "neon", "teatro"]) await vai({ preset }, `preset-${preset}`, ["dark", "light"]);
    for (const font of ["fraunces", "inter", "space-grotesk", "playfair-display"]) await vai({ preset: "predefinito", fontTitoli: font }, `font-${font}`, ["dark"]);
    await setTemaCookie(context, baseURL!, "dark");
  });
});
