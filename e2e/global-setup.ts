/* ──────────────────────────────────────────────────────────────
   Prima di ogni run locale (PIANO §4.3 punto 5): gli e2e non girano MAI sul
   dev condiviso (agile-leopard-908) né su un altro deployment cloud.

   Playwright accende i webServer prima di questo setup. Qui si leggono:
   - l'URL Convex dell'helper: `devtools:whoami` attraverso
     scripts/convex-locale.mjs (la stessa strada dei test, e2e/helpers/convex.ts);
   - l'URL Convex dell'app servita: si apre /gabrifila in Chromium e si
     guarda a quale host si collega il WebSocket di Convex (lo stesso URL
     che l'SSR ha avuto al build, VITE_CONVEX_URL).
   Devono essere entrambi http://127.0.0.1 e coincidere, altrimenti la run
   si ferma prima del primo test. Si stampano solo host e porta locali.
   Si salta SOLO in una run sulla preview (E2E_PREVIEW=1, che imposta
   scripts/e2e.mjs per --project=preview e che spegne anche i progetti
   locali): lì il deployment è preview/multiutente e lo gestisce
   l'orchestratore. Un PREVIEW_URL da solo non salta niente.
   ────────────────────────────────────────────────────────────── */

import { chromium } from "@playwright/test";
import { whoami } from "./helpers/convex.ts";
import { START_URL } from "./helpers/urls.ts";

const CONDIVISI = /agile-leopard|brave-chickadee|\.convex\.cloud|\.convex\.site/i;

function locale(label: string, url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`e2e: ${label} non ha un URL Convex valido`);
  }
  if (CONDIVISI.test(u.host) || u.hostname !== "127.0.0.1") {
    throw new Error(`e2e: ${label} non punta al deployment Convex locale del worktree (127.0.0.1): mi fermo`);
  }
  return u;
}

async function urlDellApp(): Promise<string> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const ws = page.waitForEvent("websocket", { predicate: w => /\/api\/[^/]+\/sync/.test(w.url()), timeout: 60_000 });
    await page.goto(`${START_URL}/gabrifila`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const sock = await ws;
    // ws://127.0.0.1:3210/api/<versione>/sync → http://127.0.0.1:3210
    return sock.url().replace(/^ws/, "http").replace(/\/api\/.*$/, "");
  } finally {
    await browser.close();
  }
}

export default async function globalSetup() {
  if (process.env.E2E_PREVIEW === "1" && process.env.PREVIEW_URL) return;
  const helper = locale("l'helper (devtools:whoami)", whoami().cloudUrl);
  const app = locale("l'app servita (WebSocket di /gabrifila)", await urlDellApp());
  if (helper.origin !== app.origin) {
    throw new Error(`e2e: l'app (${app.host}) e l'helper (${helper.host}) parlano con due deployment diversi: mi fermo`);
  }
  console.log(`e2e: Convex locale ${app.host} (app e helper)`);
}
