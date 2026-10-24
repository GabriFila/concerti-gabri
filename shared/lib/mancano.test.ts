/* Cosa manca a un concerto: lo stesso elenco per la scheda dell'Oracolo
   (con il prezzo) e per il riquadro "da completare" della dashboard
   (senza), che non cambia. */

import { describe, expect, it } from "vitest";
import { daCompletare, type EventoUi } from "../../src/modifica/sezioni/forme.ts";
import { isPlanned, todayKey } from "./dates.ts";
import { mancanoDi } from "./mancano.ts";

const OGGI = todayKey(Date.parse("2026-10-21T12:00:00+02:00"));
const concerto = (x: Record<string, unknown> & { id: string; date: string }): EventoUi =>
  ({ kind: "concert", venue: "Fabrique", city: "Milano", artist: "X", with: [], daCompletare: false, ...x }) as unknown as EventoUi;
const festival = (x: Record<string, unknown> & { id: string; date: string }): EventoUi =>
  ({ kind: "festival", venue: "Idroscalo", city: "Milano", name: "MI AMI", concerts: [], daCompletare: false, ...x }) as unknown as EventoUi;

describe("mancanoDi", () => {
  it("un concerto passato: voto, posizione, canzoni note, partenza; il prezzo solo se chiesto", () => {
    const e = { kind: "concert", date: "10/10/2026", artist: "X", with: [] };
    expect(mancanoDi(e, OGGI, { prezzo: false })).toEqual(["voto", "posizione", "canzoni note", "partenza"]);
    expect(mancanoDi(e, OGGI, { prezzo: true })).toEqual(["voto", "posizione", "canzoni note", "partenza", "prezzo"]);
    const completo = { ...e, voto: 4, vicinanza: 6, canzoniNote: "na" as const, from: "Casa", cost: 35 };
    expect(mancanoDi(completo, OGGI, { prezzo: true })).toEqual([]);
  });

  it("il prezzo non manca con un regalo, un accredito o un prezzo dimenticato (\"na\")", () => {
    const base = { date: "10/10/2026", voto: 4, vicinanza: 6, canzoniNote: 3, from: "Casa" };
    expect(mancanoDi({ ...base, gift: true }, OGGI, { prezzo: true })).toEqual([]);
    expect(mancanoDi({ ...base, accredito: true }, OGGI, { prezzo: true })).toEqual([]);
    expect(mancanoDi({ ...base, cost: "na" }, OGGI, { prezzo: true })).toEqual([]);
    expect(mancanoDi({ ...base, cost: 0 }, OGGI, { prezzo: true })).toEqual([]);
  });

  it("un festival conta i concerti a cui manca qualcosa", () => {
    const f = { date: "21–24/05/2026", from: "Casa", concerts: [{ voto: 4, vicinanza: 5, canzoniNote: 3 }, {}, { voto: 2 }] };
    expect(mancanoDi(f, OGGI, { prezzo: false })).toEqual(["voto (1 concerto)", "posizione (2 concerti)", "canzoni note (2 concerti)"]);
  });

  it("in programma: solo partenza e prezzo (voto e posizione arrivano dopo la serata)", () => {
    const futuro = { date: "25/12/2026", artist: "Futuro", with: [] };
    expect(mancanoDi(futuro, OGGI, { prezzo: true })).toEqual(["partenza", "prezzo"]);
    expect(mancanoDi({ ...futuro, from: "Casa", cost: 40 }, OGGI, { prezzo: true })).toEqual([]);
    // oggi conta ancora come in programma
    expect(mancanoDi({ date: "21/10/2026", from: "Casa" }, OGGI, { prezzo: false })).toEqual([]);
  });

  it("il riquadro della dashboard (daCompletare in forme.ts) dice le stesse cose senza il prezzo", () => {
    const eventi = [
      concerto({ id: "a", date: "01/01/2025", artist: "Vecchio", voto: 3, vicinanza: 4, canzoniNote: 2, from: "Casa", with: ["Lu"] }),
      concerto({ id: "b", date: "10/10/2026", artist: "Senza voto", vicinanza: 4, canzoniNote: 2 }),
      concerto({ id: "c", date: "25/12/2026", artist: "Futuro" }),
      festival({
        id: "d", date: "21–24/05/2026", name: "MI AMI", from: "Casa",
        concerts: [{ artist: "Rares", with: ["lu"], voto: 4, vicinanza: 5, canzoniNote: 3 }, { artist: "Patagarri", with: [] }, { artist: "Altro", with: [], voto: 2 }],
      }),
    ];
    const box = daCompletare(eventi, OGGI);
    expect(box.map(x => x.id)).toEqual(["b", "d"]);
    for (const e of eventi.filter(x => !isPlanned(x, OGGI))) {
      expect(box.find(x => x.id === e.id)?.mancano ?? [], e.id).toEqual(mancanoDi(e, OGGI, { prezzo: false }));
    }
  });
});
