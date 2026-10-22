import { describe, expect, it } from "vitest";
import { MAX_CARATTERI_IMPORT, formatoDi, messaggioRiga, problemaFile, riassuntoAnteprima, riassuntoEsito } from "./file.ts";

describe("file dell'upload", () => {
  it("formato dall'estensione, altrimenti dal contenuto", () => {
    expect(formatoDi("concerti.JSON", "tipo,data")).toBe("json");
    expect(formatoDi("concerti.csv", "[]")).toBe("csv");
    expect(formatoDi("export", "﻿  [{\"kind\":\"concert\"}]")).toBe("json");
    expect(formatoDi("export", "tipo,data,artista")).toBe("csv");
  });

  it("file vuoti o troppo grandi", () => {
    expect(problemaFile(0)).toMatch(/vuoto/);
    expect(problemaFile(3, "  \n")).toMatch(/vuoto/);
    expect(problemaFile(10, "tipo,data")).toBeNull();
    expect(problemaFile(MAX_CARATTERI_IMPORT + 1, "x".repeat(MAX_CARATTERI_IMPORT + 1))).toMatch(/troppo grande/);
  });

  it("riassunti in italiano", () => {
    expect(riassuntoAnteprima({ righe: 12, voci: 11, festival: 1, concerti: 12 })).toBe("12 righe: 10 concerti e 1 festival (12 concerti in tutto)");
    expect(riassuntoAnteprima({ righe: 1, voci: 1, festival: 0, concerti: 1 })).toBe("1 riga: 1 concerto");
    expect(riassuntoEsito({ importate: 12, totale: 12, personeAggiunte: 2 })).toBe("Importate 12 voci, con 2 persone nuove.");
    expect(riassuntoEsito({ importate: 1, totale: 1, regaliAggiunti: 1 })).toBe('Importata 1 voce, con 1 "regalato da" nuovo.');
    expect(riassuntoEsito({ importate: 25, totale: 40 })).toBe("Importate 25 voci su 40.");
  });

  it("errori di riga senza ripetere la colonna", () => {
    expect(messaggioRiga({ campo: "voto", messaggio: "voto: serve un numero da 1 a 5" })).toBe("serve un numero da 1 a 5");
    expect(messaggioRiga({ campo: "data", messaggio: "input non valido — data: formato gg/mm/aaaa" })).toBe("formato gg/mm/aaaa");
    expect(messaggioRiga({ campo: "partenza", messaggio: "partenza sconosciuta: aggiungila in #partenze" })).toBe("partenza sconosciuta: aggiungila in #partenze");
    expect(messaggioRiga({ messaggio: "JSON non leggibile" })).toBe("JSON non leggibile");
  });
});
