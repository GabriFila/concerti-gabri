/* Le etichette nelle tre forme (PIANO traguardo 4, §8.1): `m` coincide con i
   testi di sempre, `f` e `n` non hanno participi né aggettivi al maschile. */

import { describe, expect, it } from "vitest";
import { ETICHETTE, FORME, etichetta, formaDi, type EtichettaId } from "./labels.ts";
import { buildDataset } from "./lib/dataset.ts";
import { describeFilters } from "./lib/filters.ts";
import { computeKpis } from "./lib/kpis.ts";
import { SECTIONS, sectionLabel, sectionLabelFor, sezioniDelProfilo } from "./sections.ts";
import { GABRIFILA_INPUT } from "./seed/gabrifila.ts";

const ids = Object.keys(ETICHETTE) as EtichettaId[];
const parole = (s: string): string[] => s.toLowerCase().match(/[a-zàèéìòù']+/g) ?? [];

/** Le parole marcate per genere: quelle che cambiano tra `m` e `f`. */
const maschili = new Set(ids.flatMap(id => parole(ETICHETTE[id].m).filter(w => !parole(ETICHETTE[id].f).includes(w))));
const femminili = new Set(ids.flatMap(id => parole(ETICHETTE[id].f).filter(w => !parole(ETICHETTE[id].m).includes(w))));

describe("etichette per forma", () => {
  it("ogni etichetta ha le tre forme, non vuote", () => {
    for (const id of ids) for (const f of FORME) expect(ETICHETTE[id][f].trim().length, `${id}.${f}`).toBeGreaterThan(0);
  });

  it("m sono i testi di sempre (quelli della pagina di Gabri)", () => {
    expect(Object.fromEntries(ids.map(id => [id, etichetta(id, "m")]))).toEqual({
      secMappa: "Dove sono andato",
      secVicinanza: "Quanto sono vicino",
      kpiSolo: "Concerti da solo",
      filtroSolo: "Da solo",
      riassuntoSolo: "da solo",
      ritrattoSolo: "concerti vissuti da solo",
      voto5: "se non ci fossi stato mi sarei buttato",
      commentiDesc: "Quello che mi sono segnato dopo la serata.",
    });
  });

  it("ogni etichetta cambia davvero tra m e f (altrimenti non starebbe qui)", () => {
    for (const id of ids) expect(ETICHETTE[id].f, id).not.toBe(ETICHETTE[id].m);
    expect([...maschili].sort()).toEqual(["andato", "buttato", "segnato", "solo", "stato", "vicino"]);
  });

  it("nessun participio o aggettivo maschile in f e n", () => {
    for (const id of ids) {
      for (const f of ["f", "n"] as const) {
        const trovate = parole(ETICHETTE[id][f]).filter(w => maschili.has(w));
        expect(trovate, `${id}.${f}: "${ETICHETTE[id][f]}"`).toEqual([]);
      }
    }
  });

  it("il neutro riformula: niente desinenze femminili né maschili", () => {
    for (const id of ids) {
      const trovate = parole(ETICHETTE[id].n).filter(w => femminili.has(w) || maschili.has(w));
      expect(trovate, `${id}.n: "${ETICHETTE[id].n}"`).toEqual([]);
      expect(ETICHETTE[id].n).not.toBe(ETICHETTE[id].m);
    }
    expect(etichetta("secMappa", "n")).toBe("Dove ho visto concerti");
  });

  it("una forma mancante o sconosciuta vale neutra", () => {
    expect(formaDi(undefined)).toBe("n");
    expect(formaDi("x")).toBe("n");
    expect(formaDi("f")).toBe("f");
    expect(etichetta("filtroSolo", "zz" as never)).toBe("Senza compagnia");
  });
});

describe("le etichette per forma nei pezzi della pagina", () => {
  const ds = buildDataset(GABRIFILA_INPUT);
  const NOW = Date.parse("2026-10-21T12:00:00+02:00");

  it("SECTIONS ha le etichette della forma m; sectionLabelFor le cambia per f e n", () => {
    expect(sectionLabel("sec-mappa")).toBe(ETICHETTE.secMappa.m);
    expect(sectionLabel("sec-vicinanza")).toBe(ETICHETTE.secVicinanza.m);
    for (const s of SECTIONS) expect(sectionLabelFor(s.id, "m")).toBe(s.label);
    expect(sectionLabelFor("sec-mappa", "f")).toBe("Dove sono andata");
    expect(sectionLabelFor("sec-vicinanza", "n")).toBe("Quanto mi avvicino al palco");
    // le altre sezioni sono già neutre
    expect(sectionLabelFor("sec-artisti", "f")).toBe("Chi ho visto di più");
    expect(sezioniDelProfilo("f").map(s => s.label)).toContain("Quanto sono vicina");
  });

  it("describeFilters: 'da solo' segue la forma (default m)", () => {
    const f = { ...ds.emptyFilters, solo: true };
    expect(describeFilters(f, ds.bounds)).toBe("da solo");
    expect(describeFilters(f, ds.bounds, "f")).toBe("da sola");
    expect(describeFilters(f, ds.bounds, "n")).toBe("senza compagnia");
  });

  it("la KPI dei concerti senza compagni segue la forma", () => {
    const lbl = (forma?: "f" | "m" | "n") => computeKpis(ds.entries, NOW, forma ? { forma } : {}).find(k => k.id === "solo")!.lbl;
    expect(lbl()).toBe("Concerti da solo");
    expect(lbl("m")).toBe("Concerti da solo");
    expect(lbl("f")).toBe("Concerti da sola");
    expect(lbl("n")).toBe("Concerti senza compagnia");
  });
});
