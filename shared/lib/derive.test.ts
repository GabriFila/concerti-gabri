/* Le regole che sostituiscono le costanti di Gabri (PIANO §1.33): per
   gabrifila danno i valori di sempre ("dal 2022", Milano al 53%, anni
   2017…2027, centro sulle venue); un profilo vuoto, con soli concerti in
   programma o con un anno solo non produce mai NaN. */

import { describe, expect, it } from "vitest";
import type { Entry } from "../model/concert.ts";
import { GABRIFILA_INPUT } from "../seed/gabrifila.ts";
import { buildDataset } from "./dataset.ts";
import { todayKey } from "./dates.ts";
import { anniAsse, annoCorrente, baricentro, cittaPrincipale, primoAnno, serieDa } from "./derive.ts";
import { computeKpis } from "./kpis.ts";
import { computePortrait } from "./portrait.ts";
import { TREND_SPECS, trendFrom } from "./trend.ts";

const NOW = Date.parse("2026-10-21T12:00:00+02:00");
const TODAY = todayKey(NOW);
const ds = buildDataset(GABRIFILA_INPUT);

/** Nessun numero non finito né "NaN" in un valore, ricorsivamente. */
function senzaNaN(x: unknown, dove = "valore"): void {
  if (typeof x === "number") expect(Number.isFinite(x), dove).toBe(true);
  else if (typeof x === "string") expect(x, dove).not.toMatch(/NaN|Infinity|undefined/);
  else if (Array.isArray(x)) x.forEach((v, i) => senzaNaN(v, `${dove}[${i}]`));
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) if (k !== "ev" && k !== "src") senzaNaN(v, `${dove}.${k}`);
}

const concerto = (date: string, extra: Partial<Entry> = {}): Entry =>
  ({ y: +date.slice(-4), date, venue: "Fabrique", city: "Milano", artist: "Prova", with: [], ...extra }) as Entry;

describe("regole per gabrifila: gli stessi valori di prima", () => {
  it("'dal 2022': primo anno dell'ultima serie ininterrotta di anni con concerti visti", () => {
    expect(serieDa(ds.entries, TODAY)).toBe(2022);
    expect(computeKpis(ds.entries, NOW).find(k => k.id === "media")!.hint).toBe("dal 2022 a oggi");
  });

  it("Milano al 53%: la città più frequente", () => {
    expect(cittaPrincipale(ds.entries, TODAY)).toBe("Milano");
    expect(computeKpis(ds.entries, NOW).find(k => k.id === "citta")!.hint).toBe("53% a Milano");
  });

  it("asse degli anni: dal primo anno a max(anno corrente, ultimo anno con dati)", () => {
    expect(primoAnno(ds.entries)).toBe(2017);
    expect(annoCorrente(NOW)).toBe(2026);
    const anni = anniAsse(primoAnno(ds.entries), ds.entries.map(d => d.y), NOW);
    expect(anni[0]).toBe(2017);
    expect(anni[anni.length - 1]).toBe(2027);
    expect(anni).toHaveLength(11);
    // il grafico della spesa parte da "dal 2022"
    expect(anniAsse(2022, [2023], NOW)).toEqual([2022, 2023, 2024, 2025, 2026]);
  });

  it("centro di riserva della mappa: il baricentro delle venue, dentro l'Italia del nord", () => {
    const [lng, lat] = baricentro(ds.venueCoords)!;
    expect(lng).toBeGreaterThan(7);
    expect(lng).toBeLessThan(12);
    expect(lat).toBeGreaterThan(43);
    expect(lat).toBeLessThan(46.5);
    expect(baricentro({ a: [10, 40], b: [12, 44] })).toEqual([11, 42]);
  });

  it("i KPI passati con le regole del profilo coincidono con quelli calcolati dalle righe", () => {
    const daRighe = computeKpis(ds.entries, NOW);
    const dalProfilo = computeKpis(ds.entries, NOW, { since: 2022, homeCity: "Milano", forma: "m" });
    expect(dalProfilo.map(k => [k.value, k.hint, k.lbl])).toEqual(daRighe.map(k => [k.value, k.hint, k.lbl]));
  });

  it("con un filtro la città di riferimento resta quella del profilo", () => {
    const roma = ds.entries.filter(d => d.city !== "Milano");
    const k = computeKpis(roma, NOW, { since: 2022, homeCity: "Milano" }).find(x => x.id === "citta")!;
    expect(k.hint).toBe("0% a Milano");
  });

  it("la serie si spezza a un anno vuoto e ignora gli anni solo in programma", () => {
    const e = [concerto("01/01/2018"), concerto("01/01/2019"), concerto("01/01/2021"), concerto("01/01/2022"), concerto("01/01/2027")];
    expect(serieDa(e, TODAY)).toBe(2021);
  });

  it("la città più frequente: a parità vince l'ordine alfabetico, i concerti in programma non contano", () => {
    const e = [concerto("01/01/2020", { city: "Torino" }), concerto("01/01/2021", { city: "Bologna" }), concerto("01/01/2027", { city: "Torino" })];
    expect(cittaPrincipale(e, TODAY)).toBe("Bologna");
  });
});

