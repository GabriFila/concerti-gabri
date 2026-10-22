/* La testa delle pagine dei profili (src/shell/seo.ts): numeri uguali alle
   card KPI, descrizione senza participi marcati, meta OG/Twitter, canonical,
   manifest e JSON-LD escapato. L'origine canonica per ambiente (PIANO §1.8)
   la calcola il server (root/rootData.ts con server/mcp/origine.ts, testato
   in server/mcp/tools.test.ts): seo.ts la riceve e basta. */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDataset } from "../../shared/lib/dataset.ts";
import { computeKpis } from "../../shared/lib/kpis.ts";
import type { Entry } from "../../shared/model/concert.ts";
import { GABRIFILA_INPUT } from "../../shared/seed/gabrifila.ts";
import { descrizione, riassunto, testaPagina } from "./seo.ts";

const NOW = Date.parse("2026-10-21T12:00:00+02:00");
const { entries } = buildDataset(GABRIFILA_INPUT);

describe("origine", () => {
  it("seo.ts sta nel bundle del browser: niente import da src/server (§3), dove ci sono le origini di sviluppo", () => {
    const testo = readFileSync(new URL("./seo.ts", import.meta.url), "utf8");
    expect(testo).not.toMatch(/from\s*["'][^"']*\/server\//);
  });
});

describe("riassunto e descrizione", () => {
  it("per gabrifila gli stessi numeri delle card KPI", () => {
    expect(riassunto(entries, NOW)).toEqual({ concerti: 80, inProgramma: 11, artisti: 50, citta: 13 });
    // anche a un altro istante: la regola è quella di computeKpis
    for (const t of [NOW, Date.parse("2024-06-01T10:00:00+02:00"), Date.parse("2030-01-01T00:00:00+01:00")]) {
      const k = Object.fromEntries(computeKpis(entries, t).map(x => [x.id, Number(x.value)]));
      expect(riassunto(entries, t)).toEqual({ concerti: k.concerti, inProgramma: k.programma, artisti: k.artisti, citta: k.citta });
    }
    expect(descrizione("Gabri", riassunto(entries, NOW))).toBe("I concerti di Gabri: 80 visti, 11 in programma, 50 artisti diversi, 13 città.");
  });

  it("singolari, zeri e pagina vuota", () => {
    expect(descrizione("Ale", { concerti: 1, inProgramma: 0, artisti: 1, citta: 1 })).toBe("I concerti di Ale: 1 visto, 1 artista, 1 città.");
    expect(descrizione("Ale", { concerti: 0, inProgramma: 2, artisti: 0, citta: 0 })).toBe("I concerti di Ale: 2 in programma.");
    expect(descrizione("Ale", { concerti: 0, inProgramma: 0, artisti: 0, citta: 0 })).toBe("I concerti di Ale: la pagina è ancora vuota.");
    expect(riassunto([], NOW)).toEqual({ concerti: 0, inProgramma: 0, artisti: 0, citta: 0 });
  });
});

describe("testaPagina", () => {
  const testa = testaPagina({ handle: "gabrifila", displayName: "Gabri", percorso: "/gabrifila/dati", entries, now: NOW, origine: "https://concerti.gabrifila.me" });
  const meta = (k: string) => testa.meta.find(m => ("property" in m && m.property === k) || ("name" in m && m.name === k)) as { content: string } | undefined;

  it("titolo, descrizione, Open Graph e Twitter con URL assoluti", () => {
    expect(testa.meta[0]).toEqual({ title: "Gabri ai concerti" });
    expect(meta("description")?.content).toMatch(/^I concerti di Gabri: 80 visti/);
    expect(meta("og:title")?.content).toBe("Gabri ai concerti");
    expect(meta("og:url")?.content).toBe("https://concerti.gabrifila.me/gabrifila/dati");
    expect(meta("og:image")?.content).toBe("https://concerti.gabrifila.me/og/gabrifila");
    expect(meta("og:image:width")?.content).toBe("1200");
    expect(meta("twitter:card")?.content).toBe("summary_large_image");
    expect(meta("twitter:image")?.content).toBe("https://concerti.gabrifila.me/og/gabrifila");
  });

  it("canonical della pagina e manifest del profilo", () => {
    expect(testa.links).toEqual([
      { rel: "canonical", href: "https://concerti.gabrifila.me/gabrifila/dati" },
      { rel: "manifest", href: "/gabrifila/manifest.webmanifest" },
    ]);
  });

  it("JSON-LD: la persona è quella del profilo anche su /dati, e niente < in chiaro", () => {
    const [script] = testa.scripts;
    expect(script.type).toBe("application/ld+json");
    const ld = JSON.parse(script.children);
    expect(ld["@graph"][0].url).toBe("https://concerti.gabrifila.me/gabrifila/dati");
    expect(ld["@graph"][1]["@id"]).toBe("https://concerti.gabrifila.me/gabrifila#persona");

    const artist = "</script><img src=x onerror=alert(1)>";
    const cattivo = { y: 2025, date: "01/02/2025", venue: "V", city: "C", artist, with: [] } as unknown as Entry;
    const t = testaPagina({ handle: "e2e-x", displayName: "X", percorso: "/e2e-x", entries: [cattivo], now: NOW, origine: "https://concerti.gabrifila.me" });
    expect(t.scripts[0].children).not.toContain("<");
    expect(JSON.parse(t.scripts[0].children)["@graph"][2].name).toBe(artist);
  });
});
