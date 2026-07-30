/* ──────────────────────────────────────────────────────────────
   Screenshot a deploy preview (or any deploy) and report what
   actually loaded — mainly whether the map got real Mapbox tiles
   or fell back to "Mappa non disponibile".

     node scripts/preview-shot.mjs <url> [--out dir] [--viewport 1280x1000]

   Why the request routing: in a sandboxed session all egress goes
   through a TLS-terminating proxy. Chromium verifies the proxy's
   CA against its own NSS store, which in those containers is
   empty, so every navigation dies with ERR_CERT_AUTHORITY_INVALID
   (surfacing as ERR_CONNECTION_RESET). Rather than weaken the
   browser's verification, every request is fulfilled through
   Node's fetch, which verifies normally against the CA bundle in
   NODE_EXTRA_CA_CERTS and honours HTTPS_PROXY. Outside a sandbox
   this is just a slower passthrough, so the script works either
   way — delete it if Chromium ever trusts the proxy CA directly.

   The 503 retry is not optional: the egress proxy throttles
   bursts, and a throttled mapbox-gl.js renders the no-token
   fallback, which is indistinguishable from a genuinely broken
   map unless you retry.
   ────────────────────────────────────────────────────────────── */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith("--"));
if (!url) {
  console.error("usage: node scripts/preview-shot.mjs <url> [--out dir] [--viewport WxH]");
  process.exit(1);
}
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const outDir = resolve(flag("out", "preview-shots"));
const [vw, vh] = flag("viewport", "1280x1000").split("x").map(Number);
mkdirSync(outDir, { recursive: true });

// Playwright's bundled Chromium; PLAYWRIGHT_BROWSERS_PATH is preset in
// sandboxed sessions, where "playwright install" must not be run.
const executablePath = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`
  : undefined;

const mapbox = [];
const failures = [];
const consoleErrors = [];

const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });

// headers node re-computes itself; forwarding them corrupts the response
const HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "content-encoding", "content-length"]);

await ctx.route("**/*", async route => {
  const req = route.request();
  const target = req.url();
  try {
    let res;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(target, {
        method: req.method(),
        headers: req.headers(),
        body: ["GET", "HEAD"].includes(req.method()) ? undefined : req.postDataBuffer(),
        redirect: "follow",
      });
      if (res.status !== 503) break;
      await new Promise(r => setTimeout(r, 400 * 2 ** attempt));
    }
    const body = Buffer.from(await res.arrayBuffer());
    const headers = {};
    res.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase())) headers[k] = v; });
    if (/mapbox/i.test(target)) mapbox.push({ url: target.slice(0, 110), status: res.status, bytes: body.length });
    if (res.status >= 400) failures.push(`${res.status} ${target.slice(0, 110)}`);
    await route.fulfill({ status: res.status, headers, body });
  } catch (e) {
    failures.push(`ERR ${target.slice(0, 110)} :: ${e.message}`);
    await route.abort();
  }
});

const page = await ctx.newPage();
page.on("pageerror", e => consoleErrors.push("pageerror: " + e.message.slice(0, 160)));
page.on("console", m => { if (m.type() === "error") consoleErrors.push("console: " + m.text().slice(0, 160)); });

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(3_000);

// sections mount lazily on scroll — walk the page so the map initialises
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 500) {
    window.scrollTo(0, y);
    await new Promise(r => setTimeout(r, 150));
  }
});
await page.waitForTimeout(8_000);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1_500);

const map = await page.evaluate(() => {
  const canvas = document.querySelector("canvas.mapboxgl-canvas");
  const fallback = /Mappa non disponibile/i.test(document.body.innerText);
  return {
    hasCanvas: !!canvas,
    canvasSize: canvas ? `${canvas.width}x${canvas.height}` : null,
    hasControls: !!document.querySelector(".mapboxgl-control-container"),
    showsFallback: fallback,
  };
});

await page.screenshot({ path: `${outDir}/full.png`, fullPage: true });
const mapEl = await page.$(".mapboxgl-map");
if (mapEl) {
  await mapEl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2_000);
  await mapEl.screenshot({ path: `${outDir}/map.png` });
}

// live tiles = a canvas present AND no fallback copy on the page
const mapOk = map.hasCanvas && !map.showsFallback;
console.log(JSON.stringify({
  url,
  screenshots: mapEl ? [`${outDir}/full.png`, `${outDir}/map.png`] : [`${outDir}/full.png`],
  map: { ...map, verdict: mapOk ? "live Mapbox tiles" : "NO TILES (fallback or missing canvas)" },
  mapboxRequests: mapbox.length,
  mapboxFailures: mapbox.filter(r => r.status >= 400),
  failures: failures.slice(0, 15),
  consoleErrors: consoleErrors.slice(0, 10),
}, null, 2));

await browser.close();
process.exit(mapOk ? 0 : 1);
