/* ──────────────────────────────────────────────────────────────
   Parità con `main` (PIANO §7, traguardo 1): 8 coppie di screenshot.

   main (`/`, `/dati`, build di scripts/parita-main.mjs su :4173) contro
   Start (`/gabrifila`, `/gabrifila/dati`, build di produzione su :3100),
   in scuro e in chiaro; il viewport lo dà il progetto (desktop, mobile
   Pixel 7): 2 pagine × 2 temi × 2 progetti = 8 coppie.

   Per ogni coppia:
   - stesso istante congelato (E2E_NOW): sul server per Start, con
     `clock.setFixedTime` nel browser per main (helpers/now.ts);
   - stessi testi delle card KPI e del Ritratto, stessi id `sec-*`, stesso
     testo di tutta la pagina;
   - stessa altezza della pagina e al massimo lo 0,2% di pixel diversi
     (pixelmatch, soglia 0,1), con `.mapwrap` e `.trendcanvas` mascherati;
   - zero errori di idratazione (ed eccezioni) su Start.

   Gli screenshot e le immagini delle differenze finiscono in
   e2e-shots/parita/ (fuori da git) e come allegati del test.
   ────────────────────────────────────────────────────────────── */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import type { Browser, BrowserContextOptions, Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { watchErrors } from "./helpers/idratazione.ts";
import { MASK_COLOR, MASK_SELECTORS, masks } from "./helpers/maschere.ts";
import { E2E_NOW, freezeClock } from "./helpers/now.ts";
import { setMainTheme, setTemaCookie, type Tema } from "./helpers/tema.ts";
import { expect, test } from "./helpers/test.ts";
import { MAIN_URL, START_URL } from "./helpers/urls.ts";

/** Al massimo lo 0,2% dei pixel diversi (PIANO). */
const MAX_DIFF_RATIO = 0.002;
const SHOTS = join(process.cwd(), "e2e-shots", "parita");

const PAGES = [
  { main: "/", start: "/gabrifila", slug: "palco" },
  { main: "/dati", start: "/gabrifila/dati", slug: "dati" },
] as const;
const TEMI: Tema[] = ["dark", "light"];

interface Capture {
  png: PNG;
  buf: Buffer;
  theme: string | null;
  /** Date.now() nel browser: per main deve essere l'istante congelato. */
  clock: number;
  texts: { kpis: string[]; stats: string[]; secs: string[]; body: string };
  errors: string[];
  hydration: string[];
}

/* Porta la pagina a riposo: scorre tutta la pagina (le sezioni si rivelano
   allo scroll), torna in cima, aspetta font e rete. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_000);
}

async function capture(browser: Browser, opts: BrowserContextOptions, side: "main" | "start", path: string, tema: Tema): Promise<Capture> {
  const context = await browser.newContext(opts);
  try {
    if (side === "main") {
      await setMainTheme(context, MAIN_URL, tema);
      await freezeClock(context);
    } else {
      await setTemaCookie(context, START_URL, tema);
    }
    const page = await context.newPage();
    const errors = watchErrors(page);
    await page.goto((side === "main" ? MAIN_URL : START_URL) + path, { waitUntil: "networkidle", timeout: 90_000 });
    await settle(page);
    const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    const clock = await page.evaluate(() => Date.now());
    const buf = await page.screenshot({ fullPage: true, animations: "disabled", mask: masks(page), maskColor: MASK_COLOR });
    const pageErrors = [...errors.all];
    // i testi dopo lo screenshot: per il testo della pagina le zone mascherate
    // si tolgono (la mappa di main sulla 4173 non ha token né tile, quella di
    // Start è viva: è la stessa differenza che la maschera nasconde ai pixel)
    const texts = await page.evaluate((maskSelectors: string[]) => {
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      const out = {
        kpis: [...document.querySelectorAll<HTMLElement>(".kpi")].map(k => norm(k.innerText)),
        stats: [...document.querySelectorAll<HTMLElement>(".rt-stat")].map(k => norm(k.innerText)),
        secs: [...document.querySelectorAll("[id^=sec-]")].map(e => e.id),
        body: "",
      };
      for (const sel of maskSelectors) document.querySelectorAll<HTMLElement>(sel).forEach(e => { e.style.display = "none"; });
      out.body = norm(document.body.innerText);
      return out;
    }, [...MASK_SELECTORS]);
    return { png: PNG.sync.read(buf), buf, theme, clock, texts, errors: pageErrors, hydration: errors.hydration(pageErrors) };
  } finally {
    await context.close();
  }
}

/** Ritaglia all'area comune (le altezze diverse sono già un fallimento a sé). */
function crop(p: PNG, w: number, h: number): PNG {
  if (p.width === w && p.height === h) return p;
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(p, out, 0, 0, w, h, 0, 0);
  return out;
}

for (const pg of PAGES) {
  for (const tema of TEMI) {
    test(`parità ${pg.start} (${tema}) con main ${pg.main}`, async (
      { browser, contextOptions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId },
      testInfo,
    ) => {
      test.setTimeout(240_000);
      // le stesse opzioni del progetto (dispositivo, fuso, reducedMotion) per i due contesti separati
      const opts: BrowserContextOptions = {
        ...contextOptions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId,
      };
      const main = await capture(browser, opts, "main", pg.main, tema);
      const start = await capture(browser, opts, "start", pg.start, tema);

      // immagini: sempre salvate, anche quando il confronto fallisce
      const name = `${testInfo.project.name}-${pg.slug}-${tema}`;
      const w = Math.min(main.png.width, start.png.width);
      const h = Math.min(main.png.height, start.png.height);
      const diff = new PNG({ width: w, height: h });
      const changed = pixelmatch(crop(main.png, w, h).data, crop(start.png, w, h).data, diff.data, w, h, { threshold: 0.1 });
      const ratio = changed / (w * h);
      mkdirSync(SHOTS, { recursive: true });
      const files = { main: `${name}-main.png`, start: `${name}-start.png`, diff: `${name}-diff.png` };
      writeFileSync(join(SHOTS, files.main), main.buf);
      writeFileSync(join(SHOTS, files.start), start.buf);
      writeFileSync(join(SHOTS, files.diff), PNG.sync.write(diff));
      for (const [label, file] of Object.entries(files)) {
        await testInfo.attach(label, { path: join(SHOTS, file), contentType: "image/png" });
      }
      const summary = `${name}: main ${main.png.width}x${main.png.height}, start ${start.png.width}x${start.png.height}, ${(ratio * 100).toFixed(4)}% pixel diversi`;
      testInfo.annotations.push({ type: "parità", description: summary });
      console.log("  " + summary);
      // riepilogo per Gabri accanto alle immagini (una riga per coppia, l'ultima run vince)
      const riepilogo = join(SHOTS, "riepilogo.json");
      const all = existsSync(riepilogo) ? JSON.parse(readFileSync(riepilogo, "utf8")) : {};
      all[name] = {
        main: files.main, start: files.start, diff: files.diff,
        size: { main: [main.png.width, main.png.height], start: [start.png.width, start.png.height] },
        diffPct: +(ratio * 100).toFixed(4), when: new Date().toISOString(),
      };
      writeFileSync(riepilogo, JSON.stringify(all, null, 2) + "\n");

      // main gira davvero all'istante congelato (per Start lo verifica il test più sotto)
      expect.soft(main.clock, "orologio di main").toBe(Date.parse(E2E_NOW));
      // il tema richiesto è davvero quello applicato, da entrambe le parti
      expect.soft(main.theme).toBe(tema);
      expect.soft(start.theme).toBe(tema);

      // testi: il cancello vero (PIANO §11, "parità pixel instabile")
      expect.soft(start.texts.secs).toEqual(main.texts.secs);
      expect.soft(start.texts.kpis).toEqual(main.texts.kpis);
      expect.soft(start.texts.stats).toEqual(main.texts.stats);
      if (pg.slug === "dati") {
        expect.soft(start.texts.kpis).toHaveLength(12);
        expect.soft(start.texts.secs.length).toBeGreaterThanOrEqual(18);
      } else {
        expect.soft(start.texts.stats.length).toBeGreaterThan(0);
      }
      expect.soft(start.texts.body).toBe(main.texts.body);

      // Start: niente errori di idratazione, e in console nessun errore di alcun tipo
      expect.soft(start.hydration, "errori di idratazione su Start").toEqual([]);
      expect.soft(start.errors, "errori ed eccezioni in console su Start").toEqual([]);

      // pixel: stessa pagina, stessa altezza, al massimo lo 0,2% diverso
      expect.soft(start.png.width, "larghezza della pagina").toBe(main.png.width);
      expect.soft(start.png.height, "altezza della pagina").toBe(main.png.height);
      expect.soft(ratio, `pixel diversi (${files.diff})`).toBeLessThanOrEqual(MAX_DIFF_RATIO);
    });
  }
}

/* L'orologio di Start è davvero quello congelato: l'istante del server arriva
   al client con l'idratazione, quindi è nell'HTML SSR. */
test("Start usa l'istante congelato E2E_NOW", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "basta una volta");
  const html = await (await request.get(`${START_URL}/gabrifila`)).text();
  expect(html).toContain(String(Date.parse(E2E_NOW)));
});

