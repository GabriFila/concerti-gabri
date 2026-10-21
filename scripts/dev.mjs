#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────
   `pnpm dev`: il server di sviluppo (vite dev, TanStack Start + Nitro).

   - Checkout principale: `vite dev` sulla 3100 (o PORT), collegato al dev
     condiviso: lo usa solo l'orchestratore (PIANO §4.1).
   - Worktree collegato: rifiuta di partire senza WT_ENV=1, cioè fuori da
     `node scripts/wt.mjs exec -- pnpm dev` (scripts/worktree-guard.mjs), e
     con un VITE_CONVEX_URL che non sia 127.0.0.1. Poi parte con portless
     (`https://<worktree>.concerti-gabri.localhost:1355`, l'URL che il
     deployment locale ha in SITE_URL), se c'è; altrimenti `vite dev` liscio.
   Gli argomenti passano a vite.
   ────────────────────────────────────────────────────────────── */

import { spawn, spawnSync } from "node:child_process";
import { isLinkedWorktree, worktreeRefusal } from "./worktree-guard.mjs";

const refusal = worktreeRefusal("dev");
if (refusal) {
  console.error(refusal);
  process.exit(2);
}

const args = process.argv.slice(2);
const viteCmd = ["pnpm", "exec", "vite", "dev", ...args];
const hasPortless = !process.env.PORT && spawnSync("portless", ["--version"], { stdio: "ignore" }).status === 0;
const cmd = isLinkedWorktree() && hasPortless ? ["portless", "concerti-gabri", ...viteCmd] : viteCmd;

const child = spawn(cmd[0], cmd.slice(1), { stdio: "inherit", env: process.env });
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
