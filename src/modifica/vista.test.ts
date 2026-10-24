/* L'hash di /modifica (vista.ts): viste, parametri ammessi e ordine canonico. */

import { describe, expect, it } from "vitest";
import { VISTE, leggiHash, scriviHash } from "./vista.ts";

const ID = "k57a9c3vbd2x8m1q0r4t6y8u2w5e7z9n";

describe("leggiHash e scriviHash", () => {
  it("le 9 viste vanno e tornano", () => {
    for (const v of VISTE) {
      expect(scriviHash(v)).toBe(v);
      expect(leggiHash(v)).toEqual({ vista: v, parametri: {} });
      expect(leggiHash(`#${v}`)).toEqual({ vista: v, parametri: {} });
    }
  });

  it("hash vuoto o solo '#': nessuna vista", () => {
    expect(leggiHash("")).toEqual({ vista: null, parametri: {} });
    expect(leggiHash("#")).toEqual({ vista: null, parametri: {} });
  });

  it("una vista che non esiste (anche con le maiuscole) è sconosciuta", () => {
    expect(leggiHash("sec-kpis").vista).toBeNull();
    expect(leggiHash("Concerti").vista).toBeNull();
    expect(leggiHash("boh?apri=" + ID)).toEqual({ vista: null, parametri: {} });
  });

  it("i link che girano già: #account?elimina=1, #partenze, #agenti", () => {
    expect(leggiHash("account?elimina=1")).toEqual({ vista: "account", parametri: { elimina: "1" } });
    expect(leggiHash("partenze").vista).toBe("partenze");
    expect(leggiHash("agenti?parte=import")).toEqual({ vista: "agenti", parametri: { parte: "import" } });
  });

  it("concerti con apri e completa", () => {
    const h = `concerti?apri=${ID}&completa=1`;
    expect(leggiHash(h)).toEqual({ vista: "concerti", parametri: { apri: ID, completa: "1" } });
    expect(scriviHash("concerti", { completa: "1", apri: ID })).toBe(h);
    // completa da solo non vale
    expect(leggiHash("concerti?completa=1").parametri).toEqual({});
  });

  it("chiavi sconosciute o di un'altra vista si scartano", () => {
    expect(leggiHash(`concerti?boh=1&apri=${ID}`).parametri).toEqual({ apri: ID });
    expect(leggiHash(`stile?apri=${ID}`).parametri).toEqual({});
    expect(leggiHash("account?parte=import").parametri).toEqual({});
    expect(scriviHash("wishlist", { apri: ID })).toBe("wishlist");
  });

  it("valori con spazi, accenti, '@', '/' o nomi si scartano", () => {
    for (const v of ["Marco R.", "Marco%20R.", "città", "a@b.it", "via/roma", "Marco", "1 2"]) {
      expect(leggiHash(`concerti?con=${v}`).parametri, v).toEqual({});
      expect(scriviHash("concerti", { con: v }), v).toBe("concerti");
    }
    expect(leggiHash("concerti?nuovo=boh").parametri).toEqual({});
    expect(leggiHash("concerti?filtro=tutti").parametri).toEqual({});
  });

  it("ordine canonico delle chiavi, parametri vuoti omessi", () => {
    expect(scriviHash("concerti", { con: ID, filtro: "passati" })).toBe(`concerti?filtro=passati&con=${ID}`);
    expect(scriviHash("concerti", { nuovo: "festival", apri: "" })).toBe("concerti?nuovo=festival");
    expect(scriviHash("concerti", {})).toBe("concerti");
    expect(leggiHash(`concerti?con=${ID}&filtro=passati`)).toEqual({ vista: "concerti", parametri: { filtro: "passati", con: ID } });
  });

  it("la prima occorrenza di una chiave vince", () => {
    expect(leggiHash("concerti?nuovo=festival&nuovo=concerto").parametri).toEqual({ nuovo: "festival" });
  });
});
