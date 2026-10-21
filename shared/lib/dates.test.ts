/* "Oggi" si decide sempre a Roma, qualunque sia il fuso del processo: il
   server su Vercel gira in UTC, il browser nel fuso del visitatore. Il caso
   delicato è tra le 00:00 e le 02:00 di Roma, quando in UTC è ancora il
   giorno prima (00:00–01:00 d'inverno, 00:00–02:00 d'estate). */

import { describe, expect, it } from "vitest";
import {
  isoKey, isPlanned, keyToISO, monthOf, romeClock, romeMidnight, sortKey, todayKey, weekdayOf,
} from "./dates.ts";

const at = (iso: string) => Date.parse(iso);

describe("todayKey: il giorno di calendario a Roma", () => {
  it("d'estate (CEST, UTC+2) il giorno cambia alle 22:00 UTC", () => {
    expect(todayKey(at("2026-10-20T21:59:59Z"))).toBe(20261020); // 23:59:59 a Roma
    expect(todayKey(at("2026-10-20T22:00:00Z"))).toBe(20261021); // 00:00 a Roma, in UTC è ancora il 20
    expect(todayKey(at("2026-10-20T23:30:00Z"))).toBe(20261021); // 01:30 a Roma
    expect(todayKey(at("2026-10-21T00:00:00Z"))).toBe(20261021); // 02:00 a Roma
  });

  it("d'inverno (CET, UTC+1) il giorno cambia alle 23:00 UTC", () => {
    expect(todayKey(at("2026-11-18T22:59:59Z"))).toBe(20261118);
    expect(todayKey(at("2026-11-18T23:00:00Z"))).toBe(20261119);
    expect(todayKey(at("2026-11-18T23:59:59Z"))).toBe(20261119); // in UTC ancora il 18
  });

  it("a capodanno cambia anche l'anno", () => {
    expect(todayKey(at("2025-12-31T22:59:59Z"))).toBe(20251231);
    expect(todayKey(at("2025-12-31T23:00:00Z"))).toBe(20260101);
  });

  it("non dipende dal fuso del processo (usa Intl, non getDate)", () => {
    // lo stesso istante dà lo stesso giorno: qui lo verifichiamo contro romeClock
    const ts = at("2026-03-29T00:30:00Z"); // notte del cambio d'ora: 01:30 CET
    const c = romeClock(ts);
    expect(c).toMatchObject({ y: 2026, m: 3, d: 29, h: 1, mi: 30 });
    expect(todayKey(ts)).toBe(20260329);
  });
});

describe("isPlanned: in programma = oggi o dopo, a Roma", () => {
  const concert = { date: "18/11/2026" };

  it("il concerto di oggi conta ancora come in programma", () => {
    expect(isPlanned(concert, todayKey(at("2026-11-18T21:00:00Z")))).toBe(true); // 22:00 a Roma
  });

  it("tra 00:00 e 01:00 di Roma (UTC ancora il giorno prima) il concerto di ieri è passato", () => {
    const ts = at("2026-11-18T23:30:00Z"); // 19/11 00:30 a Roma
    expect(new Date(ts).getUTCDate()).toBe(18);
    expect(isPlanned(concert, todayKey(ts))).toBe(false);
  });

  it("d'estate vale fino alle 02:00 di Roma", () => {
    const summer = { date: "21/06/2026" };
    expect(isPlanned(summer, todayKey(at("2026-06-21T21:59:00Z")))).toBe(true); // 23:59 a Roma
    expect(isPlanned(summer, todayKey(at("2026-06-21T22:00:00Z")))).toBe(false); // 00:00 del 22 a Roma
    expect(isPlanned(summer, todayKey(at("2026-06-21T23:59:00Z")))).toBe(false); // 01:59, UTC ancora il 21
  });

  it("un evento di più giorni vale dal primo giorno", () => {
    const fest = { date: "21–24/05/2026" };
    expect(sortKey(fest)).toBe(20260521);
    expect(isPlanned(fest, 20260521)).toBe(true);
    expect(isPlanned(fest, 20260522)).toBe(false);
  });
});

describe("romeMidnight", () => {
  it("è la mezzanotte di Roma, con l'ora legale e senza", () => {
    expect(new Date(romeMidnight(2022, 1, 1)).toISOString()).toBe("2021-12-31T23:00:00.000Z");
    expect(new Date(romeMidnight(2026, 7, 1)).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("regge i giorni del cambio d'ora", () => {
    // 29/03/2026: alle 02:00 si passa alle 03:00, la mezzanotte è ancora CET
    expect(new Date(romeMidnight(2026, 3, 29)).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    // 25/10/2026: la mezzanotte è ancora CEST
    expect(new Date(romeMidnight(2026, 10, 25)).toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(new Date(romeMidnight(2026, 10, 26)).toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("todayKey della mezzanotte di Roma è quel giorno, un millisecondo prima è il giorno prima", () => {
    const m = romeMidnight(2026, 10, 21);
    expect(todayKey(m)).toBe(20261021);
    expect(todayKey(m - 1)).toBe(20261020);
  });
});

describe("chiavi e parti delle date", () => {
  it("sortKey legge gg/mm/aaaa e i periodi, 0 se illeggibile", () => {
    expect(sortKey({ date: "02/12/2026" })).toBe(20261202);
    expect(sortKey({ date: "30–31/03/2017" })).toBe(20170330);
    expect(sortKey({ date: "presto" })).toBe(0);
  });

  it("weekdayOf: 0 = lunedì … 6 = domenica, senza dipendere dal fuso", () => {
    expect(weekdayOf({ date: "19/10/2026" })).toBe(0); // lunedì
    expect(weekdayOf({ date: "21/10/2026" })).toBe(2); // mercoledì
    expect(weekdayOf({ date: "25/10/2026" })).toBe(6); // domenica
  });

  it("monthOf è 0..11", () => {
    expect(monthOf({ date: "18/11/2026" })).toBe(10);
    expect(monthOf({ date: "01/01/2020" })).toBe(0);
  });

  it("keyToISO e isoKey sono l'una l'inversa dell'altra", () => {
    expect(keyToISO(20170330)).toBe("2017-03-30");
    expect(isoKey("2017-03-30")).toBe(20170330);
    expect(isoKey(keyToISO(20270623))).toBe(20270623);
    expect(isoKey("30/03/2017")).toBeNull();
    expect(isoKey("")).toBeNull();
  });
});
