/* ──────────────────────────────────────────────────────────────
   Il controllo fughe (PIANO §8.2) per le spec di T5: cosa si cerca e dove.

   - Aghi: le forme del canarino (helpers/canarino.ts: testo scritto,
     `display_name` dello stub, coordinate a 4, 5 e 7 decimali, anche
     URL-encoded e JSON-escaped) e le coordinate di casa di Gabri, lette al
     momento da `git show main:CLAUDE.md` e mai riscritte (se mancano, il
     modulo lancia). Nei messaggi d'errore esce solo l'ETICHETTA dell'ago,
     mai il valore.
   - I `convex logs` del deployment locale, raccolti per tutta la finestra
     del test (`logsConvex()`), sempre attraverso scripts/wt.mjs.
   ────────────────────────────────────────────────────────────── */

import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";
import { formeCanarino } from "./canarino.ts";

const ROOT = join(import.meta.dirname, "..", "..");

/** Quante case ha CLAUDE.md (Milano e Genova): con meno punti il controllo sarebbe a vuoto. */
const CASE_ATTESE = 2;

/**
 * Le coordinate di casa da main:CLAUDE.md, a 4, 5 e tutti i decimali, con
 * punto e con virgola. Lancia (senza stampare valori) se `main` non c'è o
 * se la riga non dà entrambe le case: senza questi aghi ogni "niente
 * coordinate di casa" passerebbe senza controllare niente.
 */
function coordinateDiCasa(): string[] {
  let md: string;
  try {
    md = execFileSync("git", ["show", "main:CLAUDE.md"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw new Error("controllo fughe: `git show main:CLAUDE.md` non riesce (manca il branch main?): servono le coordinate di casa come aghi");
  }
  const riga = md.split("\n").find(l => /home `\[lng,lat\]`/.test(l)) ?? "";
  const punti = [...riga.matchAll(/`\[(-?\d+\.\d+),\s*(-?\d+\.\d+)\]`/g)];
  if (punti.length < CASE_ATTESE) {
    throw new Error(`controllo fughe: in main:CLAUDE.md trovo ${punti.length} coordinate di casa su ${CASE_ATTESE} (la riga "home [lng,lat]" è cambiata?)`);
  }
  const out = new Set<string>();
  for (const m of punti) {
    for (const v of [m[1], m[2]]) {
      const [int, dec] = v.split(".");
      for (const n of [4, 5, dec.length]) if (dec.length >= n) out.add(`${int}.${dec.slice(0, n)}`).add(`${int},${dec.slice(0, n)}`);
    }
  }
  return [...out];
}

/** [etichetta, valore]: l'etichetta è l'unica cosa che si stampa. */
export const AGHI: [string, string][] = [
  ...formeCanarino().map((f, i) => [`canarino #${i + 1}`, f] as [string, string]),
  ...coordinateDiCasa().map((c, i) => [`coordinata di casa #${i + 1}`, c] as [string, string]),
];

/** Le etichette degli aghi trovati nel testo (vuoto = nessuna fuga). */
export const fughe = (testo: string): string[] => [...new Set(AGHI.filter(([, v]) => testo.includes(v)).map(([e]) => e))];

/**
 * Raccoglie i `convex logs` del deployment locale (anche le esecuzioni
 * riuscite) da adesso a `ferma()`, che restituisce il testo raccolto.
 */
export function logsConvex(): { ferma: () => Promise<string> } {
  const figlio = spawn(
    process.execPath,
    [join(ROOT, "scripts/wt.mjs"), "exec", "--", "pnpm", "exec", "convex", "logs", "--env-file", ".env.worktree", "--history", "1000", "--success", "--jsonl"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: true },
  );
  let testo = "";
  figlio.stdout.on("data", (b: Buffer) => (testo += b.toString("utf8")));
  figlio.stderr.on("data", (b: Buffer) => (testo += b.toString("utf8")));
  return {
    ferma: async () => {
      // qualche secondo perché arrivino le ultime righe, poi giù tutto il gruppo (wt, pnpm, convex)
      await new Promise(r => setTimeout(r, 3000));
      try {
        process.kill(-figlio.pid!, "SIGTERM");
      } catch {
        figlio.kill("SIGTERM");
      }
      return testo;
    },
  };
}
