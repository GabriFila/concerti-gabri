/* Le parti pure delle sezioni di /modifica (T5): validazione dallo schema
   unico, conversioni del modale dei concerti, "da completare", layout, e i
   token dello stile (specchio di shared/theme.ts). */

import { describe, expect, it } from "vitest";
import { todayKey } from "../../../shared/lib/dates.ts";
import { SECTIONS } from "../../../shared/sections.ts";
import { concertoInput, entryInput, festivalInput, modificaConcertoInput } from "../../../shared/schema/entry.ts";
import {
  campoDi, cercaEventi, chiaveNome, daCompletare, descrizione, erroriSchema, eventiConPersona, inIso, inputConcerto, inputFestival,
  layoutDa, ordinaEventi, patchConcerto, patchFestival, righeLayout, valoriConcerto, valoriFestival, type EventoUi,
} from "./forme.ts";
import { PRESET, accentoChiaro, contrastoMinimo, problemaAccento, risolviTema, SUPERFICI } from "./stileToken.ts";

const concerto = (x: Partial<EventoUi> & { id: string; date: string }): EventoUi =>
  ({ kind: "concert", venue: "Fabrique", city: "Milano", artist: "X", with: [], daCompletare: false, ...x }) as EventoUi;
const festival = (x: Record<string, unknown> & { id: string; date: string }): EventoUi =>
  ({ kind: "festival", venue: "Idroscalo", city: "Milano", name: "MI AMI", concerts: [], daCompletare: false, ...x }) as unknown as EventoUi;

describe("validazione dallo schema", () => {
  it("percorsi di TanStack Form e messaggi in italiano, senza ripetere i valori", () => {
    expect(campoDi(["concerts", 0, "artist"])).toBe("concerts[0].artist");
    expect(campoDi(["venue"])).toBe("venue");
    const e = erroriSchema(festivalInput, {
      kind: "festival", name: "", date: "", venue: "", city: "Milano", cost: -1, concerts: [{ artist: "", with: [] }],
    });
    expect(e?.fields).toMatchObject({
      name: "obbligatorio",
      date: "obbligatorio",
      venue: "obbligatorio",
      cost: "minimo 0",
      "concerts[0].artist": "obbligatorio",
      concerts: "servono almeno 2 elementi",
    });
    expect(erroriSchema(concertoInput, inputConcerto({ ...valoriConcerto(), artist: "A", date: "2026-13-40", venue: "V", city: "C" }))?.fields.date).toBe("data non valida");
    expect(JSON.stringify(erroriSchema(concertoInput, { kind: "concert", date: "x", venue: "SEGRETO-123", city: "", artist: "a" }))).not.toContain("SEGRETO");
    expect(erroriSchema(concertoInput, inputConcerto({ ...valoriConcerto(), artist: "A", date: "2026-10-01", venue: "V", city: "C" }))).toBeUndefined();
  });

  it("le descrizioni dello schema arrivano anche dentro optional e default", () => {
    expect(descrizione(concertoInput.shape.cost)).toMatch(/Prezzo del biglietto/);
    expect(descrizione(concertoInput.shape.with)).toMatch(/Marco R\./);
    expect(descrizione(undefined)).toBeUndefined();
  });

  it("i nomi si confrontano come sul server", () => {
    expect(chiaveNome("  Élena   B ")).toBe("elena b");
  });
});

describe("modale dei concerti", () => {
  const c = concerto({
    id: "e1", date: "24/07/2025", artist: "Caparezza", with: ["Lu"], voto: 5, vicinanza: 6, canzoniNote: 4,
    cost: 60.5, gift: true, giftFrom: "Amici", from: "Casa", comments: "Serata enorme",
  });

  it("un concerto esistente torna identico nell'input di add_concert", () => {
    const v = valoriConcerto(c as never);
    expect(v.date).toBe("2025-07-24");
    const input = entryInput.parse(inputConcerto(v));
    expect(input).toMatchObject({ kind: "concert", date: "24/07/2025", artist: "Caparezza", with: ["Lu"], voto: 5, cost: 60.5, gift: true, giftFrom: "Amici", from: "Casa", comments: "Serata enorme" });
  });

  it("un nuovo concerto: i campi vuoti non partono, il regalato da solo con il regalo", () => {
    const v = { ...valoriConcerto(), artist: "A", date: "2026-10-01", venue: "V", city: "C", giftFrom: "Amici", comments: "  " };
    expect(inputConcerto(v)).toEqual({ kind: "concert", date: "2026-10-01", venue: "V", city: "C", artist: "A", with: [] });
  });

  it("la patch di update_concert toglie i campi svuotati (null) ed è valida", () => {
    const v = { ...valoriConcerto(c as never), voto: undefined, gift: false, from: "", comments: "", cost: undefined };
    const patch = patchConcerto(v);
    expect(patch).toMatchObject({ voto: null, gift: null, giftFrom: null, from: null, comments: null, cost: null, vicinanza: 6 });
    expect(modificaConcertoInput.safeParse({ id: "e1", patch }).success).toBe(true);
    expect(patch).not.toHaveProperty("concerts");
  });

  it("festival: data di più giorni, lineup con il giorno di ogni set", () => {
    const f = festival({
      id: "f1", date: "21–24/05/2025", cost: "na", from: "Casa",
      concerts: [{ artist: "Rares", with: ["Marco R."], date: "22/05/2025", voto: 4 }, { artist: "Patagarri", with: [] }],
    });
    const v = valoriFestival(f as never);
    expect(v.date).toBe("21–24/05/2025");
    expect(v.concerts.map(x => x.date)).toEqual(["2025-05-22", ""]);
    expect(entryInput.parse(inputFestival(v))).toMatchObject({
      kind: "festival", name: "MI AMI", cost: "na", concerts: [{ artist: "Rares", date: "22/05/2025", voto: 4 }, { artist: "Patagarri" }],
    });
    const patch = patchFestival(v);
    expect(modificaConcertoInput.safeParse({ id: "f1", patch }).success).toBe(true);
    expect(patch).not.toHaveProperty("artist");
    expect(valoriFestival().concerts).toHaveLength(2);
  });

  it("inIso: solo un giorno singolo", () => {
    expect(inIso("05/01/2026")).toBe("2026-01-05");
    expect(inIso("30–31/03/2017")).toBe("");
    expect(inIso(undefined)).toBe("");
  });
});

