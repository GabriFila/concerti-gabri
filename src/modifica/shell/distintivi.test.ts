/* I segni sulla navigazione di /modifica (distintivi.ts). */

import { describe, expect, it } from "vitest";
import { todayKey } from "../../../shared/lib/dates.ts";
import { daCompletare, type EventoUi } from "../sezioni/forme.ts";
import { calcolaDistintivi, novitaAgenti, nuoveDagliAgenti, partenzaDaImpostare, quantiDaCompletare } from "./distintivi.ts";

const OGGI = todayKey(Date.parse("2026-10-21T12:00:00Z"));
const concerto = (x: Partial<EventoUi> & { id: string; date: string }): EventoUi =>
  ({ kind: "concert", venue: "Fabrique", city: "Milano", artist: "X", with: [], daCompletare: false, ...x }) as EventoUi;
const festival = (x: Record<string, unknown> & { id: string; date: string }): EventoUi =>
  ({ kind: "festival", venue: "Idroscalo", city: "Milano", name: "MI AMI", concerts: [], daCompletare: false, ...x }) as unknown as EventoUi;

const EVENTI: EventoUi[] = [
  // passato e completo
  concerto({ id: "a", date: "01/10/2026", voto: 5, vicinanza: 6, canzoniNote: 4, from: "Milano" }),
  // passato senza voto
  concerto({ id: "b", date: "02/10/2026", vicinanza: 6, canzoniNote: 4, from: "Milano" }),
  // passato senza partenza
  concerto({ id: "c", date: "03/10/2026", voto: 3, vicinanza: 2, canzoniNote: "na" }),
  // in programma: non conta
  concerto({ id: "d", date: "25/12/2026" }),
  // festival con un set senza voto
  festival({ id: "e", date: "12–13/09/2025", from: "Milano", concerts: [{ artist: "P", with: [], voto: 4, vicinanza: 5, canzoniNote: 3 }, { artist: "S", with: [], vicinanza: 5, canzoniNote: 3 }] }),
];

describe("da completare", () => {
  it("lo stesso conto del riquadro di #concerti", () => {
    expect(quantiDaCompletare(EVENTI, OGGI)).toBe(daCompletare(EVENTI, OGGI).length);
    expect(quantiDaCompletare(EVENTI, OGGI)).toBe(3);
    expect(calcolaDistintivi({ eventi: EVENTI, oggi: OGGI }).concerti).toEqual({ tono: "ambra", conta: 3, sr: "3 da completare" });
    expect(calcolaDistintivi({ eventi: EVENTI.slice(0, 1), oggi: OGGI }).concerti).toBeUndefined();
  });
});

describe("partenze", () => {
  const conKm = [concerto({ id: "k", date: "01/10/2026", from: "Casa  milano", kmPending: true } as Partial<EventoUi> & { id: string; date: string })];
  it("solo se una partenza senza indirizzo tiene dei concerti coi km in attesa", () => {
    expect(partenzaDaImpostare([{ name: "Casa Milano", stato: "mancante" }], conKm)).toBe(true);
    // con l'indirizzo: niente
    expect(partenzaDaImpostare([{ name: "Casa Milano", stato: "impostato" }], conKm)).toBe(false);
    // senza indirizzo ma senza concerti in attesa
    expect(partenzaDaImpostare([{ name: "Casa Milano", stato: "mancante" }], [concerto({ id: "k", date: "01/10/2026", from: "Casa Milano" })])).toBe(false);
    // un'altra partenza senza indirizzo
    expect(partenzaDaImpostare([{ name: "Genova", stato: "mancante" }, { name: "Casa Milano", stato: "impostato" }], conKm)).toBe(false);
    expect(calcolaDistintivi({ eventi: conKm, partenze: [{ name: "Casa Milano", stato: "mancante" }], oggi: OGGI }).partenze).toEqual({ tono: "ambra", sr: "indirizzo da impostare" });
  });
});

describe("novità degli agenti", () => {
  const voci = [
    { id: "f", via: "dashboard" },
    { id: "e", via: "oracolo" },
    { id: "d", via: "mcp" },
    { id: "c", via: "sistema" },
    { id: "b", via: "apikey" },
    { id: "a", via: "oracolo" },
  ];
  it("solo Oracolo, MCP e API key più nuovi dell'ultima vista", () => {
    expect(novitaAgenti(voci, "a")).toBe(3);
    expect(novitaAgenti(voci, "d")).toBe(1);
    expect(novitaAgenti(voci, "e")).toBe(0);
    expect(novitaAgenti(voci, "f")).toBe(0);
  });
  it("mai visto, o una voce uscita dalla finestra: contano tutte quelle degli agenti", () => {
    expect(novitaAgenti(voci, null)).toBe(4);
    expect(novitaAgenti(voci, "vecchia")).toBe(4);
  });
  it("gli id delle voci «nuova» del registro: le stesse del punto", () => {
    expect(nuoveDagliAgenti(voci, "a")).toEqual(["e", "d", "b"]);
    expect(nuoveDagliAgenti(voci, "c")).toEqual(["e", "d"]);
    expect(nuoveDagliAgenti(voci, "f")).toEqual([]);
    expect(nuoveDagliAgenti(voci, null)).toEqual(["e", "d", "b", "a"]);
  });
  it("il punto c'è solo dopo aver letto l'ultima vista", () => {
    expect(calcolaDistintivi({ voci, oggi: OGGI }).attivita).toBeUndefined();
    expect(calcolaDistintivi({ voci, vistoId: "e", oggi: OGGI }).attivita).toBeUndefined();
    expect(calcolaDistintivi({ voci, vistoId: "d", oggi: OGGI }).attivita).toEqual({ tono: "teal", sr: "modifiche nuove dagli agenti" });
  });
});

describe("conteggi", () => {
  it("wishlist, persone e regali: grigi, e niente quando sono vuoti", () => {
    const d = calcolaDistintivi({ wishlist: ["A", "B"], persone: [], regali: [{}], oggi: OGGI });
    expect(d.wishlist).toEqual({ tono: "muto", conta: 2 });
    expect(d.persone).toBeUndefined();
    expect(d.regali).toEqual({ tono: "muto", conta: 1 });
  });
});
