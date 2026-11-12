import { describe, expect, it } from "vitest";
import { SOGLIA_TASTIERA, misuraTastiera } from "./tastiera.ts";

const base = { altezza: 800, vvAltezza: 800, vvAlto: 0, scala: 1, campo: true };

describe("misuraTastiera", () => {
  it("nessuna tastiera: niente variabili", () => {
    expect(misuraTastiera(base)).toBeNull();
  });

  it("la tastiera copre il fondo", () => {
    expect(misuraTastiera({ ...base, vvAltezza: 460 })).toEqual({ tastiera: 340, alto: 0, h: 460 });
  });

  it("iOS sposta il visual viewport in giù: la parte coperta sotto è quel che resta", () => {
    expect(misuraTastiera({ ...base, vvAltezza: 460, vvAlto: 120 })).toEqual({ tastiera: 220, alto: 120, h: 460 });
  });

  it("le barre del browser che entrano ed escono non sono una tastiera", () => {
    expect(misuraTastiera({ ...base, vvAltezza: 800 - SOGLIA_TASTIERA + 1 })).toBeNull();
  });

  it("senza un campo col focus, o con lo zoom, non è la tastiera", () => {
    expect(misuraTastiera({ ...base, vvAltezza: 460, campo: false })).toBeNull();
    expect(misuraTastiera({ ...base, vvAltezza: 400, scala: 2 })).toBeNull();
  });
});
