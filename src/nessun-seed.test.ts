/* Dal traguardo 2 i dati statici (shared/seed/gabrifila.ts, ex src/data.ts)
   sono solo il seed di Convex e la fixture dei test: nessun file del sito
   sotto src/ li importa più (PIANO §1.14). Pagine e Oracolo leggono Convex.
   I test (*.test.ts) possono usarli come confronto. */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));

function sorgenti(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sorgenti(p);
    return /\.(m?[jt]sx?)$/.test(name) && !/\.test\.[jt]sx?$/.test(name) ? [p] : [];
  });
}

const IMPORT = /(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

describe("src/ non importa i dati statici", () => {
  it("src/data.ts non esiste più", () => {
    expect(existsSync(join(SRC, "data.ts"))).toBe(false);
  });

  it("nessun import di shared/seed/ (né di un vecchio data.ts) sotto src/", () => {
    const colpevoli: string[] = [];
    for (const f of sorgenti(SRC)) {
      for (const m of readFileSync(f, "utf8").matchAll(IMPORT)) {
        const spec = m[1] ?? m[2];
        if (/(^|\/)seed\//.test(spec) || /(^|\/)data(\.ts)?$/.test(spec)) colpevoli.push(`${relative(SRC, f)} → ${spec}`);
      }
    }
    expect(colpevoli).toEqual([]);
  });
});
