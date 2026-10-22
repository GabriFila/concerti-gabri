#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────
   La build di `main` per i test di parità (e2e/parita.spec.ts).

     node scripts/parita-main.mjs            prepara e serve su :4173
     node scripts/parita-main.mjs --build    prepara e basta

   1. Worktree staccato in /tmp/concerti-main (PARITA_MAIN_DIR) sul commit
      di `main`: il branch `main` e il checkout principale non si toccano.
      Se il worktree c'è già e `main` è andato avanti, si sposta (solo se
      pulito).
   2. `pnpm install --frozen-lockfile` e `pnpm build`, solo quando il commit
      cambia. main fissa pnpm 11.12.0, che è rotto: con
      npm_config_manage_package_manager_versions=false si usa il pnpm
      installato invece di scaricare quello. La build passa dal lock di
      build e ha il tetto di memoria (PIANO §4.4).
   3. `vite preview --port 4173 --strictPort` in primo piano (lo ferma
      Playwright; i segnali si inoltrano).

   La build e il server di main non ricevono segreti (l'ambiente passa da
   scripts/child-env.mjs) né il token Mapbox (.env.local sta solo nel
   checkout principale): sulla 4173 la mappa di main mostra il suo
   ripiego, ed è proprio la zona che il confronto maschera (.mapwrap). La
   mappa viva di Start si verifica a parte, in e2e/mappa.spec.ts.
   ────────────────────────────────────────────────────────────── */

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { senzaSegreti } from "./child-env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WT = resolve(process.env.PARITA_MAIN_DIR || "/tmp/concerti-main");
const PORT = process.env.PARITA_MAIN_PORT || "4173";
const BUILD_ONLY = process.argv.includes("--build");
const STAMP = join(WT, "dist", ".parita-commit");

// main non ha bisogno di nessun segreto: né l'install, né la build, né il preview
const CLEAN_ENV = senzaSegreti(process.env);

const git = (args, cwd = ROOT) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const log = msg => console.error("parita-main: " + msg);
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: WT, stdio: ["ignore", "ignore", "inherit"], ...opts });
  if (r.status !== 0) {
    log(`${cmd} ${args.join(" ")} fallito (${r.status})`);
    process.exit(1);
  }
}

// il sito di prima: main all'ultimo commit prima dello switch (dopo, main è il
// sito nuovo e il confronto non avrebbe senso)
const sha = git(["rev-parse", "296205df25058e389389cf176adb3aa08f3c9e42"]);

// 1. worktree
if (!existsSync(WT)) {
  log(`creo il worktree ${WT} su main prima dello switch (${sha.slice(0, 7)})`);
  git(["worktree", "add", "--detach", WT, sha]);
} else {
  const common = realpathSync(resolve(WT, git(["rev-parse", "--git-common-dir"], WT)));
  // la git-common-dir di questa repo: in un worktree collegato (corsie, PIANO
  // §4.3) ROOT/.git è un file, non la cartella condivisa
  const ours = realpathSync(resolve(ROOT, git(["rev-parse", "--git-common-dir"])));
  if (common !== ours) {
    log(`${WT} esiste ma non è un worktree di questa repo: lo lascio stare`);
    process.exit(1);
  }
  if (git(["rev-parse", "HEAD"], WT) !== sha) {
    if (git(["status", "--porcelain"], WT)) {
      log(`${WT} ha modifiche locali: non lo sposto su main`);
      process.exit(1);
    }
    log(`sposto ${WT} su main prima dello switch (${sha.slice(0, 7)})`);
    git(["checkout", "--detach", "--quiet", sha], WT);
  }
}

// 2. install e build, solo se il commit costruito non è questo
const builtFor = existsSync(STAMP) ? readFileSync(STAMP, "utf8").trim() : "";
if (builtFor !== sha || !existsSync(join(WT, "dist", "index.html"))) {
  const env = { ...CLEAN_ENV, npm_config_manage_package_manager_versions: "false" };
  log("pnpm install --frozen-lockfile");
  // CI=1: niente domande interattive se pnpm vuole rifare node_modules
  run("pnpm", ["install", "--frozen-lockfile"], { env: { ...env, CI: "1" } });
  log("pnpm build (sotto /tmp/concerti-build.lock)");
  run("flock", ["/tmp/concerti-build.lock", "pnpm", "build"], {
    env: { ...env, NODE_OPTIONS: "--max-old-space-size=3072" },
  });
  writeFileSync(STAMP, sha + "\n");
} else {
  log(`build di main già pronta (${sha.slice(0, 7)})`);
}
if (BUILD_ONLY) process.exit(0);

// 3. serve: vite direttamente con node (niente pnpm in mezzo, così i segnali arrivano a vite)
const child = spawn(process.execPath, [join(WT, "node_modules/vite/bin/vite.js"), "preview", "--port", PORT, "--strictPort"], {
  cwd: WT,
  stdio: "inherit",
  env: CLEAN_ENV,
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", code => process.exit(code ?? 0));
