/* ──────────────────────────────────────────────────────────────
   Guardia dei worktree (PIANO §4.3 punto 4): in un worktree collegato
   (git-dir ≠ git-common-dir) `pnpm dev` e `pnpm e2e` partono solo
   attraverso `node scripts/wt.mjs exec -- …`, che imposta WT_ENV=1 e
   l'ambiente del deployment Convex LOCALE. Senza, Vite e la CLI Convex
   prenderebbero dall'ambiente della sessione il dev condiviso.
   Nel checkout principale non cambia niente.
   ────────────────────────────────────────────────────────────── */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/** true se `cwd` è un worktree collegato (non il checkout principale). */
export function isLinkedWorktree(cwd = process.cwd()) {
  try {
    const out = execFileSync("git", ["rev-parse", "--git-dir", "--git-common-dir"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const [gitDir, common] = out.trim().split("\n").map(p => resolve(cwd, p));
    return !!gitDir && !!common && gitDir !== common;
  } catch {
    return false;
  }
}

/** Il messaggio d'errore se il comando non può partire qui, altrimenti null. */
export function worktreeRefusal(what, { cwd = process.cwd(), env = process.env } = {}) {
  if (!isLinkedWorktree(cwd)) return null;
  if (env.WT_ENV !== "1") {
    return `${what}: questo è un worktree collegato; lancialo con \`node scripts/wt.mjs exec -- pnpm ${what}\` (ambiente ripulito, Convex locale)`;
  }
  // anche con WT_ENV, l'app deve puntare al deployment LOCALE del worktree
  const url = env.VITE_CONVEX_URL || "";
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(u.hostname)) {
      return `${what}: VITE_CONVEX_URL non è il deployment locale (127.0.0.1): mi fermo`;
    }
  } catch {
    return `${what}: VITE_CONVEX_URL manca: prima \`node scripts/convex-locale.mjs init\``;
  }
  return null;
}
