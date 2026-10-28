/* I nomi della scheda dell'Oracolo: soprannomi, nomi simili, partenze che
   sembrano indirizzi, e la chiave di confronto, identica a quella del
   server (convex/lib/refs.ts) e della dashboard (forme.ts). */

import { describe, expect, it } from "vitest";
import { chiave } from "../../convex/lib/refs.ts";
import { chiaveNome as chiaveForme } from "../../src/modifica/sezioni/forme.ts";
import { chiaveNome, sembraIndirizzo, sembraIndirizzoCivico, sembraNomeCompleto, simili, soprannomeSuggerito } from "./nomi.ts";

describe("chiaveNome", () => {
  it("minuscole, niente accenti, spazi compressi: la stessa del server e della dashboard", () => {
    expect(chiaveNome("  Élena   B ")).toBe("elena b");
    expect(chiaveNome("NICCOLÒ")).toBe("niccolo");
    for (const s of ["Marco R.", "  Élena   B ", "NICCOLÒ  fabi", "Zoë\tKravitz", "Caffè  Nero", "", "Ünïcödé Ñame"]) {
      expect(chiave(s), s).toBe(chiaveNome(s));
      expect(chiaveForme(s), s).toBe(chiaveNome(s));
    }
  });
});

describe("la regola dei soprannomi", () => {
  it("nome e cognome → soprannome", () => {
    expect(soprannomeSuggerito("Marco Rossi")).toBe("Marco R.");
    expect(soprannomeSuggerito("Anna Maria Bianchi")).toBe("Anna Maria B.");
    expect(soprannomeSuggerito("  Élena   Bàrbieri ")).toBe("Élena B.");
  });

  it("già un soprannome o un nome solo: niente", () => {
    for (const n of ["Marco R.", "Lu", "Gianmarco", "marco rossi", "Marco Ro", "Cami <3", "Mamma"]) {
      expect(soprannomeSuggerito(n), n).toBeNull();
      expect(sembraNomeCompleto(n), n).toBe(false);
    }
    // quattro parole non sono un nome e cognome
    expect(sembraNomeCompleto("Anna Maria Rosa Bianchi")).toBe(false);
  });

  it("falsi positivi voluti: «Gian Marco» sembra nome e cognome (la scheda chiede, «Va bene così»)", () => {
    expect(sembraNomeCompleto("Gian Marco")).toBe(true);
    expect(soprannomeSuggerito("Gian Marco")).toBe("Gian M.");
  });
});

describe("simili", () => {
  const persone = ["Marco R.", "Marco B.", "Lu", "Luca", "Sara", "marcolino"];

  it("i nomi che contengono quello scritto o cominciano con la sua prima parola, mai lui stesso", () => {
    expect(simili("Marco", persone)).toEqual(["Marco R.", "Marco B.", "marcolino"]);
    expect(simili("Marco Rossi", persone)).toEqual(["Marco R.", "Marco B."]);
    // il nome stesso (per chiave) no: resta l'altro Marco
    expect(simili("marco r.", persone)).toEqual(["Marco B."]);
    expect(simili("Lu", persone)).toEqual(["Luca"]);
    expect(simili("", persone)).toEqual([]);
  });

  it("al massimo 5", () => {
    expect(simili("a", ["Anna", "Ada", "Alba", "Asia", "Aria", "Alma", "Ale"])).toHaveLength(5);
  });
});

describe("sembraIndirizzo", () => {
  it("vie, piazze e numeri civici sì", () => {
    for (const n of ["via Roma 3", "Via Roma", "Piazza Duomo", "p.zza Duomo", "Corso Buenos Aires", "Località Pian del Re", "viale Monza", "Roma 3", "12", "Strada 4B"]) {
      expect(sembraIndirizzo(n), n).toBe(true);
    }
  });

  it("i nomi di una partenza no", () => {
    for (const n of ["Casa", "Casa Milano", "Lavoro", "Ufficio", "Casa dei nonni", "Viaggio", "Milano centro", "Vicolino", "Corsica"]) {
      expect(sembraIndirizzo(n), n).toBe(false);
    }
  });
});

describe("sembraIndirizzoCivico (nomi delle venue)", () => {
  it("via o piazza con un numero civico sì, ovunque sia il numero", () => {
    for (const n of ["Via Roma 12", "via dei Canarini 7, Genova", "Piazza Duomo 1", "Corso Buenos Aires 33b", "Viale Monza 140, Milano"]) {
      expect(sembraIndirizzoCivico(n), n).toBe(true);
    }
  });

  it("le venue vere no, anche in piazza o con un numero nel nome", () => {
    for (const n of ["Piazza San Marco", "Piazza Duomo", "Fabrique", "Alcatraz", "Magazzini Generali", "Fabrique 2", "Arena di Verona", "Teatro Verdi (Sestri)", "Via Vai Club"]) {
      expect(sembraIndirizzoCivico(n), n).toBe(false);
    }
  });
});
