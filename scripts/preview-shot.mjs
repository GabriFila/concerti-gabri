/* ──────────────────────────────────────────────────────────────
   Screenshot a deploy (preview or local) and report what actually
   loaded — mainly whether the map got real Mapbox tiles.

     node scripts/preview-shot.mjs <url> [--out dir] [--viewport 1280x1000]

   On t3node Chromium has direct network access: requests go straight
   out, no proxying through Node's fetch (that was a workaround for the
   TLS-terminating proxy of cloud sandboxes).

   Vercel previews are protected by Vercel Authentication. When
   VERCEL_AUTOMATION_BYPASS_SECRET is in the environment, the bypass is used
   ONLY when the target is this project's own deployment: the origin of
   PREVIEW_URL, concerti-gabri.vercel.app or a
   concerti-gabri-…-gabrifilas-projects.vercel.app host. Never any other
   *.vercel.app, Mapbox, fonts or anything else.
   The secret never travels in a Playwright request (Playwright writes every
   request header into the "Call log" of its errors): one request with
   Node's fetch (redirects not followed) sends it with
   x-vercel-set-bypass-cookie: true, and the returned bypass cookie is added
   to the browser context for that host only. Neither the secret nor the
   cookie value is ever printed. No trace and no video are recorded.

   The map is judged by its tiles: Mapbox restricts the pk. token by URL
   on the vector tiles (/v4/…vector.pbf), not on styles or fonts. Live map
   = canvas.mapboxgl-canvas present, no "Mappa non disponibile", at least
   one tile answered 200 and none 403.
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

const target = new URL(url);
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

const tiles = [];
const failures = [];
const consoleErrors = [];

// SwiftShader keeps WebGL (and so Mapbox) alive headless
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, timezoneId: "Europe/Rome" });

// the bypass goes only to this project's deployments, never to another *.vercel.app
const previewOrigin = process.env.PREVIEW_URL ? new URL(process.env.PREVIEW_URL).origin : "";
const ownHost = h =>
  h === "concerti-gabri.vercel.app" || /^concerti-gabri-[a-z0-9-]+-gabrifilas-projects\.vercel\.app$/.test(h);
const useBypass = !!bypass && target.protocol === "https:" && (target.origin === previewOrigin || ownHost(target.hostname));
const redact = text => (bypass ? String(text).split(bypass).join("***") : String(text));

if (useBypass) {
  // Node's fetch, not Playwright: its errors never carry request headers
  let res;
  try {
    res = await fetch(new URL(target.pathname || "/", target.origin), {
      headers: { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" },
      redirect: "manual", // the secret never rides a redirect
      signal: AbortSignal.timeout(60_000),
    });
    await res.body?.cancel();
  } catch (err) {
    console.error(`bypass request failed: ${redact(`${err?.name}: ${err?.message}${err?.cause ? ` (${err.cause.code ?? ""} ${err.cause.message ?? ""})` : ""}`)}`);
    await browser.close();
    process.exit(1);
  }
  const sameSite = { lax: "Lax", strict: "Strict", none: "None" };
  const cookies = res.headers.getSetCookie().flatMap(h => {
    const [pair, ...attrs] = h.split(";").map(x => x.trim());
    const eq = pair.indexOf("=");
    if (eq <= 0) return [];
    // host only (no leading dot), whatever Domain the header says
    const c = { name: pair.slice(0, eq), value: pair.slice(eq + 1), domain: target.hostname, path: "/", secure: true, httpOnly: false, sameSite: "Lax" };
    for (const a of attrs) {
      const [k, v = ""] = a.split("=");
      const key = k.toLowerCase();
      if (key === "path" && v.startsWith("/")) c.path = v;
      else if (key === "httponly") c.httpOnly = true;
      else if (key === "samesite") c.sameSite = sameSite[v.toLowerCase()] ?? "Lax";
      else if (key === "max-age" && /^-?\d+$/.test(v)) c.expires = Math.floor(Date.now() / 1000) + Number(v);
    }
    return [c];
  });
  if (cookies.length === 0) {
    console.error(`bypass: the deployment answered ${res.status} without a bypass cookie (wrong secret?)`);
    await browser.close();
    process.exit(1);
  }
  try {
    await ctx.addCookies(cookies);
  } catch (err) {
    let msg = redact(err?.message ?? err);
    for (const c of cookies) if (c.value) msg = msg.split(c.value).join("***");
    console.error(`bypass: addCookies failed: ${msg}`);
    await browser.close();
    process.exit(1);
  }
}

const page = await ctx.newPage();
page.on("pageerror", e => consoleErrors.push("pageerror: " + e.message.slice(0, 160)));
page.on("console", m => { if (m.type() === "error") consoleErrors.push("console: " + m.text().slice(0, 160)); });
// on the context: Mapbox fetches its tiles from a web worker
ctx.on("response", r => {
  const u = r.url();
  if (/\.(vector\.)?pbf(\?|$)|\.mvt(\?|$)/.test(u)) tiles.push(r.status());
  if (r.status() >= 400) failures.push(`${r.status()} ${u.split("?")[0].slice(0, 110)}`);
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(3_000);

// sections reveal on scroll — walk the page so the map initialises
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
  return {
    hasCanvas: !!canvas,
    canvasSize: canvas ? `${canvas.width}x${canvas.height}` : null,
    showsFallback: /Mappa non disponibile/i.test(document.body.innerText),
  };
});

await page.screenshot({ path: `${outDir}/full.png`, fullPage: true });
const mapEl = await page.$(".mapboxgl-map");
if (mapEl) {
  await mapEl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2_000);
  await mapEl.screenshot({ path: `${outDir}/map.png` });
}

const tiles200 = tiles.filter(s => s === 200).length;
const tiles403 = tiles.filter(s => s === 403).length;
const mapOk = map.hasCanvas && !map.showsFallback && tiles200 > 0 && tiles403 === 0;
console.log(JSON.stringify({
  url,
  bypass: useBypass ? "cookie set via Node fetch (values never printed)" : bypass ? "none (not this project's deployment)" : "none",
  screenshots: mapEl ? [`${outDir}/full.png`, `${outDir}/map.png`] : [`${outDir}/full.png`],
  map: { ...map, tiles: tiles.length, tiles200, tiles403, verdict: mapOk ? "live Mapbox tiles" : "NO LIVE TILES" },
  failures: failures.slice(0, 15),
  consoleErrors: consoleErrors.slice(0, 10),
}, null, 2));

await browser.close();
process.exit(mapOk ? 0 : 1);
