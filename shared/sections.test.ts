/* Il layout del profilo sulle sezioni de "I dati" (PIANO §1.35): ordine,
   sezioni nascoste (spariscono dal TOC e go_to_section dà ok:false) e titoli
   personalizzati. Il TOC e go_to_section dello Shell leggono sezioniDelProfilo
   e titoloSezione. */

import { describe, expect, it } from "vitest";
import { SECTION_IDS, SECTIONS, bersaglioSezione, isSectionId, sezioniDelProfilo, titoloSezione } from "./sections.ts";

const ids = (xs: { id: string }[]) => xs.map(x => x.id);

describe("sezioni del profilo", () => {
  it("layout vuoto: tutte le sezioni, nell'ordine e coi titoli di sempre (forma m)", () => {
    expect(sezioniDelProfilo("m")).toEqual(SECTIONS.map(s => ({ id: s.id, label: s.label, proprio: false })));
    expect(sezioniDelProfilo("m", { ordine: [], nascoste: [], titoli: {} })).toEqual(sezioniDelProfilo("m"));
  });

  it("una sezione nascosta sparisce dall'elenco (e quindi dal TOC)", () => {
    const s = sezioniDelProfilo("m", { ordine: [], nascoste: ["sec-spesa", "sec-mappa"], titoli: {} });
    expect(ids(s)).not.toContain("sec-spesa");
    expect(ids(s)).not.toContain("sec-mappa");
    expect(s).toHaveLength(SECTIONS.length - 2);
  });

  it("go_to_section: una sezione nascosta non è un bersaglio (lo Shell risponde ok:false)", () => {
    const layout = { ordine: [], nascoste: ["sec-voti"], titoli: { "sec-voti": "Le mie stelle" } };
    // l'etichetta resta quella del profilo, anche per la sezione nascosta
    expect(bersaglioSezione("sec-voti", "f", layout)).toEqual({ visibile: false, label: "Le mie stelle" });
    expect(bersaglioSezione("sec-archivio", "f", layout)).toEqual({ visibile: true, label: "Archivio" });
    expect(bersaglioSezione("sec-mappa", "f", layout)).toEqual({ visibile: true, label: "Dove sono andata" });
    expect(bersaglioSezione("sec-boh", "f", layout)).toEqual({ visibile: false, label: "sec-boh" });
    expect(titoloSezione("sec-voti", "f", layout)).toBe("Le mie stelle");
  });

  it("i titoli personalizzati vincono sulle etichette della forma; quelli vuoti no", () => {
    const s = sezioniDelProfilo("f", { ordine: [], nascoste: [], titoli: { "sec-mappa": "I miei viaggi", "sec-archivio": "   " } });
    expect(s.find(x => x.id === "sec-mappa")).toEqual({ id: "sec-mappa", label: "I miei viaggi", proprio: true });
    expect(s.find(x => x.id === "sec-archivio")).toEqual({ id: "sec-archivio", label: "Archivio", proprio: false });
    expect(s.find(x => x.id === "sec-vicinanza")!.label).toBe("Quanto sono vicina");
  });

  it("ordine: prima le scelte, poi il resto nell'ordine di sempre; Riepilogo resta in testa; id sconosciuti e doppioni ignorati", () => {
    const s = sezioniDelProfilo("n", { ordine: ["sec-archivio", "sec-kpis", "sec-boh", "sec-mappa", "sec-archivio"], nascoste: [], titoli: {} });
    expect(ids(s).slice(0, 4)).toEqual(["sec-kpis", "sec-archivio", "sec-mappa", "sec-andamento"]);
    expect(new Set(ids(s)).size).toBe(SECTION_IDS.length);
    expect(s).toHaveLength(SECTION_IDS.length);
  });

  it("Riepilogo si può nascondere", () => {
    expect(ids(sezioniDelProfilo("m", { ordine: [], nascoste: ["sec-kpis"], titoli: {} }))[0]).toBe("sec-andamento");
  });

  it("isSectionId riconosce solo gli id fissi", () => {
    expect(isSectionId("sec-mappa")).toBe(true);
    expect(isSectionId("sec-nuova")).toBe(false);
  });
});
