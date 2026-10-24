import { describe, expect, it } from "vitest";
import { chatToolDefs, chatToolList } from "../../src/chat/tools.ts";
import { proponiConcertoDef } from "../../src/server/oracolo/proposta.ts";
import { queryConcertsDef, reportUnsupportedDef, webSearchDef } from "../../src/server/oracolo/tools.ts";
import { CATALOGO, NOMI_CATALOGO } from "./catalog.ts";

describe("nomi degli strumenti", () => {
  it("unici nel catalogo", () => {
    expect(new Set(NOMI_CATALOGO).size).toBe(NOMI_CATALOGO.length);
    for (const n of NOMI_CATALOGO) expect(n).toMatch(/^[a-z][a-z_]{2,40}$/);
  });

  it("unici tra gli strumenti dell'Oracolo (client e server) e il catalogo", () => {
    const vocab = { cities: ["Milano"], companions: ["Lu"] };
    const oracolo = [
      ...chatToolList(chatToolDefs(vocab)).map(d => d.name),
      queryConcertsDef(vocab).name,
      reportUnsupportedDef.name,
      webSearchDef.name,
      // la scheda dell'Oracolo in scrittura: solo sua, mai nel catalogo (MCP)
      proponiConcertoDef.name,
    ];
    expect(new Set(oracolo).size).toBe(oracolo.length);
    const comuni = oracolo.filter(n => NOMI_CATALOGO.includes(n));
    expect(comuni).toEqual([]);
    // set_theme è del catalogo (stile della pagina), quello del visitatore si chiama set_visitor_theme
    expect(NOMI_CATALOGO).toContain("set_theme");
    expect(oracolo).toContain("set_visitor_theme");
    expect(NOMI_CATALOGO).not.toContain("propose_concert");
  });

  it("ogni operazione indica la sua funzione Convex e il traguardo", () => {
    for (const o of CATALOGO) {
      expect(o.funzione, o.name).toMatch(/^[a-zA-Z]+:[a-zA-Z]+$/);
      expect([2, 5, 7]).toContain(o.traguardo);
    }
  });
});
