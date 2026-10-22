import { describe, expect, it } from "vitest";
import { agentPrompt, FORMA_NEL_PROMPT } from "./agentPrompt.ts";
import { canzoniNoteScale, vicinanzaScale } from "./model/scale.ts";
import { REGOLA_SOPRANNOMI } from "./schema/campi.ts";
import { COLONNE_CSV, importJson, rigaCsv } from "./schema/importFormat.ts";
import { ESEMPIO_JSON, GUIDA_COLONNE, modelloCsv, NOTA_MODELLI, RIGHE_ESEMPIO } from "./modelloImport.ts";

const base = { origin: "https://concerti.example/", handle: "giulia", forma: "f" as const, displayName: "Giulia", partenze: ["Casa Milano", "Ufficio"] };

describe("agentPrompt", () => {
  const p = agentPrompt(base);

  it("porta handle, pagina, MCP e la forma scelta", () => {
    expect(p).toContain("https://concerti.example/giulia");
    expect(p).toContain("https://concerti.example/mcp");
    expect(p).not.toContain("example//");
    expect(p).toContain("Sono Giulia");
    expect(p).toContain(FORMA_NEL_PROMPT.f);
    expect(agentPrompt({ ...base, forma: "n" })).toContain(FORMA_NEL_PROMPT.n);
  });

  it("ha la regola dei soprannomi con l'esempio e le scale", () => {
    expect(p).toContain(REGOLA_SOPRANNOMI);
    expect(p).toContain("Marco Rossi");
    expect(p).toContain(vicinanzaScale());
    expect(p).toContain(canzoniNoteScale());
    expect(p).toMatch(/6 Transenna/);
  });

  it("elenca solo i NOMI delle partenze e rimanda a #partenze", () => {
    expect(p).toContain('"Casa Milano", "Ufficio"');
    expect(p).toContain("/giulia/modifica#partenze");
    expect(agentPrompt({ ...base, partenze: [] })).toMatch(/nessuna per ora/);
  });

  it('chiede "dopo la serata" con da_completare e dà le colonne del CSV', () => {
    expect(p).toContain('list_concerts({"da_completare": true})');
    expect(p).toContain(COLONNE_CSV.join(","));
  });

  it("senza nome visualizzato usa l'handle", () => {
    expect(agentPrompt({ ...base, displayName: null })).toContain("Sono giulia");
  });
});

describe("modello di import", () => {
  it("il CSV ha le colonne di importFormat, in ordine, e righe valide", () => {
    const [testa, ...righe] = modelloCsv().trimEnd().split("\n");
    expect(testa).toBe(COLONNE_CSV.join(","));
    expect(righe).toHaveLength(RIGHE_ESEMPIO.length);
    for (const r of righe) expect(r.split(",").length).toBe(COLONNE_CSV.length);
    for (const r of RIGHE_ESEMPIO) expect(rigaCsv.safeParse(r).success).toBe(true);
  });

  it("le righe di un festival hanno identiche le colonne del biglietto", () => {
    const fest = RIGHE_ESEMPIO.filter(r => r.tipo === "festival");
    expect(fest.length).toBeGreaterThanOrEqual(2);
    for (const c of ["costo", "regalo", "regalato_da", "accredito", "partenza", "commento", "venue", "data", "festival"] as const) {
      expect(new Set(fest.map(r => r[c] ?? ""))).toHaveProperty("size", 1);
    }
  });

  it("la regola dei soprannomi, con l'esempio, accompagna i modelli e le colonne dei nomi", () => {
    expect(NOTA_MODELLI).toContain(REGOLA_SOPRANNOMI);
    expect(NOTA_MODELLI).toContain("Marco Rossi");
    expect(GUIDA_COLONNE.map(g => g.colonna)).toEqual([...COLONNE_CSV]);
    for (const c of ["con", "regalato_da"]) expect(GUIDA_COLONNE.find(g => g.colonna === c)!.descrizione).toContain(REGOLA_SOPRANNOMI);
  });

  it("il JSON è valido per importJson", () => {
    expect(importJson.safeParse(ESEMPIO_JSON).success).toBe(true);
  });

  it("un campo con virgole o virgolette finisce tra virgolette", () => {
    const csv = modelloCsv([{ tipo: "concerto", artista: 'Lui, "il re"' }]);
    expect(csv.split("\n")[1]).toContain('"Lui, ""il re"""');
  });
});
