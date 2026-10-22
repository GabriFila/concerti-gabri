/* Handle (PIANO traguardo 3, §6 "Segmenti riservati"): regex, riservati e
   i due livelli del route tree. Il route tree è src/routeTree.gen.ts, che
   `vite build` rigenera: ogni rotta nuova finisce qui da sola. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handle as handleZod } from "./schema/campi.ts";
import { HANDLE_RE, HANDLE_RISERVATI, SOTTOPAGINE_HANDLE, messaggioHandle, motivoFormatoHandle, normalizzaHandle } from "./handles.ts";

/** I percorsi completi del route tree (FileRoutesByFullPath). */
function percorsiDelRouteTree(): string[] {
  const src = readFileSync(join(import.meta.dirname, "../src/routeTree.gen.ts"), "utf8");
  const blocco = src.match(/export interface FileRoutesByFullPath \{([\s\S]*?)\n\}/);
  if (!blocco) throw new Error("FileRoutesByFullPath non trovato in routeTree.gen.ts");
  return [...blocco[1].matchAll(/'([^']+)':/g)].map(m => m[1]);
}

describe("formato dell'handle", () => {
  it("accetta minuscole, numeri e trattini interni, da 3 a 30 caratteri", () => {
    for (const ok of ["abc", "gabri-fila", "a1b", "e2e-prova", "x".repeat(30), "0-0"]) expect(HANDLE_RE.test(ok), ok).toBe(true);
  });

  it("rifiuta maiuscole, trattini ai bordi, spazi, punti, troppo corti o lunghi", () => {
    for (const no of ["ab", "Abc", "-abc", "abc-", "a b", "a.b", "a_b", "x".repeat(31), "", "àbc", "@gabri"]) {
      expect(HANDLE_RE.test(no), no).toBe(false);
      expect(motivoFormatoHandle(no), no).toBe("formato non valido");
    }
  });

  it("è la stessa regola dello schema Zod condiviso", () => {
    for (const s of ["abc", "gabri-fila", "-abc", "Abc", "x".repeat(31)]) expect(handleZod.safeParse(s).success, s).toBe(HANDLE_RE.test(s));
  });

  it("normalizza quello che scrive la persona", () => {
    expect(normalizzaHandle("  Gabri-Fila ")).toBe("gabri-fila");
  });
});

describe("handle riservati", () => {
  it("contiene quelli di SPEC e del piano", () => {
    for (const r of [
      "dati", "benvenuto", "privacy", "modifica", "api", "mcp", "ingest", "assets", "og", "login",
      "accedi", "autorizza", "esci", "logout", "well-known", "static", "public", "admin", "account",
      "impostazioni", "robots", "sitemap", "manifest", "www", "app", "aiuto", "gabrifila",
    ]) {
      expect(HANDLE_RISERVATI.has(r), r).toBe(true);
      // "og" è già fuori formato (meno di 3 caratteri): riservato per chiarezza
      expect(motivoFormatoHandle(r), r).toBe(r.length < 3 ? "formato non valido" : "riservato");
    }
  });

  it("gabrifila è riservato: dall'app non lo prende nessuno (il seed sì: convex/auth.test.ts)", () => {
    expect(motivoFormatoHandle("gabrifila")).toBe("riservato");
  });

  it("un handle normale è libero dal formato in giù", () => {
    expect(motivoFormatoHandle("marta")).toBeNull();
  });

  it("ogni motivo ha un messaggio leggibile", () => {
    for (const m of ["formato non valido", "riservato", "già preso", "altro"]) expect(messaggioHandle(m).length).toBeGreaterThan(10);
  });
});

describe("i due livelli del route tree (§6)", () => {
  const percorsi = percorsiDelRouteTree();

  it("legge il route tree", () => {
    expect(percorsi).toContain("/$handle");
    expect(percorsi).toContain("/$handle/dati");
  });

  it("ogni segmento di primo livello è riservato (o non è nemmeno un handle valido)", () => {
    const primi = new Set(percorsi.map(p => p.split("/")[1]).filter(s => s && !s.startsWith("$")));
    expect(primi.size).toBeGreaterThan(0);
    for (const s of primi) expect(motivoFormatoHandle(s), `/${s} è una rotta: va tra i riservati`).not.toBeNull();
  });

  it("sotto $handle esistono solo dati, modifica e manifest.webmanifest", () => {
    const sotto = new Set(
      percorsi
        .filter(p => p.startsWith("/$handle/"))
        .map(p => p.slice("/$handle/".length).split("/")[0])
        .filter(Boolean),
    );
    for (const s of sotto) expect(SOTTOPAGINE_HANDLE as readonly string[], `/$handle/${s}`).toContain(s);
  });
});
