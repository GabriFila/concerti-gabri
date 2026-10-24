/* «Annulla» nelle notifiche (annulla.ts): la voce giusta del registro dopo una scrittura della dashboard. */

import { describe, expect, it } from "vitest";
import { voceDaAnnullare, type VoceRegistro } from "./annulla.ts";

const voce = (id: string, x: Partial<VoceRegistro> = {}): VoceRegistro => ({ id, via: "dashboard", tabella: "entries", annullabile: true, annullata: false, ...x });

describe("voceDaAnnullare", () => {
  it("la più vecchia della dashboard tra quelle arrivate dopo la scrittura", () => {
    // dalla più nuova: c e b sono arrivate dopo a
    const voci = [voce("c"), voce("b"), voce("a")];
    expect(voceDaAnnullare(voci, "a")?.id).toBe("b");
    expect(voceDaAnnullare(voci, "b")?.id).toBe("c");
    expect(voceDaAnnullare(voci, "c")).toBeNull();
  });

  it("salta Oracolo, MCP, API key e sistema arrivati nello stesso momento", () => {
    const voci = [
      voce("e", { via: "oracolo" }),
      voce("d"),
      voce("c", { via: "sistema", annullabile: false }),
      voce("b", { via: "mcp" }),
      voce("x", { via: "apikey" }),
      voce("a"),
    ];
    expect(voceDaAnnullare(voci, "a")?.id).toBe("d");
    expect(voceDaAnnullare(voci.filter(v => v.id !== "d"), "a")).toBeNull();
  });

  it("salta le voci non annullabili (le venue del catalogo) e quelle già annullate", () => {
    const voci = [voce("d"), voce("c", { annullata: true }), voce("b", { tabella: "venues", annullabile: false }), voce("a")];
    expect(voceDaAnnullare(voci, "a")?.id).toBe("d");
  });

  it("rispetta le tabelle; un'unione di persone accetta concerti o persone", () => {
    const voci = [voce("d", { tabella: "people" }), voce("c", { tabella: "entries" }), voce("b", { tabella: "profiles" }), voce("a")];
    expect(voceDaAnnullare(voci, "a", ["people"])?.id).toBe("d");
    expect(voceDaAnnullare(voci, "a", ["entries", "people"])?.id).toBe("c");
    expect(voceDaAnnullare(voci, "a", ["wishlist"])).toBeNull();
    expect(voceDaAnnullare(voci, "a")?.id).toBe("b");
  });

  it("registro vuoto prima della scrittura: valgono tutte", () => {
    expect(voceDaAnnullare([voce("b", { via: "oracolo" }), voce("a")], null)?.id).toBe("a");
    expect(voceDaAnnullare([], null)).toBeNull();
  });

  it("la voce di prima è uscita dalla finestra: niente da annullare", () => {
    expect(voceDaAnnullare([voce("c"), voce("b")], "a")).toBeNull();
  });
});
