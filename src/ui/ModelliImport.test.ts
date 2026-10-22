import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { REGOLA_SOPRANNOMI } from "../../shared/schema/campi.ts";
import { COLONNE_CSV } from "../../shared/schema/importFormat.ts";
import { ModelliImport } from "./ModelliImport.tsx";

const testo = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">");

describe("ModelliImport", () => {
  const html = renderToStaticMarkup(createElement(ModelliImport));

  it("accanto ai modelli c'è la regola dei soprannomi con l'esempio (§1.42)", () => {
    expect(testo(html)).toContain(REGOLA_SOPRANNOMI);
    expect(testo(html)).toContain("'Marco Rossi' → 'Marco R.'");
  });

  it("i due modelli si scaricano e la guida elenca ogni colonna", () => {
    expect(html).toContain('download="concerti-modello.csv"');
    expect(html).toContain('download="concerti-modello.json"');
    for (const c of COLONNE_CSV) expect(html).toContain(`<dt>${c}</dt>`);
  });
});
