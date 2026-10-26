/* Il registro di #attivita (registro.ts): pastiglie, filtri e giorni. */

import { describe, expect, it } from "vitest";
import { chiDi, conGiorni, contaPerChi, etichettaGiorno, filtraVoci, FILTRI_VUOTI, type VoceRegistro } from "./registro.ts";

const voce = (x: Partial<VoceRegistro> & { id: string }): VoceRegistro =>
  ({ at: 0, via: "dashboard", autore: "Dashboard", riassunto: "", annullabile: true, annullata: false, ...x });

const VOCI = [
  voce({ id: "1", via: "dashboard", riassunto: "aggiunto: Verdena (25/10/2026)" }),
  voce({ id: "2", via: "oracolo", autore: "Tour manager", riassunto: "persona aggiunta: Lu" }),
  voce({ id: "3", via: "mcp", autore: "Claude", riassunto: "aggiunto: Città di Notte" }),
  voce({ id: "4", via: "apikey", autore: "Script", riassunto: "modificato: Verdena", annullata: true }),
  voce({ id: "5", via: "sistema", autore: "Sistema", riassunto: "km ricalcolati", annullabile: false }),
];

describe("chi ha fatto la modifica", () => {
  it("MCP e API key sono «Agenti»; il resto che non è dashboard o Oracolo è «Sistema»", () => {
    expect(["dashboard", "oracolo", "mcp", "apikey", "sistema", "boh"].map(chiDi)).toEqual(["dashboard", "oracolo", "agenti", "agenti", "sistema", "sistema"]);
  });
  it("filtra per pastiglia, annullabili e testo (senza accenti né maiuscole)", () => {
    const ids = (f: Partial<typeof FILTRI_VUOTI>) => filtraVoci(VOCI, { ...FILTRI_VUOTI, ...f }).map(v => v.id);
    expect(ids({})).toEqual(["1", "2", "3", "4", "5"]);
    expect(ids({ chi: "agenti" })).toEqual(["3", "4"]);
    expect(ids({ chi: "oracolo" })).toEqual(["2"]);
    // annullabili: né quelle già annullate né quelle che non si annullano
    expect(ids({ soloAnnullabili: true })).toEqual(["1", "2", "3"]);
    expect(ids({ testo: "  VERDENA " })).toEqual(["1", "4"]);
    expect(ids({ testo: "citta" })).toEqual(["3"]);
    // anche l'autore
    expect(ids({ testo: "claude" })).toEqual(["3"]);
    expect(ids({ chi: "agenti", soloAnnullabili: true })).toEqual(["3"]);
  });
  it("i conteggi delle pastiglie seguono gli altri filtri", () => {
    expect(contaPerChi(VOCI, { soloAnnullabili: false, testo: "" })).toEqual({ tutte: 5, dashboard: 1, oracolo: 1, agenti: 2, sistema: 1 });
    expect(contaPerChi(VOCI, { soloAnnullabili: true, testo: "" })).toEqual({ tutte: 3, dashboard: 1, oracolo: 1, agenti: 1, sistema: 0 });
  });
});

describe("giorni", () => {
  it("«Oggi», «Ieri» e poi la data per esteso (anche a cavallo di mese e anno)", () => {
    expect(etichettaGiorno(20261024, 20261024)).toBe("Oggi");
    expect(etichettaGiorno(20261023, 20261024)).toBe("Ieri");
    expect(etichettaGiorno(20261022, 20261024)).toBe("22 ottobre 2026");
    expect(etichettaGiorno(20260930, 20261001)).toBe("Ieri");
    expect(etichettaGiorno(20251231, 20260101)).toBe("Ieri");
    expect(etichettaGiorno(20260301, 20260301)).toBe("Oggi");
  });
  it("un separatore a ogni cambio di giorno di Roma, non di UTC", () => {
    const adesso = Date.parse("2026-10-24T10:00:00Z");
    const voci = [
      { id: "a", at: Date.parse("2026-10-24T09:00:00Z") },
      // 00:30 a Roma del 24 (22:30 UTC del 23): ancora oggi
      { id: "b", at: Date.parse("2026-10-23T22:30:00Z") },
      { id: "c", at: Date.parse("2026-10-23T12:00:00Z") },
      { id: "d", at: Date.parse("2026-10-20T12:00:00Z") },
      { id: "e", at: Date.parse("2026-10-20T08:00:00Z") },
    ];
    const righe = conGiorni(voci, adesso).map(r => (r.tipo === "giorno" ? `— ${r.etichetta}` : r.voce.id));
    expect(righe).toEqual(["— Oggi", "a", "b", "— Ieri", "c", "— 20 ottobre 2026", "d", "e"]);
    expect(conGiorni([], adesso)).toEqual([]);
  });
});
