import { describe, expect, it } from "vitest";
import { flatConcerts, type Entry } from "../model/concert.ts";
import { haTour, touriVisti } from "./tour.ts";

const C = (x: Partial<Entry> & { artist: string; date: string }): Entry =>
  ({ y: Number(x.date.slice(-4)), venue: "Alcatraz", city: "Milano", with: [], ...x }) as Entry;

const DATI: Entry[] = [
  C({ artist: "Verdena", date: "18/10/2025", tour: "Volevo magia tour" }),
  C({ artist: "Calcutta", date: "01/02/2024" }),
  C({ artist: "verdena", date: "02/03/2025", tour: "volevo  magia tour", venue: "Fabrique" }),
  C({ artist: "Olly", date: "05/12/2026", tour: "Tour 2026" }),
  {
    y: 2026, date: "30–31/05/2026", venue: "Magnolia", city: "Segrate", name: "MI AMI 2026",
    concerts: [{ artist: "Gazzelle", with: [], tour: "Tour 2026", date: "30/05/2026" }, { artist: "Rares", with: [] }],
  } as Entry,
];

describe("touriVisti", () => {
  it("un tour è artista + nome (maiuscole e spazi a parte); dal più recente, le date dalla più recente", () => {
    const t = touriVisti(flatConcerts(DATI));
    expect(t.map(x => `${x.artist} · ${x.tour}`)).toEqual(["Olly · Tour 2026", "Gazzelle · Tour 2026", "Verdena · Volevo magia tour"]);
    expect(t[2].date.map(d => d.date)).toEqual(["18/10/2025", "02/03/2025"]);
    expect(t[1].date).toEqual([{ date: "30/05/2026", venue: "Magnolia", city: "Segrate", festival: "MI AMI 2026" }]);
  });

  it("senza tour niente elenco; haTour guarda anche i concerti dei festival", () => {
    expect(touriVisti(flatConcerts([DATI[1]]))).toEqual([]);
    expect(DATI.map(haTour)).toEqual([true, false, true, true, true]);
  });
});