/* Controllo del controllo: "zero errori di idratazione" vale qualcosa solo se
   il rilevatore se ne accorge. Qui l'HTML SSR si altera di proposito (un testo
   che il client renderizza diverso) e l'errore deve comparire. */
test("controllo: un HTML SSR alterato fa scattare il rilevatore di idratazione", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "basta una volta");
  const errors = watchErrors(page);
  await page.route(`${START_URL}/gabrifila`, async route => {
    const res = await route.fetch();
    const html = (await res.text()).replace("Una vita contata in luci", "Una vita contata al buio");
    await route.fulfill({ response: res, body: html });
  });
  await page.goto(`${START_URL}/gabrifila`, { waitUntil: "networkidle" });
  await expect.poll(() => errors.hydration().length, { message: errors.all.join("\n") }).toBeGreaterThan(0);
});

/* Il confine di mezzanotte dal vivo: alle 00:30 del 19/11/2026 a Roma, in UTC
   è ancora il 18. Il concerto del 18/11/2026 è quindi già passato. Un secondo
   server Start (stessa build, porta libera qualunque, fuso UTC come Vercel)
   congela "adesso" lì; main riceve lo stesso istante nel browser, a Roma.
   Se l'SSR decidesse "oggi" col fuso del server, i KPI sarebbero quelli del
   giorno prima (80 concerti invece di 81). */