describe("elenco e da completare", () => {
  const oggi = todayKey(Date.parse("2026-10-21T12:00:00+02:00"));
  const eventi = [
    concerto({ id: "a", date: "01/01/2025", artist: "Vecchio", voto: 3, vicinanza: 4, canzoniNote: 2, from: "Casa", with: ["Lu"] }),
    concerto({ id: "b", date: "10/10/2026", artist: "Senza voto", vicinanza: 4, canzoniNote: 2 }),
    concerto({ id: "c", date: "25/12/2026", artist: "Futuro" }),
    festival({
      id: "d", date: "21–24/05/2026", name: "MI AMI", from: "Casa",
      concerts: [{ artist: "Rares", with: ["lu"], voto: 4, vicinanza: 5, canzoniNote: 3 }, { artist: "Patagarri", with: [] }, { artist: "Altro", with: [], voto: 2 }],
    }),
  ];

  it("dal più recente; la ricerca guarda artisti, festival, venue e compagni", () => {
    expect(ordinaEventi(eventi).map(e => e.id)).toEqual(["c", "b", "d", "a"]);
    expect(cercaEventi(eventi, "patag").map(e => e.id)).toEqual(["d"]);
    expect(cercaEventi(eventi, "LU").map(e => e.id).sort()).toEqual(["a", "d"]);
    expect(cercaEventi(eventi, " ")).toHaveLength(4);
  });

  it("solo gli eventi passati, con cosa manca (anche per set) e la partenza", () => {
    expect(daCompletare(eventi, oggi)).toEqual([
      { id: "b", titolo: "Senza voto", date: "10/10/2026", mancano: ["voto", "partenza"] },
      { id: "d", titolo: "MI AMI", date: "21–24/05/2026", mancano: ["voto (1 concerto)", "posizione (2 concerti)", "canzoni note (2 concerti)"] },
    ]);
  });

  it("gli eventi di una persona, per il blocco della cancellazione", () => {
    expect(eventiConPersona(eventi, "Lu")).toEqual(["21–24/05/2026 · MI AMI", "01/01/2025 · Vecchio"]);
    expect(eventiConPersona(eventi, "Nessuno")).toEqual([]);
  });
});

describe("layout de \"I dati\" (§1.35)", () => {
  it("righe: prima l'ordine salvato, poi il resto; gli id sconosciuti spariscono", () => {
    const r = righeLayout({ ordine: ["sec-archivio", "sec-nonesiste", "sec-kpis"], nascoste: ["sec-mappa"], titoli: { "sec-kpis": "Numeri" } });
    expect(r.map(x => x.id).slice(0, 3)).toEqual(["sec-archivio", "sec-kpis", "sec-andamento"]);
    expect(r).toHaveLength(SECTIONS.length);
    expect(r.find(x => x.id === "sec-mappa")?.visibile).toBe(false);
    expect(r.find(x => x.id === "sec-kpis")?.titolo).toBe("Numeri");
  });

  it("da salvare: l'ordine di base è vuoto, i titoli uguali a quelli di base non si salvano", () => {
    const base = righeLayout({ ordine: [], nascoste: [], titoli: {} });
    expect(layoutDa(base)).toEqual({ ordine: [], nascoste: [], titoli: {} });
    const cambiate = base.map(x => (x.id === "sec-voti" ? { ...x, visibile: false, titolo: " Stelle " } : x.id === "sec-kpis" ? { ...x, titolo: "Riepilogo" } : x));
    [cambiate[0], cambiate[1]] = [cambiate[1], cambiate[0]];
    const l = layoutDa(cambiate);
    expect(l.ordine.slice(0, 2)).toEqual(["sec-andamento", "sec-kpis"]);
    expect(l.nascoste).toEqual(["sec-voti"]);
    expect(l.titoli).toEqual({ "sec-voti": "Stelle" });
  });
});

describe("token dello stile", () => {
  it("i preset e i token del profilo", () => {
    expect(risolviTema({ preset: "predefinito" })).toEqual(PRESET.predefinito.token);
    expect(risolviTema({ preset: "neon", fontTitoli: "inter", accent: "#ABCDEF" })).toMatchObject({ accent: "#abcdef", fontTitoli: "inter", raggi: "netti" });
    expect(risolviTema({ preset: "boh", raggi: "storti" })).toEqual(PRESET.predefinito.token);
  });

  it("l'accento: leggibile in scuro, scurito quanto basta in chiaro, distinto dal teal", () => {
    for (const p of Object.values(PRESET)) if ("accent" in p.token) expect(problemaAccento(p.token.accent)).toBeNull();
    expect(problemaAccento("#203040")?.messaggio).toMatch(/troppo scuro/);
    expect(problemaAccento("#3cb4c8")?.messaggio).toMatch(/teal/);
    expect(problemaAccento("rosso")?.campo).toBe("theme.accent");
    expect(contrastoMinimo(accentoChiaro("#ffe08a"), SUPERFICI.chiaro)).toBeGreaterThanOrEqual(3);
  });
});
