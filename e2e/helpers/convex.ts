/* ──────────────────────────────────────────────────────────────
   Le chiamate dei test al deployment Convex LOCALE del worktree (PIANO
   §4.3): sempre attraverso `node scripts/convex-locale.mjs run`, che usa
   `--env-file .env.worktree`, l'ambiente ripulito di wt.mjs e il controllo
   che il deployment sia su 127.0.0.1. Mai sul dev condiviso, mai sulla
   preview (lì le chiamate le fa solo l'orchestratore).
   Le funzioni `devtools:*` sono interne: le può chiamare solo la CLI, con la
   chiave admin del deployment locale.
   ────────────────────────────────────────────────────────────── */

import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");

/** `convex run <fn> <args>` sul deployment locale; restituisce il risultato (JSON). */
export function convexRun<T = unknown>(fn: string, args: Record<string, unknown> = {}): T {
  const out = execFileSync(process.execPath, [join(ROOT, "scripts/convex-locale.mjs"), "run", fn, JSON.stringify(args)], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  }).trim();
  if (!out) return undefined as T;
  try {
    return JSON.parse(out) as T;
  } catch {
    // la CLI stampa le stringhe senza virgolette (es. un id)
    return out as T;
  }
}

/** URL del deployment visto dalle funzioni (devtools:whoami). */
export const whoami = () => convexRun<{ cloudUrl: string; siteUrl: string }>("devtools:whoami");
