import { describe, expect, it } from "vitest";
import { z } from "zod";
import { descrizioneTemaInput, eliminaAccountInput, extraProfiloInput, logoCaricatoInput, urlCaricamentoLogoInput } from "./dashboard.ts";

type Js = { description?: string; properties?: Record<string, Js>; anyOf?: Js[]; items?: Js };

/** I campi (anche annidati) senza descrizione, nello schema JSON. */
function senzaDescrizione(s: Js, path: string, out: string[]) {
  for (const [k, p] of Object.entries(s.properties ?? {})) {
    const descritto = !!p.description || (p.anyOf ?? []).some(x => !!x.description);
    if (!descritto) out.push(`${path}${k}`);
    senzaDescrizione(p, `${path}${k}.`, out);
  }
}

describe("input solo-dashboard (T5)", () => {
  const SCHEMI = { urlCaricamentoLogoInput, logoCaricatoInput, extraProfiloInput, eliminaAccountInput, descrizioneTemaInput };
  for (const [nome, schema] of Object.entries(SCHEMI)) {
    it(`${nome}: ogni campo ha una descrizione`, () => {
      const out: string[] = [];
      senzaDescrizione(z.toJSONSchema(schema, { unrepresentable: "any" }) as Js, "", out);
      expect(out).toEqual([]);
    });
  }

  it("link del footer solo https; conferma con un handle valido", () => {
    expect(extraProfiloInput.safeParse({ linkTappi: "http://x.example" }).success).toBe(false);
    expect(extraProfiloInput.safeParse({ linkTappi: null, creditoFooter: null }).success).toBe(true);
    expect(eliminaAccountInput.safeParse({ conferma: "Gabri Fila" }).success).toBe(false);
    expect(descrizioneTemaInput.safeParse({ descrizione: "  " }).success).toBe(false);
  });
});
