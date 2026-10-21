/* Client per richiesta (PIANO §1.7): QueryClient, ConvexQueryClient e
   ConvexHttpClient nascono dentro getRouter(), mai a livello di modulo. Su
   Vercel Fluid le richieste concorrenti condividono l'istanza: un client di
   modulo con setAuth(token) porterebbe i dati di un visitatore nell'HTML di
   un altro.
   - a runtime: due getRouter() danno client tutti diversi;
   - nei sorgenti: nessun `new <client>` fuori da una funzione, in tutto src/. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// il route tree vero importerebbe tutte le pagine (CSS, server function):
// qui serve solo un root con il contesto
vi.mock("./routeTree.gen", async () => {
  const { createRootRouteWithContext } = await import("@tanstack/react-router");
  return { routeTree: createRootRouteWithContext<any>()({}) };
});

const SRC = dirname(fileURLToPath(import.meta.url));
const CLIENTS = /\bnew\s+(QueryClient|ConvexQueryClient|ConvexHttpClient|ConvexReactClient|ConvexClient)\b/g;

beforeAll(() => {
  vi.stubEnv("VITE_CONVEX_URL", "http://127.0.0.1:3210");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("getRouter: client per richiesta", () => {
  it("due richieste, due serie di client distinte", async () => {
    const { getRouter } = await import("./router.tsx");
    const a = getRouter().options.context!;
    const b = getRouter().options.context!;
    expect(a.queryClient).toBeDefined();
    expect(a.queryClient).not.toBe(b.queryClient);
    expect(a.convexQueryClient).not.toBe(b.convexQueryClient);
    expect(a.convexQueryClient.convexClient).not.toBe(b.convexQueryClient.convexClient);
    // sul server (niente window) ogni ConvexQueryClient ha il SUO client HTTP
    expect(a.convexQueryClient.serverHttpClient).toBeDefined();
    expect(a.convexQueryClient.serverHttpClient).not.toBe(b.convexQueryClient.serverHttpClient);
    // e la cache di una richiesta non vede quella dell'altra
    a.queryClient.setQueryData(["prova"], "dati di A");
    expect(b.queryClient.getQueryData(["prova"])).toBeUndefined();
  });

  it("senza VITE_CONVEX_URL si ferma con un messaggio chiaro", async () => {
    vi.stubEnv("VITE_CONVEX_URL", "");
    const { getRouter } = await import("./router.tsx");
    expect(() => getRouter()).toThrow(/VITE_CONVEX_URL/);
    vi.stubEnv("VITE_CONVEX_URL", "http://127.0.0.1:3210");
  });
});

/* ── analisi dei sorgenti ─────────────────────────────────────── */

function sorgenti(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sorgenti(p);
    return /\.(m?[jt]sx?)$/.test(name) && !/\.test\.[jt]sx?$/.test(name) && name !== "routeTree.gen.ts" ? [p] : [];
  });
}

/** Il sorgente senza commenti e stringhe (restano solo codice e parentesi). */
function soloCodice(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:\\])\/\/.*$/gm, (m, p) => p + " ".repeat(m.length - p.length))
    .replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, m => " ".repeat(m.length));
}

/** Profondità delle graffe nel punto `i`: 0 = livello di modulo. */
function profondita(code: string, i: number): number {
  let d = 0;
  for (let k = 0; k < i; k++) {
    if (code[k] === "{") d++;
    else if (code[k] === "}") d--;
  }
  return d;
}

/** Un `new` a livello di modulo può stare solo nel corpo di una funzione freccia senza graffe: si guarda l'istruzione. */
function inFunzioneFreccia(code: string, i: number): boolean {
  const inizio = Math.max(code.lastIndexOf(";", i), code.lastIndexOf("}", i), code.lastIndexOf("\n\n", i));
  return /=>/.test(code.slice(inizio + 1, i));
}

describe("nessun client a livello di modulo in src/", () => {
  it("ogni `new QueryClient/ConvexQueryClient/ConvexHttpClient/ConvexReactClient` sta dentro una funzione", () => {
    const trovati: string[] = [];
    const colpevoli: string[] = [];
    for (const f of sorgenti(SRC)) {
      const code = soloCodice(readFileSync(f, "utf8"));
      for (const m of code.matchAll(CLIENTS)) {
        const where = `${relative(SRC, f)}:${code.slice(0, m.index).split("\n").length} ${m[1]}`;
        trovati.push(where);
        if (profondita(code, m.index!) === 0 && !inFunzioneFreccia(code, m.index!)) colpevoli.push(where);
      }
    }
    expect(colpevoli).toEqual([]);
    // il controllo vede davvero i client del router e dell'Oracolo
    expect(trovati.some(w => w.startsWith("router.tsx") && w.endsWith("QueryClient"))).toBe(true);
    expect(trovati.some(w => w.includes("pagina.ts") && w.endsWith("ConvexHttpClient"))).toBe(true);
  });

  it("il controllo riconosce un client di modulo", () => {
    const code = soloCodice(`import x from "y";\nconst client = new ConvexHttpClient(url);\nexport function f() { return new QueryClient(); }\n`);
    const hits = [...code.matchAll(CLIENTS)].map(m => profondita(code, m.index!) === 0 && !inFunzioneFreccia(code, m.index!));
    expect(hits).toEqual([true, false]);
  });
});
