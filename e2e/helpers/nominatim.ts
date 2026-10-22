/* Lo stub di Nominatim per gli e2e (scripts/nominatim-stub.mjs), sulla
   porta che il deployment locale ha in NOMINATIM_URL (NOMINATIM_STUB_PORT
   di .env.worktree, passata da `wt exec`). Se risponde già lo si lascia
   com'è; altrimenti si accende qui e si spegne alla fine. Solo in locale. */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = join(import.meta.dirname, "..", "..");

async function risponde(port: string): Promise<boolean> {
  try {
    return (await fetch(`http://127.0.0.1:${port}/status`, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

/** Accende lo stub se serve; restituisce la funzione che lo spegne. */
export async function stubNominatim(): Promise<() => void> {
  const port = process.env.NOMINATIM_STUB_PORT;
  if (!port) throw new Error("e2e: manca NOMINATIM_STUB_PORT (lancia con `node scripts/wt.mjs exec -- pnpm e2e`)");
  if (await risponde(port)) return () => {};
  const figlio = spawn(process.execPath, [join(ROOT, "scripts/nominatim-stub.mjs"), "--port", port], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50 && !(await risponde(port)); i++) await sleep(100);
  if (!(await risponde(port))) {
    figlio.kill();
    throw new Error("e2e: lo stub di Nominatim non risponde");
  }
  return () => figlio.kill();
}