describe("stati vuoti senza NaN", () => {
  const casi: [string, Entry[]][] = [
    ["nessun concerto", []],
    ["solo concerti in programma", [concerto("18/11/2026"), concerto("02/03/2027", { cost: 40 })]],
    ["un anno solo", [concerto("10/03/2026", { voto: 4, cost: 30, from: "x", km: 12 }), concerto("10/05/2026", { voto: 5 })]],
  ];

  it.each(casi)("%s: KPI, Ritratto e andamento senza NaN", (_, entries) => {
    const d = buildDataset({ entries });
    const today = TODAY;
    const since = serieDa(entries, today);
    const kpis = computeKpis(entries, NOW, { since, homeCity: cittaPrincipale(entries, today), forma: "n" });
    senzaNaN(kpis.map(k => ({ value: k.value, hint: k.hint, lbl: k.lbl })), "kpi");
    senzaNaN(computePortrait(entries, NOW), "ritratto");
    senzaNaN(anniAsse(primoAnno(entries), entries.map(e => e.y), NOW), "anni");
    senzaNaN([d.costMax, d.kmMax, d.bounds], "dataset");
    for (const s of TREND_SPECS) senzaNaN(s.points(entries, today), s.k);
    expect(trendFrom(since) ?? 0).not.toBeNaN();
  });

  it("nessun concerto: zeri e trattini, nessun anno di partenza né città", () => {
    expect(serieDa([], TODAY)).toBeNull();
    expect(cittaPrincipale([], TODAY)).toBeNull();
    expect(primoAnno([])).toBeNull();
    expect(baricentro({})).toBeNull();
    expect(anniAsse(null, [], NOW)).toEqual([2026]);
    const k = Object.fromEntries(computeKpis([], NOW).map(x => [x.id, x]));
    expect(k.media.value).toBe("0.0");
    expect(k.media.hint).toBeUndefined();
    expect(k.citta.hint).toBeUndefined();
    expect(k.solo.hint).toBe("0% del totale");
  });

  it("un anno solo: la media per anno parte da quell'anno", () => {
    const e = [concerto("10/03/2026"), concerto("10/05/2026")];
    expect(serieDa(e, TODAY)).toBe(2026);
    expect(computeKpis(e, NOW).find(k => k.id === "media")!.hint).toBe("dal 2026 a oggi");
  });
});

describe("km in attesa (PIANO §1.37)", () => {
  it("la KPI somma solo i km calcolati e dice quanti viaggi aspettano", () => {
    const e = [
      concerto("01/02/2026", { from: "casa", km: 10 }),
      concerto("01/03/2026", { from: "casa", kmPending: true }),
      concerto("01/04/2026", { from: "casa", kmPending: true }),
      concerto("01/12/2026", { from: "casa", kmPending: true }), // in programma: fuori dalla KPI
    ];
    const km = computeKpis(e, NOW).find(k => k.id === "km")!;
    expect(km.value).toBe("20");
    expect(km.hint).toBe("andata e ritorno (2 viaggi in attesa)");
    const uno = computeKpis(e.slice(0, 2), NOW).find(k => k.id === "km")!;
    expect(uno.hint).toBe("andata e ritorno (1 viaggio in attesa)");
    expect(computeKpis(e.slice(0, 1), NOW).find(k => k.id === "km")!.hint).toBe("andata e ritorno");
  });
});
