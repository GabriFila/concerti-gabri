/* Il contratto delle 9 sezioni di /modifica (sezioni.ts) e i campi della navigazione. */

import { describe, expect, it } from "vitest";
import { NOMI_ICONE } from "../ui/Icon.tsx";
import { GRUPPI, SEZIONI_MODIFICA } from "./sezioni.ts";
import { VISTE } from "./vista.ts";

describe("SEZIONI_MODIFICA", () => {
  it("id e ordine del contratto, gli stessi delle viste", () => {
    const ids = SEZIONI_MODIFICA.map(s => s.id);
    expect(ids).toEqual(["concerti", "wishlist", "persone", "partenze", "regali", "stile", "agenti", "attivita", "account"]);
    expect(ids).toEqual([...VISTE]);
  });

  it("i titoli non cambiano", () => {
    expect(SEZIONI_MODIFICA.map(s => s.titolo)).toEqual([
      "Concerti", "Wishlist", "Persone", "Partenze", "Regalato da", "Stile", "Agenti", "Attività", "Account",
    ]);
  });

  it("ognuna ha gruppo, icona esistente ed etichetta corta", () => {
    const gruppi = new Set(GRUPPI.map(g => g.id));
    for (const s of SEZIONI_MODIFICA) {
      expect(gruppi.has(s.gruppo), s.id).toBe(true);
      expect(NOMI_ICONE, s.id).toContain(s.icona);
      expect(s.breve.length, s.id).toBeGreaterThan(0);
      expect(s.breve.length, s.id).toBeLessThanOrEqual(9);
    }
  });

  it("le schede del telefono sono Concerti, Wishlist e Attività", () => {
    expect(SEZIONI_MODIFICA.filter(s => s.scheda).map(s => s.id)).toEqual(["concerti", "wishlist", "attivita"]);
  });

  it("i gruppi nell'ordine della barra laterale", () => {
    expect(GRUPPI.map(g => g.id)).toEqual(["archivio", "elenchi", "pagina", "sistema"]);
    // ogni gruppo raccoglie sezioni consecutive: l'ordine dei gruppi segue quello del contratto
    const sequenza = SEZIONI_MODIFICA.map(s => s.gruppo).filter((g, i, a) => i === 0 || a[i - 1] !== g);
    expect(sequenza).toEqual(GRUPPI.map(g => g.id));
  });
});
