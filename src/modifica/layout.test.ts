/* Le misure di /modifica (layout.ts) alle larghezze tipiche. */

import { describe, expect, it } from "vitest";
import { larghezzaOracolo, modoNav, modoOracolo, modoPannello } from "./layout.ts";

describe("modoNav", () => {
  it("telefono: schede; tablet e portatile: binario; schermo largo: barra", () => {
    expect(modoNav(360, false, false)).toBe("schede");
    expect(modoNav(412, true, true)).toBe("schede");
    expect(modoNav(800, false, false)).toBe("binario");
    expect(modoNav(1024, false, false)).toBe("binario");
    expect(modoNav(1280, false, false)).toBe("barra");
    expect(modoNav(1440, false, false)).toBe("barra");
    expect(modoNav(1920, false, false)).toBe("barra");
  });

  it("l'Oracolo agganciato riduce la barra a binario sotto i 1440 px", () => {
    expect(modoNav(1280, true, false)).toBe("binario");
    expect(modoNav(1439, true, false)).toBe("binario");
    expect(modoNav(1440, true, false)).toBe("barra");
    expect(modoNav(1920, true, false)).toBe("barra");
  });

  it("con l'Oracolo agganciato e un pannello aperto accanto, binario sotto i 1680 px (l'elenco resta in vista)", () => {
    expect(modoNav(1440, true, false, true)).toBe("binario");
    expect(modoNav(1512, true, false, true)).toBe("binario");
    expect(modoNav(1679, true, false, true)).toBe("binario");
    expect(modoNav(1680, true, false, true)).toBe("barra");
    // senza l'Oracolo il pannello da solo ci sta
    expect(modoNav(1440, false, false, true)).toBe("barra");
    expect(modoNav(1512, true, false, false)).toBe("barra");
  });

  it("la scelta del binario vale da 1280 px in su", () => {
    expect(modoNav(1280, false, true)).toBe("binario");
    expect(modoNav(1920, false, true)).toBe("binario");
    expect(modoNav(1920, true, true)).toBe("binario");
    expect(modoNav(800, false, true)).toBe("binario");
  });
});

describe("modoPannello e modoOracolo", () => {
  it.each([
    [360, "foglio", "foglio"],
    [412, "foglio", "foglio"],
    [767, "foglio", "foglio"],
    [800, "laterale-modale", "laterale-modale"],
    [1023, "laterale-modale", "laterale-modale"],
    [1024, "laterale", "ancorato"],
    [1280, "laterale", "ancorato"],
    [1440, "laterale", "ancorato"],
    [1920, "laterale", "ancorato"],
  ] as const)("%i px", (w, pannello, oracolo) => {
    expect(modoPannello(w)).toBe(pannello);
    expect(modoOracolo(w)).toBe(oracolo);
  });

  it("l'Oracolo agganciato: 380 px, 420 px da 1440", () => {
    expect(larghezzaOracolo(1024)).toBe(380);
    expect(larghezzaOracolo(1439)).toBe(380);
    expect(larghezzaOracolo(1440)).toBe(420);
  });
});
