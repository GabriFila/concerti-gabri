/* ──────────────────────────────────────────────────────────────
   Il controllo fughe (PIANO §8.2) per le spec di T5: cosa si cerca e dove.

   - Aghi: le forme del canarino (helpers/canarino.ts: testo scritto,
     `display_name` dello stub, coordinate a 4, 5 e 7 decimali, anche
     URL-encoded e JSON-escaped) e le coordinate di casa di Gabri, lette al
     momento da `git show <main prima dello switch>:CLAUDE.md` e mai riscritte (se mancano, il
     modulo lancia). Nei messaggi d'errore esce solo l'ETICHETTA dell'ago,
     mai il valore.
   - I `convex logs` del deployment locale, raccolti per tutta la finestra
     del test (`logsConvex()`), sempre attraverso scripts/wt.mjs.
   - Il log del server Start degli e2e (`logServerStart()`): quello che le
     route server (Oracolo, MCP) scrivono con console.*, cioè i log delle
     funzioni Vercel in produzione.
   ────────────────────────────────────────────────────────────── */

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { formeCanarino } from "./canarino.ts";

const ROOT = join(import.meta.dirname, "..", "..");

/** Quante case ha CLAUDE.md (Milano e Genova): con meno punti il controllo sarebbe a vuoto. */
const CASE_ATTESE = 2;

/**
 * Le coordinate di casa dal CLAUDE.md di main PRIMA dello switch (MAIN_PRIMA:
 * quello nuovo non le ha più), a 4, 5 e tutti i decimali, con punto e con
 * virgola. Lancia (senza stampare valori) se il commit non c'è o
 * se la riga non dà entrambe le case: senza questi aghi ogni "niente
 * coordinate di casa" passerebbe senza controllare niente.
 */
const MAIN_PRIMA = "296205df25058e389389cf176adb3aa08f3c9e42";

function coordinateDiCasa(): string[] {
  let md: string;
  try {
    md = execFileSync("git", ["show", `${MAIN_PRIMA}:CLAUDE.md`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw new Error("controllo fughe: `git show <main prima dello switch>:CLAUDE.md` non riesce (manca il commit?): servono le coordinate di casa come aghi");
  }
  const riga = md.split("\n").find(l => /home `\[lng,lat\]`/.test(l)) ?? "";
  const punti = [...riga.matchAll(/`\[(-?\d+\.\d+),\s*(-?\d+\.\d+)\]`/g)];
  if (punti.length < CASE_ATTESE) {
    throw new Error(`controllo fughe: nel CLAUDE.md di main prima dello switch trovo ${punti.length} coordinate di casa su ${CASE_ATTESE} (la riga "home [lng,lat]" è cambiata?)`);
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

/** Il log del server Start degli e2e: lo scrive scripts/e2e-server.mjs. */
export const LOG_START = join(ROOT, ".output/e2e-start.log");

/**
 * Le righe che il server Start scrive da adesso a `ferma()`. Lancia se il
 * log non c'è (server riusato con E2E_REUSE=1, o non lanciato da
 * scripts/e2e-server.mjs): un controllo su un log vuoto passerebbe sempre.
 */
export function logServerStart(): { ferma: () => Promise<string> } {
  if (!existsSync(LOG_START)) throw new Error("controllo fughe: manca il log del server Start (.output/e2e-start.log): il server non è quello di scripts/e2e-server.mjs");
  const da = statSync(LOG_START).size;
  return {
    ferma: async () => {
      // le ultime righe (scritte dopo la risposta) hanno un attimo per arrivare
      await new Promise(r => setTimeout(r, 1000));
      return readFileSync(LOG_START).subarray(da).toString("utf8");
    },
  };
}
