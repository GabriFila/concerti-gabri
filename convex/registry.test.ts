/* Il registro (PIANO §4.7.1): scorre gli export di convex/ SENZA un elenco
   centrale. Ogni funzione nasce da un builder che la classifica; ogni
   funzione del proprietario è un'operazione del catalogo, `dashboardOnly`
   oppure `oracoloOnly` (la scheda dell'Oracolo), con motivo; ogni
   operazione del catalogo (del suo traguardo) ha la sua funzione; le query
   pubbliche hanno `returns`. */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOGO, NOMI_CATALOGO, operazione } from "../shared/agent/catalog.ts";
import { ESTENSIONI_CONVEX, FILE_DEL_REGISTRO, registro } from "./test.registry.ts";
import { NOMI_LIMITI } from "./rateLimits.ts";
import { NON_ANCORA_DISPONIBILI, tipoFunzione } from "../src/server/mcp/funzioni.ts";

/** I file che la CLI Convex pubblica come moduli di funzioni (stesse regole di bundler/index.js). */
function pubblicabili(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      const rel = relative(root, p);
      if (statSync(p).isDirectory()) {
        // una cartella con convex.config.ts è un componente (la radice no)
        if (n === "node_modules" || existsSync(join(p, "convex.config.ts"))) continue;
        walk(p);
        continue;
      }
      if (!ESTENSIONI_CONVEX.some(e => n.endsWith(e))) continue;
      if (rel.startsWith(`_generated${sep}`) || rel.startsWith(`_deps${sep}`)) continue;
      if (n.startsWith(".") || n.startsWith("#") || n === "schema.ts" || n === "schema.js") continue;
      if ((n.match(/\./g) ?? []).length > 1 || rel.includes(" ")) continue;
      out.push(rel.split(sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

describe("registro delle funzioni", () => {
  const tutte = registro();

  it("trova le funzioni dei moduli", () => {
    expect(tutte.length).toBeGreaterThan(30);
  });

  it("carica ogni file che la CLI Convex pubblicherebbe (ogni estensione, http.ts e crons.ts compresi)", () => {
    const attesi = pubblicabili(import.meta.dirname);
    expect(attesi).toContain("http.ts");
    expect(attesi).toContain("crons.ts");
    expect(FILE_DEL_REGISTRO).toEqual(attesi);
  });

  it("l'input di ogni operazione del catalogo è lo STESSO schema nel catalogo e nella funzione", () => {
    for (const f of tutte.filter(x => x.meta?.catalogOp)) {
      expect(f.meta!.input, `${f.path}: input diverso da quello del catalogo`).toBe(operazione(f.meta!.catalogOp!)!.input);
    }
  });

  it("ogni funzione nasce da un builder che la classifica", () => {
    expect(tutte.filter(f => !f.meta).map(f => f.path)).toEqual([]);
  });

  it("le funzioni interne sono davvero interne e le altre pubbliche", () => {
    for (const f of tutte) {
      if (f.meta?.kind === "internal") expect(f.fn.isInternal, f.path).toBe(true);
      else expect(f.fn.isPublic, f.path).toBe(true);
    }
  });

  it("ogni funzione del proprietario è un'operazione del catalogo, dashboardOnly o oracoloOnly, con motivo", () => {
    const nomi = new Set(CATALOGO.map(o => o.name));
    for (const f of tutte.filter(x => x.meta?.kind === "owner" || x.meta?.kind === "onboarding")) {
      const m = f.meta!;
      expect([m.catalogOp, m.dashboardOnly, m.oracoloOnly].filter(Boolean), `${f.path}: una sola tra catalogOp, dashboardOnly e oracoloOnly`).toHaveLength(1);
      if (m.catalogOp) {
        expect(nomi.has(m.catalogOp), `${f.path}: ${m.catalogOp} non è nel catalogo`).toBe(true);
        expect(CATALOGO.find(o => o.name === m.catalogOp)!.funzione, f.path).toBe(f.path);
      } else {
        expect((m.dashboardOnly ?? m.oracoloOnly)!.length, `${f.path}: motivo`).toBeGreaterThan(3);
      }
    }
  });

  it("le funzioni oracoloOnly (la scheda dell'Oracolo) non sono mai del catalogo né di MCP", () => {
    const solo = tutte.filter(f => f.meta?.oracoloOnly).map(f => f.path);
    expect(solo).toEqual(["entries:salvaScheda"]);
    expect(CATALOGO.filter(o => solo.includes(o.funzione)).map(o => o.name)).toEqual([]);
    // lo strumento della scheda è solo dell'Oracolo in scrittura
    expect(NOMI_CATALOGO).not.toContain("propose_concert");
  });

  it("ogni operazione del catalogo (fino al traguardo 7) ha la sua funzione", () => {
    const perOp = new Map(tutte.filter(f => f.meta?.catalogOp).map(f => [f.meta!.catalogOp!, f.path]));
    // quelle di un'altra corsia ancora assenti stanno in NON_ANCORA_DISPONIBILI (MCP risponde non_disponibile)
    const mancanti = CATALOGO.filter(o => o.traguardo <= 7 && !NON_ANCORA_DISPONIBILI.has(o.name) && perOp.get(o.name) !== o.funzione).map(o => o.name);
    expect(mancanti).toEqual([]);
    // un'operazione non ha due funzioni
    const ops = tutte.filter(f => f.meta?.catalogOp).map(f => f.meta!.catalogOp!);
    expect(new Set(ops).size).toBe(ops.length);
  });

  it("MCP: NON_ANCORA_DISPONIBILI ha solo operazioni senza funzione (arrivata la funzione, va tolta da lì)", () => {
    const presenti = new Set(tutte.map(f => f.path));
    expect([...NON_ANCORA_DISPONIBILI].filter(n => presenti.has(operazione(n)!.funzione))).toEqual([]);
  });

  it("MCP: il tipo di ogni funzione del catalogo (query, mutation, action) è quello che chiama /mcp", () => {
    for (const o of CATALOGO) {
      const f = tutte.find(x => x.path === o.funzione);
      if (!f) continue;
      const tipo = f.fn.isQuery ? "query" : f.fn.isMutation ? "mutation" : "action";
      expect(tipo, o.funzione).toBe(tipoFunzione(o));
    }
  });

  it("le query pubbliche hanno returns esplicito", () => {
    for (const f of tutte.filter(x => x.meta?.kind === "public")) {
      expect(f.fn.exportReturns(), f.path).not.toBeNull();
    }
  });

  it("nessun profileId negli argomenti delle funzioni pubbliche", () => {
    for (const f of tutte.filter(x => x.fn.isPublic)) {
      expect(f.fn.exportArgs(), f.path).not.toMatch(/profileId/);
    }
  });

  it("le funzioni del proprietario hanno argomenti larghi: solo agentToken, as, input (any)", () => {
    for (const f of tutte.filter(x => x.meta?.kind === "owner" || x.meta?.kind === "onboarding")) {
      const args = JSON.parse(f.fn.exportArgs());
      expect(Object.keys(args.value).sort(), f.path).toEqual(["agentToken", "as", "input"]);
      for (const k of ["agentToken", "as", "input"]) expect(args.value[k].fieldType.type, `${f.path}.${k}`).toBe("any");
    }
  });

  it("tutti i limiti d'uso di §5.8 sono definiti", () => {
    expect([...NOMI_LIMITI].sort()).toEqual([
      "addressCorrection", "agentWrites", "chatGlobalDay", "chatIpDay", "chatIpMinute", "chatOtherPagesDay", "chatPageDay",
      "dcrGlobal", "geocodeActor", "geocodeProfile", "logoUpload", "nominatimGlobal", "otpSendEmail", "otpSendGlobal",
      "themeFromDescription", "themeGlobalDay",
    ]);
  });
});
