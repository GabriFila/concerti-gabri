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
     salvo la chiave di Gemini per la spec @gemini: mai chiavi di produzione.
   - Resta in primo piano finché Playwright non lo ferma; inoltra i segnali.
   ────────────────────────────────────────────────────────────── */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GEMINI, senzaSegreti } from "./child-env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = join(ROOT, ".output/server/index.mjs");
const SOURCES = ["src", "shared", "public", "convex/_generated", "vite.config.ts", "package.json", "pnpm-lock.yaml", "tsconfig.app.json"];

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

const CLEAN_ENV = senzaSegreti(process.env, GEMINI);

// il deployment Convex è inserito nel codice al build (VITE_CONVEX_URL):
// una build fatta per un altro deployment va rifatta (il valore non si stampa)
const STAMP = join(ROOT, ".output/.convex-url");
const convexUrl = process.env.VITE_CONVEX_URL || "";
const stampOk = existsSync(STAMP) && readFileSync(STAMP, "utf8") === convexUrl;

const built = existsSync(ENTRY) ? statSync(ENTRY).mtimeMs : 0;
const sources = Math.max(...SOURCES.map(s => newest(join(ROOT, s))));
if (built < sources || !stampOk) {
  console.error(!built ? "e2e-server: nessuna build, la faccio" : built < sources ? "e2e-server: build più vecchia dei sorgenti, la rifaccio" : "e2e-server: build fatta per un altro deployment Convex, la rifaccio");
  const r = spawnSync("pnpm", ["build:lock"], { cwd: ROOT, env: CLEAN_ENV, stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) {
    console.error("e2e-server: build fallita");
    process.exit(1);
  }
  writeFileSync(STAMP, convexUrl);
}

const child = spawn(process.execPath, [ENTRY], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...CLEAN_ENV, PORT: process.env.PORT || "3100", NODE_ENV: "production" },
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", code => process.exit(code ?? 0));
