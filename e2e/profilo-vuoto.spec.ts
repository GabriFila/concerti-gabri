/* ──────────────────────────────────────────────────────────────
   Profili lontani da quello di Gabri (PIANO traguardo 4):
   - stati vuoti: nessun concerto, solo concerti in programma, un anno
     solo. Le due pagine si aprono senza NaN né errori, e le regole di
     §1.33 non inventano anni o città;
   - layout: una sezione nascosta sparisce dalla pagina e dall'indice, un
     titolo personalizzato compare nella card e nell'indice, l'ordine scelto
     vale anche nel DOM;
   - km in attesa (§1.37): "—" nella colonna Viaggio con il titolo
     "distanza non ancora calcolata", la KPI dei km dice quanti viaggi
     aspettano;
   - contenuti personali (§1.34): credito e tappi solo se il profilo li ha;
   - avvisi di manutenzione (§1.36): il visitatore non li vede mai; il
     proprietario sì (spec @sessione: il login arriva con la corsia 3).
   ────────────────────────────────────────────────────────────── */

import { accediConOtp, nuovoProprietario } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { watchErrors } from "./helpers/idratazione.ts";
import { prepara, type ConcertoDiProva } from "./helpers/profili.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

const NIENTE_NAN = /NaN|Infinity|undefined/;

const VUOTI: { handle: `e2e-${string}`; nome: string; concerti: ConcertoDiProva[]; media: RegExp }[] = [
  { handle: "e2e-vuoto", nome: "Nessuno", concerti: [], media: /^0\.0$/ },
  {
    handle: "e2e-programma", nome: "Futuro",
    concerti: [{ date: "2026-11-20", artist: "Il primo", cost: 40 }, { date: "2027-03-02", artist: "Il secondo", venue: "Alcatraz" }],
    media: /^0\.0$/,
  },
  {
    handle: "e2e-anno", nome: "Annata",
    concerti: [{ date: "2026-02-14", artist: "Uno", voto: 4, vicinanza: 5, canzoniNote: 3, cost: 30 }, { date: "2026-06-01", artist: "Due", venue: "Alcatraz", voto: 5, vicinanza: 6, canzoniNote: 5 }],
    media: /^\d+\.\d$/,
  },
];

// i profili di prova esistono solo sul Convex locale: sulla preview (§8.4) questa spec non gira
test.beforeEach(({}, testInfo) => {
  test.skip(onPreview(testInfo.project.name), "i profili di prova vivono solo sul Convex locale");
});

test.beforeAll(({}, testInfo) => {
  if (onPreview(testInfo.project.name)) return;
  for (const p of VUOTI) prepara({ handle: p.handle, displayName: p.nome, forma: "n", concerti: p.concerti });
});

test.describe("stati vuoti", () => {
  for (const p of VUOTI) {
    test(`${p.handle}: Sul palco e I dati senza NaN né errori`, async ({ page }) => {
      const errori = watchErrors(page);
      await page.goto(`/${p.handle}`);
      await expect(page.locator(".rt-h1")).toContainText(p.nome);
      expect(await page.locator("body").innerText()).not.toMatch(NIENTE_NAN);
      await page.goto(`/${p.handle}/dati`);
      await expect(page.locator(".kpi")).toHaveCount(12);
      const media = page.locator(".kpi").filter({ hasText: "media per anno" });
      await expect(media.locator(".num")).toHaveText(p.media);
      expect(await page.locator("body").innerText()).not.toMatch(NIENTE_NAN);
      // nessun anno né città inventati: "dal 2022" e "% a Milano" erano di Gabri
      const kpi = await page.locator("#sec-kpis").innerText();
      expect(kpi).not.toContain("dal 2022");
      if (p.handle !== "e2e-anno") expect(kpi).not.toMatch(/% a /);
      else expect(kpi).toContain("dal 2026 a oggi");
      expect(errori.hydration()).toEqual([]);
    });
  }

  test("senza contenuti personali niente credito né tappi; con, sì", async ({ page }) => {
    await page.goto("/e2e-programma");
    await expect(page.locator(".rt-nextact")).toBeVisible();
    await expect(page.locator(".rt-earplugs")).toHaveCount(0);
    await expect(page.locator(".rt-endcredits-note")).toHaveCount(0);
    await page.goto("/e2e-programma/dati");
    await expect(page.locator(".sitefooter p")).toHaveCount(0);

    prepara({
      handle: "e2e-extra", displayName: "Extra", forma: "f",
      extra: { creditoFooter: "Grazie a chi c'era", linkTappi: "https://example.com/tappi" },
      concerti: [{ date: "2026-12-01", artist: "Qualcuno" }],
    });
    await page.goto("/e2e-extra");
    await expect(page.locator(".rt-earplugs-cta")).toHaveAttribute("href", "https://example.com/tappi");
    await expect(page.locator(".rt-endcredits-note")).toHaveText("Grazie a chi c'era");
    await page.goto("/e2e-extra/dati");
    await expect(page.locator(".sitefooter p")).toHaveText("Grazie a chi c'era");
  });
});