test("confine di mezzanotte: server in UTC, browser a Roma, stessi KPI di main", async (
  { browser, contextOptions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId },
  testInfo,
) => {
  test.skip(testInfo.project.name !== "desktop", "basta una volta");
  const AT = "2026-11-18T23:30:00Z";
  const port = await new Promise<number>((ok, ko) => {
    const srv = createServer().listen(0, "127.0.0.1", () => {
      const p = (srv.address() as { port: number }).port;
      srv.close(() => ok(p));
    }).on("error", ko);
  });
  const server = spawn(process.execPath, [".output/server/index.mjs"], {
    env: { ...process.env, PORT: String(port), TZ: "UTC", E2E: "1", E2E_NOW: AT, NODE_ENV: "production" },
    stdio: "ignore",
  });
  try {
    const origin = `http://127.0.0.1:${port}`;
    await expect.poll(async () => {
      try { return (await fetch(origin + "/gabrifila/dati")).status; } catch { return 0; }
    }, { timeout: 30_000 }).toBe(200);

    const opts: BrowserContextOptions = { ...contextOptions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId };
    const kpisOf = async (url: string, freeze: boolean) => {
      const context = await browser.newContext(opts);
      try {
        if (freeze) await context.clock.setFixedTime(new Date(AT));
        const page = await context.newPage();
        const errors = watchErrors(page);
        await page.goto(url, { waitUntil: "networkidle" });
        await expect(page.locator(".kpi")).toHaveCount(12);
        const kpis = await page.locator(".kpi").evaluateAll(els => els.map(e => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
        return { kpis, hydration: errors.hydration() };
      } finally {
        await context.close();
      }
    };
    const main = await kpisOf(`${MAIN_URL}/dati`, true);
    const start = await kpisOf(`${origin}/gabrifila/dati`, false);
    expect(start.hydration, "errori di idratazione su Start").toEqual([]);
    expect(start.kpis).toEqual(main.kpis);
    expect(start.kpis[0]).toMatch(/^81 /);
    expect(start.kpis[1]).toContain("prossimo 30/11/2026");
  } finally {
    server.kill("SIGTERM");
  }
});
