#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────
   `pnpm e2e` (PIANO §4.4, §8.3): Playwright sotto lock e con un occhio
   alla memoria, perché su t3node girano al massimo 3 processi pesanti.

     pnpm e2e [argomenti di playwright test]
     PREVIEW_URL=<url del branch> pnpm e2e:preview

   - aspetta che MemAvailable arrivi a 3 GB (controllo ogni 5 s, al massimo
     10 minuti, poi rinuncia);
   - poi `flock /tmp/concerti-e2e.lock playwright test …`: una sola run e2e
     alla volta su tutta la macchina;
   - Playwright (e quindi i suoi webServer) riceve l'ambiente senza segreti
     (scripts/child-env.mjs), salvo la chiave di Gemini e il bypass di
     Vercel per il progetto preview: mai chiavi di produzione.
   ────────────────────────────────────────────────────────────── */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { GEMINI, senzaSegreti } from "./child-env.mjs";

const NEED_KB = 3 * 1024 * 1024;
const args = process.argv.slice(2);

if (args.includes("--project=preview") && !process.env.PREVIEW_URL) {
  console.error("e2e: il progetto preview vuole PREVIEW_URL (l'URL del branch su Vercel)");
  process.exit(2);
}

const memAvailableKb = () => {
  try {
    const m = readFileSync("/proc/meminfo", "utf8").match(/^MemAvailable:\s+(\d+)\s+kB/m);
    return m ? Number(m[1]) : Infinity;
  } catch {
    return Infinity; // niente /proc: non si aspetta
  }
};

const deadline = Date.now() + 10 * 60_000;
let warned = false;
while (memAvailableKb() < NEED_KB) {
  if (Date.now() > deadline) {
    console.error("e2e: dopo 10 minuti la memoria libera è ancora sotto 3 GB, rinuncio");
    process.exit(3);
  }
  if (!warned) {
    console.error(`e2e: memoria libera ${(memAvailableKb() / 1024 / 1024).toFixed(1)} GB, aspetto che arrivi a 3 GB`);
    warned = true;
  }
  await sleep(5_000);
}

const env = senzaSegreti(process.env, [...GEMINI, "VERCEL_AUTOMATION_BYPASS_SECRET"]);
const child = spawn("flock", ["/tmp/concerti-e2e.lock", "pnpm", "exec", "playwright", "test", ...args], { stdio: "inherit", env });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", code => process.exit(code ?? 1));
