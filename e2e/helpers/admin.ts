/* La vista admin negli e2e (DECISIONI «Vista admin»): ADMIN_USER_IDS del
   deployment Convex LOCALE, attraverso scripts/convex-locale.mjs (mai il
   dev condiviso né la preview). */

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { convexRun } from "./convex.ts";

const ROOT = join(import.meta.dirname, "..", "..");

/** ADMIN_USER_IDS del deployment locale (`-` la toglie). */
export function impostaAdmin(valore: string) {
  execFileSync(process.execPath, [join(ROOT, "scripts/convex-locale.mjs"), "admin", valore], { cwd: ROOT, stdio: ["ignore", "ignore", "pipe"], timeout: 120_000 });
}

/** Rende admin (l'unico) l'utente di prova con questa email. */
export function rendiAdmin(email: string) {
  const id = convexRun<string | null>("devtools:idUtenteDiProva", { email });
  if (!id) throw new Error("e2e: utente di prova senza id");
  impostaAdmin(id);
}
