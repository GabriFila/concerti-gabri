#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────
   Il server Start dei test e2e (lo lancia il `webServer` di Playwright):
   la build di produzione (.output) con l'orologio congelato, sulla porta
   PORT (3100: un'origine ammessa dal token Mapbox).

     node scripts/e2e-server.mjs

   - Se .output manca o è più vecchia dei sorgenti, prima rifà la build con
     `pnpm build:lock` (lock di build e tetto di memoria, PIANO §4.4).
   - E2E=1 ed E2E_NOW li passa playwright.config.ts: valgono solo fuori da
     Vercel (src/server/now.ts) e non finiscono mai nel bundle client.
   - Build e server ricevono l'ambiente senza segreti (scripts/child-env.mjs),
     salvo la chiave di Gemini per la spec @gemini e CHAT_SERVER_SECRET del
     Convex locale per l'Oracolo: mai chiavi di produzione.
   - Il server parte con scripts/e2e-ingest.mjs precaricato (traguardo 8):
     il proxy /ingest finisce nello stand-in locale, mai nel PostHog vero.
   - stdout e stderr del server vanno anche in .output/e2e-start.log
     (LOG_START): il controllo fughe dell'Oracolo (e2e/helpers/fughe.ts,
     logServerStart) ci cerca il canarino, come in `convex logs`.
   - Resta in primo piano finché Playwright non lo ferma; inoltra i segnali.
   ────────────────────────────────────────────────────────────── */

import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GEMINI, ORACOLO, senzaSegreti } from "./child-env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = join(ROOT, ".output/server/index.mjs");
const SOURCES = ["src", "shared", "public", "convex/_generated", "vite.config.ts", "instrument.build.ts", "package.json", "pnpm-lock.yaml", "tsconfig.app.json"];

function newest(p) {
  if (!existsSync(p)) return 0;
  const st = statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  let max = 0;
  for (const name of readdirSync(p)) {
    if (name.endsWith(".test.ts")) continue; // i test non cambiano la build
    max = Math.max(max, newest(join(p, name)));
  }
  return max;
}

const CLEAN_ENV = senzaSegreti(process.env, [...GEMINI, ...ORACOLO]);

// il deployment Convex è inserito nel codice al build (VITE_CONVEX_URL):
// una build fatta per un altro deployment va rifatta (il valore non si stampa).
// Lo stesso per il DSN di Sentry e VITE_E2E (traguardo 8): una build senza il
// sink locale manderebbe gli errori dei test al Sentry vero
const STAMP = join(ROOT, ".output/.convex-url");
const firma = [process.env.VITE_CONVEX_URL, process.env.VITE_SENTRY_DSN, process.env.VITE_E2E].map(v => v || "").join("\n");
const stampOk = existsSync(STAMP) && readFileSync(STAMP, "utf8") === firma;

const built = existsSync(ENTRY) ? statSync(ENTRY).mtimeMs : 0;
const sources = Math.max(...SOURCES.map(s => newest(join(ROOT, s))));
if (built < sources || !stampOk) {
  console.error(!built ? "e2e-server: nessuna build, la faccio" : built < sources ? "e2e-server: build più vecchia dei sorgenti, la rifaccio" : "e2e-server: build fatta per un altro deployment Convex o un altro sink, la rifaccio");
  const r = spawnSync("pnpm", ["build:lock"], { cwd: ROOT, env: CLEAN_ENV, stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) {
    console.error("e2e-server: build fallita");
    process.exit(1);
  }
  writeFileSync(STAMP, firma);
}

// PostHog finto dalla prima richiesta (scripts/e2e-ingest.mjs)
const INGEST = pathToFileURL(join(ROOT, "scripts/e2e-ingest.mjs")).href;
// lo stesso percorso di LOG_START in e2e/helpers/fughe.ts
const LOG = createWriteStream(join(ROOT, ".output/e2e-start.log"), { flags: "w", mode: 0o600 });
const child = spawn(process.execPath, ["--import", INGEST, ENTRY], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...CLEAN_ENV, PORT: process.env.PORT || "3100", NODE_ENV: "production" },
});
child.stdout.on("data", b => {
  process.stdout.write(b);
  LOG.write(b);
});
child.stderr.on("data", b => {
  process.stderr.write(b);
  LOG.write(b);
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", code => process.exit(code ?? 0));
