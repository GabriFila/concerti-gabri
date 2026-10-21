/* ──────────────────────────────────────────────────────────────
   Playwright (PIANO §7 traguardo 1, §8). Chromium headless 1.62.1, che usa
   la revisione 1234 già presente in ~/.cache/ms-playwright.

     pnpm e2e                         progetti desktop e mobile, in locale
     pnpm e2e --grep @gemini          solo le spec che spendono una chiamata Gemini
     PREVIEW_URL=<url del branch> pnpm e2e:preview
                                      progetto preview (E2E_PREVIEW=1 da
                                      scripts/e2e.mjs), niente server locali

   In locale partono due server (webServer):
   - Start, la build di produzione (.output) con l'orologio congelato
     (E2E=1, E2E_NOW) e il fuso UTC come su Vercel, su
     http://localhost:3100: è un'origine ammessa dal token Mapbox, quindi
     la mappa è viva. Se la build è vecchia la rifà (scripts/e2e-server.mjs);
   - main, la build del branch `main` su http://localhost:4173, per la
     parità (scripts/parita-main.mjs, worktree /tmp/concerti-main).
   Un server già acceso su quelle porte NON si riusa (potrebbe essere il dev
   collegato a Convex, senza orologio congelato): Playwright si ferma con un
   errore. E2E_REUSE=1 lo permette, a proprio rischio.

   Risorse (PIANO §4.4): un worker, `pnpm e2e` sotto /tmp/concerti-e2e.lock.
   ────────────────────────────────────────────────────────────── */

import { defineConfig, devices } from "@playwright/test";
import { E2E_NOW } from "./e2e/helpers/now.ts";
import { MAIN_URL, START_URL } from "./e2e/helpers/urls.ts";

// Run sulla preview SOLO con E2E_PREVIEW=1, che imposta scripts/e2e.mjs per
// --project=preview: un PREVIEW_URL rimasto nell'ambiente non spegne mai i
// server locali né il controllo 127.0.0.1 di e2e/global-setup.ts.
const ANTEPRIMA = process.env.E2E_PREVIEW === "1" && !!process.env.PREVIEW_URL;
const PREVIEW_URL = ANTEPRIMA ? (process.env.PREVIEW_URL || "").replace(/\/+$/, "") : "";
const reuse = process.env.E2E_REUSE === "1";
// in una run sulla preview i progetti locali non girano (niente server locali)
const soloLocale = (ignora: RegExp[] = []) => (ANTEPRIMA ? [/.*/] : ignora);

export default defineConfig({
  testDir: "e2e",
  // app e helper sul deployment Convex LOCALE del worktree, mai sul dev condiviso
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "test-results",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: START_URL,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    // conteggi, scorrimenti e transizioni dell'app rispettano prefers-reduced-motion
    contextOptions: { reducedMotion: "reduce" },
    // portless serve https con un certificato locale
    ignoreHTTPSErrors: true,
    trace: "off",
    video: "off",
    screenshot: "off",
    launchOptions: {
      // SwiftShader: WebGL software, così Mapbox disegna anche headless
      args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 1000 } }, testIgnore: soloLocale() },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      // l'HTTP e l'Oracolo non dipendono dal viewport: bastano una volta
      testIgnore: soloLocale([/http\.spec\.ts/, /oracolo-sse\.spec\.ts/, /live\.spec\.ts/]),
    },
    {
      // l'URL del branch su Vercel (§8.4): trace e video spenti, bypass solo
      // verso quell'origine (e2e/helpers/bypass.ts). Senza PREVIEW_URL non
      // gira niente. La parità con main resta locale (serve E2E_NOW).
      name: "preview",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 1000 }, baseURL: PREVIEW_URL || undefined, trace: "off", video: "off" },
      // live.spec scrive con devtools: sulla preview lo fa solo l'orchestratore
      testIgnore: ANTEPRIMA ? [/parita\.spec\.ts/, /live\.spec\.ts/] : [/.*/],
    },
  ],
  webServer: ANTEPRIMA
    ? undefined
    : [
        {
          name: "start",
          command: "node scripts/e2e-server.mjs",
          url: `${START_URL}/gabrifila`,
          // TZ=UTC come le funzioni di Vercel: l'SSR non deve dipendere dal fuso
          // del server (t3node è in Europe/Rome e nasconderebbe gli errori)
          env: { PORT: "3100", TZ: "UTC", E2E: "1", E2E_NOW },
          reuseExistingServer: reuse,
          // può dover rifare la build
          timeout: 600_000,
          stdout: "ignore",
          stderr: "pipe",
        },
        {
          name: "main",
          command: "node scripts/parita-main.mjs",
          url: `${MAIN_URL}/`,
          reuseExistingServer: reuse,
          // la prima volta installa e costruisce main
          timeout: 900_000,
          stdout: "ignore",
          stderr: "pipe",
        },
      ],
});
