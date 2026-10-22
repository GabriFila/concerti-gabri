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
   - In un worktree collegato parte solo con WT_ENV=1, cioè da
     `node scripts/wt.mjs exec -- pnpm e2e` (scripts/worktree-guard.mjs), e
     con l'app puntata al deployment Convex LOCALE. Se il backend locale è
     spento lo accende (`convex-locale.mjs up`), pubblica, fa `seed:ensure`
     e alla fine lo rispegne; se era già acceso lo lascia com'era.
     globalSetup (e2e/global-setup.ts) controlla poi che app e helper
     parlino con lo stesso 127.0.0.1.
   ────────────────────────────────────────────────────────────── */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { GEMINI, ORACOLO, senzaSegreti } from "./child-env.mjs";
import { isLinkedWorktree, worktreeRefusal } from "./worktree-guard.mjs";

const NEED_KB = 3 * 1024 * 1024;
const args = process.argv.slice(2);

const onPreview = args.includes("--project=preview");
if (onPreview && !process.env.PREVIEW_URL) {
  console.error("e2e: il progetto preview vuole PREVIEW_URL (l'URL del branch su Vercel)");
  process.exit(2);
}
if (!onPreview) {
  const refusal = worktreeRefusal("e2e");
  if (refusal) {
    console.error(refusal);
    process.exit(2);
  }
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

/* Il backend Convex locale del worktree (solo in locale, mai sulla preview). */
const locale = (...a) => spawnSync(process.execPath, ["scripts/convex-locale.mjs", ...a], { stdio: ["ignore", "inherit", "inherit"], env: process.env });
let accesoQui = false;
if (!onPreview && isLinkedWorktree()) {
  const st = spawnSync(process.execPath, ["scripts/convex-locale.mjs", "status"], { encoding: "utf8", env: process.env });
  if (!/acceso/.test(st.stderr ?? "") || /spento/.test(st.stderr ?? "")) {
    if (locale("up").status !== 0) process.exit(4);
    accesoQui = true;
  } else if (locale("push").status !== 0) process.exit(4);
  if (locale("seed").status !== 0) {
    if (accesoQui) locale("down");
    process.exit(4);
  }
}
const spegni = () => { if (accesoQui) { accesoQui = false; locale("down"); } };

// GEMINI per la spec @gemini; CHAT_SERVER_SECRET (quello del Convex locale, da
// .env.worktree) per il server Start dell'Oracolo (T6); il bypass di Vercel
// solo verso la preview
const env = senzaSegreti(process.env, onPreview ? [...GEMINI, "VERCEL_AUTOMATION_BYPASS_SECRET"] : [...GEMINI, ...ORACOLO]);
// E2E_PREVIEW lo decide SOLO questo script: è ciò che spegne i server locali e
// il controllo 127.0.0.1 (playwright.config.ts, e2e/global-setup.ts). Un
// PREVIEW_URL rimasto nell'ambiente non basta, e nelle run locali sparisce.
if (onPreview) env.E2E_PREVIEW = "1";
else {
  delete env.E2E_PREVIEW;
  delete env.PREVIEW_URL;
}
const child = spawn("flock", ["/tmp/concerti-e2e.lock", "pnpm", "exec", "playwright", "test", ...args], { stdio: "inherit", env });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", code => {
  spegni();
  process.exit(code ?? 1);
});
