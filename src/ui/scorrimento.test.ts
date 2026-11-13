import { describe, expect, it } from "vitest";
import { BORDO_PX, DURATA_MAX_MS, SOGLIA_PX, direzioneScorrimento } from "./scorrimento.ts";

const base = { x0: 200, dx: -120, dy: 10, ms: 250, larghezza: 400 };

describe("direzioneScorrimento", () => {
  it("dito verso sinistra: la sezione dopo; verso destra: quella prima", () => {
    expect(direzioneScorrimento(base)).toBe("successivo");
    expect(direzioneScorrimento({ ...base, dx: 120 })).toBe("precedente");
  });

  it("troppo corto: niente", () => {
    expect(direzioneScorrimento({ ...base, dx: -(SOGLIA_PX - 1) })).toBeNull();
  });

  it("troppo verticale (si scorre la pagina): niente", () => {
    expect(direzioneScorrimento({ ...base, dx: -120, dy: 70 })).toBeNull();
  });

  it("troppo lento: niente", () => {
    expect(direzioneScorrimento({ ...base, ms: DURATA_MAX_MS + 1 })).toBeNull();
  });

  it("dal bordo dello schermo resta il gesto «indietro» del sistema", () => {
    expect(direzioneScorrimento({ ...base, x0: BORDO_PX - 1, dx: 120 })).toBeNull();
    expect(direzioneScorrimento({ ...base, x0: base.larghezza - BORDO_PX + 1 })).toBeNull();
  });
});
