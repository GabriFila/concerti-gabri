/* Il proxy /ingest verso PostHog (vite.config.ts, PIANO §1.13) non inoltra
   mai Cookie e Authorization della nostra origine: dal traguardo 3 il cookie
   di sessione di Better Auth (path "/") viaggerebbe con ogni evento. Controllo
   statico della configurazione; il comportamento sulla preview (proxy nella
   funzione, non rewrite della CDN) lo verifica lo spike del traguardo 8. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(import.meta.dirname, "..", "vite.config.ts"), "utf8");

describe("proxy /ingest", () => {
  it("ogni regola /ingest filtra le credenziali", () => {
    const regole = src.split("\n").filter(l => /^\s*"\/ingest[^"]*":/.test(l));
    expect(regole.length).toBeGreaterThanOrEqual(3);
    for (const r of regole) expect(r, r.trim()).toMatch(/proxy:\s*\{\s*to:\s*"https:\/\/[^"]+",\s*filterHeaders:\s*SENZA_CREDENZIALI\s*\}/);
  });

  it("SENZA_CREDENZIALI contiene cookie e authorization", () => {
    const m = src.match(/const SENZA_CREDENZIALI = (\[[^\]]*\]);/);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1])).toEqual(expect.arrayContaining(["cookie", "authorization"]));
  });
});