test.describe("layout del profilo", () => {
  test.beforeAll(({}, testInfo) => {
    if (onPreview(testInfo.project.name)) return;
    prepara({
      handle: "e2e-layout", displayName: "Layout", forma: "f",
      layout: { ordine: ["sec-archivio", "sec-giorni"], nascoste: ["sec-spesa", "sec-artisti"], titoli: { "sec-mappa": "I miei viaggi" } },
      concerti: [{ date: "2025-04-10", artist: "Uno", voto: 4, cost: 20 }, { date: "2025-06-10", artist: "Due", venue: "Alcatraz", voto: 3, cost: 35 }],
    });
  });

  test("sezione nascosta, titolo personalizzato e ordine, nella pagina e nell'indice", async ({ page }) => {
    await page.goto("/e2e-layout/dati");
    await expect(page.locator("#sec-spesa")).toHaveCount(0);
    await expect(page.locator("#sec-artisti")).toHaveCount(0);
    await expect(page.locator("#sec-mappa h2")).toHaveText("I miei viaggi");
    // le altre etichette restano quelle della forma
    await expect(page.locator("#sec-vicinanza h2")).toHaveText("Quanto sono vicina");
    // l'ordine scelto: archivio e giorni prima dell'andamento; "giorni" senza
    // la sua compagna accanto prende tutta la riga
    const ids = await page.locator("main .tocsec").evaluateAll(els => els.map(e => e.id));
    expect(ids.slice(0, 3)).toEqual(["sec-archivio", "sec-giorni", "sec-andamento"]);
    await expect(page.locator("#sec-giorni")).toHaveClass(/\bfull\b/);
    expect(ids).not.toContain("sec-spesa");

    await page.getByRole("button", { name: "Indice della pagina" }).click();
    const voci = await page.locator(".tocpop .toc-link").allInnerTexts();
    expect(voci.map(v => v.trim())).toContain("I miei viaggi");
    expect(voci.map(v => v.trim())).not.toContain("Quanto spendo");
    expect(voci.map(v => v.trim())).not.toContain("Chi ho visto di più");
    expect(voci[0].trim()).toBe("Riepilogo");
    expect(voci[1].trim()).toBe("Archivio");
  });
});

test.describe("km in attesa e avvisi", () => {
  test.beforeAll(({}, testInfo) => {
    if (onPreview(testInfo.project.name)) return;
    // partenza "Casa" senza indirizzo: il viaggio aspetta i km; i concerti
    // passati senza voto né vicinanza farebbero scattare gli avvisi
    prepara({
      handle: "e2e-km", displayName: "Viaggiatore", forma: "m", partenze: ["Casa"],
      concerti: [{ date: "2025-10-02", artist: "In attesa", from: "Casa", cost: 30 }, { date: "2025-11-02", artist: "Senza voto", venue: "Alcatraz" }],
    });
  });

  test("Viaggio: '—' con il titolo, la KPI dei km dice quanti viaggi aspettano", async ({ page }) => {
    await page.goto("/e2e-km/dati");
    const riga = page.locator("#sec-archivio tbody tr").filter({ hasText: "In attesa" });
    const km = riga.locator("td.km .kmpending");
    await expect(km).toHaveText("—");
    await expect(km).toHaveAttribute("title", "distanza non ancora calcolata");
    const card = page.locator(".kpi").filter({ hasText: "Km di viaggi" });
    await expect(card.locator(".num")).toHaveText("0");
    await expect(card.locator(".hint")).toHaveText("andata e ritorno (1 viaggio in attesa)");
  });

  test("il visitatore non vede gli avvisi di manutenzione", async ({ page }) => {
    await page.goto("/e2e-km/dati");
    await expect(page.locator("#sec-kpis")).toBeVisible();
    await expect(page.locator(".vicalert")).toHaveCount(0);
    expect(await page.content()).not.toContain("senza voto:");
  });

  test("il proprietario vede gli avvisi, il visitatore no", { tag: "@sessione" }, async ({ page, browser }) => {
    const io = await nuovoProprietario(page, { forma: "m", nome: "Proprietario" });
    // un concerto passato senza voto, vicinanza né partenza sulla SUA pagina
    convexRun("devtools:addEntry", { handle: io.handle, entry: { kind: "concert", date: "2025-10-02", artist: "Da completare", venue: "Fabrique", city: "Milano", with: [] } });
    await page.goto(`/${io.handle}/dati`);
    await expect(page.locator(".vicalert")).toHaveCount(3);
    await expect(page.locator(".vicalert").first()).toContainText("Da completare");
    // anche nell'HTML SSR delle sue pagine (fetch dal browser, con la sua sessione)
    expect(await page.evaluate(() => fetch(location.href).then(r => r.text()))).toContain("vicalert");
    // un altro browser, senza sessione: niente avvisi
    const anonimo = await browser.newContext();
    try {
      const p2 = await anonimo.newPage();
      await p2.goto(`/${io.handle}/dati`);
      await expect(p2.locator("#sec-kpis")).toBeVisible();
      await expect(p2.locator(".vicalert")).toHaveCount(0);
    } finally {
      await anonimo.close();
    }
    // e un altro proprietario non vede quelli di questa pagina
    const altro = await browser.newContext();
    try {
      const p3 = await altro.newPage();
      await accediConOtp(p3, `e2e-altro-${Date.now()}@example.com`);
      await p3.goto(`/${io.handle}/dati`);
      await expect(p3.locator(".vicalert")).toHaveCount(0);
    } finally {
      await altro.close();
    }
  });
});
