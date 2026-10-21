/* Tabelle private (PIANO §1.24, §4.7.3): `departureSecrets`, `geocodeDrafts`
   e `kmPairs` compaiono solo in schema.ts, departures.ts e lib/km.ts; nessuna
   chiamata dello scheduler passa lng, lat o address. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname);
/** I sorgenti di convex/ con ogni estensione che la CLI Convex pubblica (non solo .ts), test esclusi. */
function sorgenti(dir = ROOT): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n !== "_generated" && n !== "node_modules") out.push(...sorgenti(p));
    } else if (/\.(?:[cm]?[jt]sx?)$/.test(n) && !/\.test\.[cm]?[jt]sx?$/.test(n) && !/^test\./.test(n)) out.push(p);
  }
  return out;
}

const AMMESSI = new Set(["schema.ts", "departures.ts", "lib/km.ts"]);

describe("tabelle private", () => {
  it("compaiono solo in schema.ts, departures.ts e lib/km.ts", () => {
    const colpevoli = sorgenti()
      .map(f => relative(ROOT, f))
      .filter(f => !AMMESSI.has(f) && /\b(departureSecrets|geocodeDrafts|kmPairs)\b/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(colpevoli).toEqual([]);
  });

  it("nessuna chiamata dello scheduler passa lng, lat o address", () => {
    const colpevoli: string[] = [];
    for (const f of sorgenti()) {
      const src = readFileSync(f, "utf8");
      const re = /scheduler\.run(?:After|At)\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        // gli argomenti fino alla parentesi che chiude la chiamata
        let depth = 0;
        let i = m.index + m[0].length - 1;
        for (; i < src.length; i++) {
          if (src[i] === "(") depth++;
          else if (src[i] === ")" && --depth === 0) break;
        }
        const args = src.slice(m.index, i + 1);
        if (/\b(lng|lat|address|indirizzo)\b/.test(args)) colpevoli.push(`${relative(ROOT, f)}: ${args.slice(0, 80)}`);
      }
    }
    expect(colpevoli).toEqual([]);
  });

  it("le query pubbliche non toccano le tabelle private (pages.ts)", () => {
    const src = readFileSync(join(ROOT, "pages.ts"), "utf8");
    expect(src).not.toMatch(/departureSecrets|geocodeDrafts|kmPairs|authUserId:/);
  });
});
