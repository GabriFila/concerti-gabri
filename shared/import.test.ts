import { describe, expect, it } from "vitest";
import { analizzaCsv, analizzaImport, analizzaJson, serveConferma, versoCsv } from "./import.ts";
import { COLONNE_CSV } from "./schema/importFormat.ts";
import { entryInput, type EntryInput } from "./schema/entry.ts";

const INTESTAZIONE = COLONNE_CSV.join(",");
const CANARINO = "Via dei Canarini 7, Genova";

/** Una riga CSV dalle colonne indicate (le altre vuote). */
const riga = (c: Partial<Record<(typeof COLONNE_CSV)[number], string>>) =>
  COLONNE_CSV.map(k => {
    const s = c[k] ?? "";
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
const csv = (...righe: string[]) => [INTESTAZIONE, ...righe].join("\n");

const ENTRIES: EntryInput[] = [
  entryInput.parse({
    kind: "concert", date: "2026-07-24", artist: "Caparezza", venue: "Arena del Mare", city: "Genova", with: ["Cami <3", "Lu"],
    voto: 5, vicinanza: 6, canzoniNote: "na", cost: 60.99, from: "Genova", comments: 'Serata "pazzesca", con virgole; e punti e virgola',
  }),
  entryInput.parse({
    kind: "festival", name: "MI AMI 2026", date: "21–24/05/2026", venue: "Idroscalo", city: "Milano", cost: 147.25, gift: true, giftFrom: "Amici",
    concerts: [{ artist: "Rares", date: "22/05/2026", with: [] }, { artist: "Patagarri", with: ["Perla"], voto: 4, vicinanza: 3, canzoniNote: 2 }],
  }),
  entryInput.parse({ kind: "concert", date: "01/01/2027", artist: "Futuro", venue: "Fabrique", city: "Milano", accredito: true }),
];

describe("export reimportato", () => {
  it("CSV: stesso risultato", () => {
    const testo = versoCsv(ENTRIES);
    expect(testo.split("\n")[0]).toBe(INTESTAZIONE);
    const a = analizzaCsv(testo);
    expect(a.errori).toEqual([]);
    expect(a.righe).toBe(4); // il festival è una riga per concerto
    expect(a.voci.map(v => v.entry)).toEqual(ENTRIES);
    expect(a.voci.map(v => v.righe)).toEqual([[2], [3, 4], [5]]);
  });

  it("JSON: stesso risultato", () => {
    const a = analizzaJson(JSON.stringify(ENTRIES));
    expect(a.errori).toEqual([]);
    expect(a.voci.map(v => v.entry)).toEqual(ENTRIES);
  });

  it("CSV con ; come separatore (Excel italiano), colonne in un altro ordine e BOM", () => {
    const testo = "\uFEFFartista;tipo;data;venue;citta;con;costo\nX;concerto;01/02/2026;Fabrique;Milano;\"Lu;Cami\";39,50\n";
    const a = analizzaCsv(testo);
    expect(a.errori).toEqual([]);
    expect(a.voci[0].entry).toMatchObject({ kind: "concert", artist: "X", with: ["Lu", "Cami"], cost: 39.5 });
  });
});

describe("errori per riga", () => {
  it("riga, colonna e regola, mai il valore", () => {
    const a = analizzaCsv(
      csv(
        riga({ tipo: "concerto", data: "01/02/2026", artista: "Ok", venue: "V", citta: "C" }),
        riga({ tipo: "concerto", data: CANARINO, artista: "X", venue: "V", citta: "C" }),
        riga({ tipo: "concerto", data: "01/02/2026", artista: "X", venue: "V", citta: "C", voto: CANARINO, vicinanza: "9", costo: CANARINO }),
        riga({ tipo: CANARINO, data: "01/02/2026", artista: "X", venue: "V", citta: "C" }),
        riga({ tipo: "concerto", data: "01/02/2026", venue: "V", citta: "C" }),
      ),
    );
    expect(a.voci).toHaveLength(1);
    expect(a.errori.map(e => [e.riga, e.campo])).toEqual([
      [3, "data"],
      [4, "voto"],
      [4, "vicinanza"],
      [4, "costo"],
      [5, "tipo"],
      [6, "artista"],
    ]);
    expect(JSON.stringify(a.errori)).not.toContain("Canarini");
  });

  it("intestazione sbagliata o assente", () => {
    expect(analizzaCsv("a,b,c\n1,2,3").errori[0]).toMatchObject({ riga: 1 });
    expect(analizzaCsv("").errori).toHaveLength(1);
    expect(analizzaCsv(`${INTESTAZIONE},${CANARINO}`).errori[0].messaggio).not.toContain("Canarini");
  });

  it("JSON: non leggibile, non un array, elementi sbagliati con il loro indice", () => {
    expect(analizzaJson(`{${CANARINO}`).errori[0]).toMatchObject({ riga: 0 });
    expect(analizzaJson("{}").errori[0]).toMatchObject({ riga: 0 });
    const a = analizzaJson(JSON.stringify([ENTRIES[0], { kind: "concert", date: CANARINO }]));
    expect(a.voci).toHaveLength(1);
    expect(a.errori.every(e => e.riga === 2)).toBe(true);
    expect(JSON.stringify(a.errori)).not.toContain("Canarini");
  });
});

describe("festival raggruppati", () => {
  const f = (c: Partial<Record<(typeof COLONNE_CSV)[number], string>>) =>
    riga({ tipo: "festival", festival: "Rock in Roma", venue: "Ippodromo", citta: "Roma", data: "10–11/07/2026", ...c });

  it("stessi festival, venue e data = un festival, nell'ordine del file", () => {
    const a = analizzaCsv(
      csv(
        f({ artista: "A", data_concerto: "10/07/2026", costo: "80", con: "Lu;Cami <3" }),
        riga({ tipo: "concerto", data: "01/02/2026", artista: "Solo", venue: "V", citta: "C" }),
        f({ artista: "B", data_concerto: "11/07/2026" }),
        f({ artista: "C", festival: "Altro fest" }),
        f({ artista: "D", festival: "Altro fest" }),
      ),
    );
    expect(a.errori).toEqual([]);
    expect(a.voci.map(v => v.righe)).toEqual([[2, 4], [3], [5, 6]]);
    const rock = a.voci[0].entry;
    expect(rock).toMatchObject({ kind: "festival", name: "Rock in Roma", cost: 80, concerts: [{ artist: "A", with: ["Lu", "Cami <3"], date: "10/07/2026" }, { artist: "B" }] });
  });

  it("biglietto diverso nel gruppo, un festival di una riga sola, colonne da festival su un concerto", () => {
    const a = analizzaCsv(
      csv(
        f({ artista: "A", costo: "80" }),
        f({ artista: "B", costo: "90" }),
        f({ artista: "Solo", festival: "Uno solo" }),
        riga({ tipo: "concerto", data: "01/02/2026", artista: "X", venue: "V", citta: "C", festival: "Boh" }),
      ),
    );
    expect(a.voci).toEqual([]);
    expect(a.errori.map(e => [e.riga, e.campo])).toEqual([
      [2, "costo"],
      [4, "festival"],
      [5, "festival"],
    ]);
  });
});

describe("conferma sopra le 10 righe", () => {
  it("10 righe no, 11 sì (righe del file, non voci)", () => {
    expect(serveConferma(10)).toBe(false);
    expect(serveConferma(11)).toBe(true);
    const undici = csv(...Array.from({ length: 11 }, (_, i) => riga({ tipo: "concerto", data: `0${(i % 9) + 1}/03/2026`, artista: `A${i}`, venue: "V", citta: "C" })));
    const a = analizzaImport("csv", undici);
    expect(a.righe).toBe(11);
    expect(serveConferma(a.righe)).toBe(true);
  });
});
