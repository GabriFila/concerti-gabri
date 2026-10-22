/* Il tema del profilo (PIANO traguardo 4): token non validi, contrasto in
   chiaro e in scuro, niente iniezione CSS, enum dei font, preset. */

import { describe, expect, it } from "vitest";
import {
  CONTRASTO_MINIMO, DENSITA, FONT_CSS, FONT_LABELS, FONT_TITOLI, PRESET, PRESET_IDS, RAGGI, SUPERFICI,
  accentoChiaro, contrasto, problemaAccento, problemaStile, risolviTema, themeCss,
} from "./theme.ts";

const minimo = (hex: string, superfici: readonly string[]) => Math.min(...superfici.map(s => contrasto(hex, s)));

describe("preset", () => {
  it("'predefinito' senza token non produce CSS: la pagina resta quella di sempre", () => {
    expect(themeCss({ preset: "predefinito" })).toBe("");
    expect(themeCss(undefined)).toBe("");
    expect(themeCss({ preset: "predefinito", fontTitoli: "fraunces", raggi: "morbidi", densita: "comoda" })).toBe("");
    expect(risolviTema({ preset: "predefinito" })).toEqual({ fontTitoli: "fraunces", raggi: "morbidi", densita: "comoda" });
  });

  it("ci sono il predefinito e almeno altri due preset, ognuno valido", () => {
    expect(PRESET_IDS[0]).toBe("predefinito");
    expect(PRESET_IDS.length).toBeGreaterThanOrEqual(3);
    for (const id of PRESET_IDS) {
      expect(problemaStile({ theme: { preset: id, ...PRESET[id].token } }), id).toBeNull();
      if (id !== "predefinito") expect(themeCss({ preset: id }), id).toMatch(/^:root\{/);
    }
  });

  it("i token del profilo vincono su quelli del preset", () => {
    expect(risolviTema({ preset: "neon", fontTitoli: "inter", raggi: "tondi" })).toMatchObject({ accent: "#ff4fa3", fontTitoli: "inter", raggi: "tondi", densita: "compatta" });
    // un preset sconosciuto (dato vecchio) vale predefinito
    expect(risolviTema({ preset: "boh" })).toEqual(risolviTema({ preset: "predefinito" }));
  });

  it("il CSS di un tema completo: font, raggi, densità e accento in scuro e in chiaro", () => {
    const css = themeCss({ preset: "predefinito", accent: "#E2553F", fontTitoli: "space-grotesk", raggi: "netti", densita: "ariosa" });
    expect(css).toContain(`--font-titoli:${FONT_CSS["space-grotesk"]}`);
    expect(css).toContain("--r-pannello:4px");
    expect(css).toContain("--pad-pannello:");
    expect(css).toContain("--gap-griglia:");
    expect(css).toContain("--lamp:#e2553f");
    expect(css).toContain("--lamp-soft:rgba(226,85,63,0.5)");
    // la regola del chiaro viene dopo :root, così vince su styles.css a parità di specificità
    expect(css.indexOf(":root{")).toBe(0);
    expect(css.indexOf('[data-theme="light"]{')).toBeGreaterThan(0);
  });
});

describe("niente iniezione CSS", () => {
  const cattivi = [
    { preset: "predefinito", accent: "#fff;}body{display:none" },
    { preset: "predefinito", accent: "red" },
    { preset: "predefinito", fontTitoli: "x';}</style><script>alert(1)</script>" },
    { preset: "predefinito", raggi: "4px;background:url(https://x)" },
    { preset: "predefinito", densita: "}</style>" },
    { preset: "</style>" },
  ];

  it.each(cattivi)("token non validi si ignorano: %o", t => {
    const css = themeCss(t as never);
    expect(css).toBe("");
  });

  it("il CSS contiene solo caratteri attesi, mai '<', url( o @import", () => {
    for (const id of PRESET_IDS) {
      for (const font of FONT_TITOLI) {
        const css = themeCss({ preset: id, fontTitoli: font, accent: "#d9a441" });
        expect(css).not.toMatch(/<|url\(|@import|expression|\\/i);
        expect(css).toMatch(/^[\w\s:;{}()\[\]#.,'"=%-]*$/);
      }
    }
  });

  it("il validatore rifiuta i token fuori enum, i preset sconosciuti e gli id di sezione inesistenti", () => {
    expect(problemaStile({ theme: { preset: "boh" } })?.campo).toBe("theme.preset");
    expect(problemaStile({ theme: { preset: "predefinito", raggi: "4px" } })?.campo).toBe("theme.raggi");
    expect(problemaStile({ theme: { preset: "predefinito", densita: "fitta" } })?.campo).toBe("theme.densita");
    expect(problemaStile({ theme: { preset: "predefinito", fontTitoli: "comic-sans" } })?.campo).toBe("theme.fontTitoli");
    expect(problemaStile({ theme: { preset: "predefinito", accent: "rosso" } })?.campo).toBe("theme.accent");
    expect(problemaStile({ layout: { ordine: ["sec-nuova"], nascoste: [], titoli: {} } })?.campo).toBe("layout.ordine");
    expect(problemaStile({ layout: { ordine: [], nascoste: ["sec-x"], titoli: {} } })?.campo).toBe("layout.nascoste");
    expect(problemaStile({ layout: { ordine: [], nascoste: [], titoli: { "sec-y": "Ciao" } } })?.campo).toBe("layout.titoli");
    expect(problemaStile({ layout: { ordine: ["sec-archivio"], nascoste: ["sec-spesa"], titoli: { "sec-mappa": "Viaggi" } } })).toBeNull();
    expect(problemaStile({})).toBeNull();
  });

  it("i messaggi non ripetono i valori ricevuti", () => {
    const canarino = "sec-canarini-7";
    const p = problemaStile({ theme: { preset: "canarini" }, layout: { ordine: [canarino], nascoste: [], titoli: {} } });
    expect(JSON.stringify(p)).not.toContain("canarini");
    const q = problemaStile({ layout: { ordine: [canarino], nascoste: [], titoli: {} } });
    expect(JSON.stringify(q)).not.toContain("canarini");
    expect(JSON.stringify(problemaAccento("#123456"))).not.toContain("123456");
  });
});

describe("contrasto in chiaro e in scuro", () => {
  it("rapporto WCAG", () => {
    expect(contrasto("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrasto("#777777", "#777777")).toBe(1);
    expect(contrasto("#d9a441", "#101013")).toBeGreaterThan(7);
  });

  it("un accento troppo scuro per il tema scuro si rifiuta", () => {
    for (const hex of ["#202020", "#3a0d0d", "#000080"]) expect(problemaAccento(hex)?.campo, hex).toBe("theme.accent");
  });

  it("in chiaro l'accento si scurisce quanto basta per reggere sulla carta", () => {
    for (const hex of ["#ffee00", "#d9a441", "#ff4fa3", "#ffffff"]) {
      const c = accentoChiaro(hex);
      expect(minimo(c, SUPERFICI.chiaro), `${hex} → ${c}`).toBeGreaterThanOrEqual(CONTRASTO_MINIMO);
    }
    // un colore già scuro abbastanza resta com'è
    expect(accentoChiaro("#e2553f")).toBe("#e2553f");
  });

  it("ogni accento accettato regge su tutte le superfici, in scuro e (scurito) in chiaro", () => {
    for (const hex of ["#d9a441", "#ff4fa3", "#e2553f", "#ffee00", "#9b7bff", "#ffffff"]) {
      expect(problemaAccento(hex), hex).toBeNull();
      expect(minimo(hex, SUPERFICI.scuro), hex).toBeGreaterThanOrEqual(CONTRASTO_MINIMO);
      expect(minimo(accentoChiaro(hex), SUPERFICI.chiaro), hex).toBeGreaterThanOrEqual(CONTRASTO_MINIMO);
    }
  });

  it("un accento simile al teal dei concerti in programma si rifiuta (grafici illeggibili)", () => {
    for (const hex of ["#4bb3c4", "#3fc8d8", "#22b5c8"]) expect(problemaAccento(hex)?.messaggio, hex).toMatch(/teal/);
  });
});

describe("enum", () => {
  it("i font dei titoli sono i quattro di §1.40, ognuno con etichetta e pila CSS", () => {
    expect([...FONT_TITOLI]).toEqual(["fraunces", "inter", "space-grotesk", "playfair-display"]);
    for (const f of FONT_TITOLI) {
      expect(FONT_LABELS[f]).toBeTruthy();
      expect(FONT_CSS[f]).toMatch(/^'[A-Za-z ]+',/);
    }
  });

  it("raggi e densità hanno tre valori, il primo è quello di sempre", () => {
    expect(RAGGI[0]).toBe("morbidi");
    expect(DENSITA[0]).toBe("comoda");
    expect(RAGGI).toHaveLength(3);
    expect(DENSITA).toHaveLength(3);
  });
});
