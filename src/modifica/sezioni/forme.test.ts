/* Le parti pure delle sezioni di /modifica (T5): validazione dallo schema
   unico, conversioni del modale dei concerti, "da completare", l'elenco e
   il form di #concerti (filtri, ordini, separatori, coda, duplicati,
   concerto ↔ festival, scorciatoie), layout, e i token dello stile
   (specchio di shared/theme.ts). */

import { describe, expect, it } from "vitest";
import { todayKey } from "../../../shared/lib/dates.ts";
import { SECTIONS } from "../../../shared/sections.ts";
import { concertoInput, entryInput, festivalInput, modificaConcertoInput } from "../../../shared/schema/entry.ts";
import {
  anniDi, campiMancanti, campoDaServer, campoDi, cercaEventi, chiaveNome, compagniBrevi, compagniFrequenti, conSeparatori, daCompletare,
  daConcertoAFestival, daFestivalAConcerto, daIso, descrizione, elencoPersone, erroriSchema, etichettaCampo, eventiConPersona, eventiDiPersona,
  filtraEventi, giornoDaChiave, inIso, inputConcerto, inputFestival, layoutDa, nomeGiaUsato, ordinaCampi, ordinaEventi, ordinaEventiPer,
  patchConcerto, patchFestival, prossimoDaCompletare, righeLayout, spostata, ultimaPartenza, ultimoConcertoPerPersona, valoriConcerto,
  valoriDuplicati, valoriFestival, venueRecenti, viaggioDi,
  type EventoUi, type ValoriConcerto, type ValoriFestival,
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

  it("filtri: in programma, passati, da completare, festival, anno, con chi e testo", () => {
    const ids = (f: Parameters<typeof filtraEventi>[1]) => filtraEventi(eventi, f, oggi).map(e => e.id).sort();
    expect(ids({})).toEqual(["a", "b", "c", "d"]);
    expect(ids({ filtro: "programma" })).toEqual(["c"]);
    expect(ids({ filtro: "passati" })).toEqual(["a", "b", "d"]);
    expect(ids({ filtro: "da-completare" })).toEqual(["b", "d"]);
    expect(ids({ filtro: "festival" })).toEqual(["d"]);
    expect(ids({ anno: 2026 })).toEqual(["b", "c", "d"]);
    // «Con Lu»: anche dentro un set del festival, senza maiuscole
    expect(ids({ con: "LU" })).toEqual(["a", "d"]);
    expect(ids({ filtro: "passati", anno: 2026, testo: "senza" })).toEqual(["b"]);
    expect(anniDi(eventi)).toEqual([2026, 2025]);
  });

  it("ordini: per data nei due versi, artista (il nome per un festival), voto (il più alto dei set, senza voto in fondo)", () => {
    const ord = (o: Parameters<typeof ordinaEventiPer>[1]) => ordinaEventiPer(eventi, o).map(e => e.id);
    expect(ord("recenti")).toEqual(["c", "b", "d", "a"]);
    expect(ord("meno-recenti")).toEqual(["a", "d", "b", "c"]);
    expect(ord("artista")).toEqual(["c", "d", "b", "a"]);
    expect(ord("voto")).toEqual(["d", "a", "c", "b"]);
    // a parità resta l'ordine per data
    const pari = [concerto({ id: "x", date: "01/01/2024", artist: "Zeta", voto: 4 }), concerto({ id: "y", date: "01/01/2025", artist: "zeta", voto: 4 })];
    expect(ordinaEventiPer(pari, "artista").map(e => e.id)).toEqual(["y", "x"]);
    expect(ordinaEventiPer(pari, "voto").map(e => e.id)).toEqual(["y", "x"]);
  });

  it("separatori: l'anno con quanti eventi e una sola riga «oggi», solo negli ordini per data", () => {
    const righe = conSeparatori(ordinaEventi(eventi), "recenti", oggi).map(r => (r.tipo === "evento" ? r.e.id : r.tipo === "anno" ? `${r.anno}·${r.conta}` : "oggi"));
    expect(righe).toEqual(["2026·3", "c", "oggi", "b", "d", "2025·1", "a"]);
    const indietro = conSeparatori(ordinaEventiPer(eventi, "meno-recenti"), "meno-recenti", oggi).map(r => (r.tipo === "evento" ? r.e.id : r.tipo));
    expect(indietro).toEqual(["anno", "a", "anno", "d", "b", "oggi", "c"]);
    expect(conSeparatori(eventi, "artista", oggi).every(r => r.tipo === "evento")).toBe(true);
    expect(giornoDaChiave(oggi)).toBe("21/10/2026");
  });

  it("righe: il viaggio esatto, il voto, i compagni in breve", () => {
    expect(viaggioDi({ from: "Casa", km: 212 })).toBe("da Casa · 212 km");
    expect(viaggioDi({ from: "Casa", kmPending: true })).toBe("da Casa · km in attesa");
    expect(viaggioDi({ from: "Casa" })).toBe("da Casa");
    expect(viaggioDi({})).toBe("—");
    const conTanti = concerto({ id: "z", date: "01/01/2025", with: ["Cami <3", "Espi", "Lu", "lu", "Ale"] });
    expect(compagniBrevi(conTanti)).toBe("Cami <3, Espi +2");
    expect(compagniBrevi(eventi[3])).toBe("lu");
    expect(compagniBrevi(eventi[1])).toBe("");
  });

  it("coda dei da completare: il prossimo dopo quello salvato, null alla fine", () => {
    const lista = [{ id: "b" }, { id: "d" }, { id: "e" }];
    expect(prossimoDaCompletare(lista, "b")).toBe("d");
    expect(prossimoDaCompletare(lista, "d")).toBe("e");
    expect(prossimoDaCompletare(lista, "e")).toBeNull();
    // aperto da un link diretto, non più nell'elenco: il primo degli altri
    expect(prossimoDaCompletare(lista, "x")).toBe("b");
    expect(prossimoDaCompletare([{ id: "b" }], "b")).toBeNull();
  });
});

describe("form di un concerto", () => {
  const oggi = todayKey(Date.parse("2026-10-21T12:00:00+02:00"));
  const c = concerto({
    id: "e1", date: "24/07/2025", artist: "Caparezza", with: ["Lu"], voto: 5, vicinanza: 6, canzoniNote: 4,
    cost: 60.5, gift: true, giftFrom: "Amici", accredito: true, from: "Casa", comments: "Serata enorme",
  });

  it("campi mancanti: solo per un evento passato, per set nei festival, e la partenza", () => {
    const v: ValoriConcerto = { ...valoriConcerto(), artist: "A", date: "2026-10-01", venue: "V", city: "C", voto: 4 };
    expect(campiMancanti(v, oggi)).toEqual(["vicinanza", "canzoniNote", "from"]);
    expect(campiMancanti({ ...v, date: "2026-12-01" }, oggi)).toEqual([]);
    expect(campiMancanti({ ...v, date: "" }, oggi)).toEqual([]);
    const f: ValoriFestival = { ...valoriFestival(), name: "F", date: "30–31/05/2026", from: "Casa", concerts: [{ artist: "A", with: [], date: "", voto: 4, vicinanza: 6, canzoniNote: "na" }, { artist: "B", with: [], date: "" }] };
    expect(campiMancanti(f, oggi)).toEqual(["concerts[1].voto", "concerts[1].vicinanza", "concerts[1].canzoniNote"]);
  });

  it("etichette e ordine dei campi per il riepilogo degli errori", () => {
    expect(etichettaCampo("artist")).toBe("Artista");
    expect(etichettaCampo("city")).toBe("Venue");
    expect(etichettaCampo("concerts[1].voto")).toBe("Voto del concerto 2");
    expect(etichettaCampo("concerts[0].date")).toBe("Giorno del concerto 1");
    expect(ordinaCampi(["from", "venue", "concerts[1].artist", "name", "concerts[0].voto", "concerts", "date"])).toEqual([
      "name", "date", "venue", "concerts", "concerts[0].voto", "concerts[1].artist", "from",
    ]);
  });

  it("gli errori del server vanno sul loro campo", () => {
    expect(campoDaServer("venue")).toBe("venue");
    expect(campoDaServer("with.0")).toBe("with");
    expect(campoDaServer("concerts.1.with.0")).toBe("concerts[1].with");
    expect(campoDaServer("from")).toBe("from");
    expect(campoDaServer("giftFrom")).toBe("giftFrom");
    expect(campoDaServer("patch")).toBeNull();
    expect(campoDaServer(undefined)).toBeNull();
  });

  it("duplica: tiene artista, venue, compagni, partenza e biglietto; toglie data, voti e commento", () => {
    const d = valoriDuplicati(c) as ValoriConcerto;
    expect(d).toMatchObject({ artist: "Caparezza", venue: "Fabrique", city: "Milano", with: ["Lu"], from: "Casa", cost: 60.5, gift: true, giftFrom: "Amici", accredito: true });
    expect(d).toMatchObject({ date: "", comments: "" });
    expect([d.voto, d.vicinanza, d.canzoniNote]).toEqual([undefined, undefined, undefined]);
    const f = valoriDuplicati(festival({ id: "f", date: "21–24/05/2025", from: "Casa", cost: 40, comments: "x", concerts: [{ artist: "A", with: ["Lu"] }, { artist: "B", with: [] }] })) as ValoriFestival;
    expect(f).toMatchObject({ name: "MI AMI", venue: "Idroscalo", city: "Milano", from: "Casa", date: "", comments: "" });
    expect(f.cost).toBeUndefined();
    expect(f.concerts).toEqual([{ artist: "", with: [], date: "" }, { artist: "", with: [], date: "" }]);
  });

  it("concerto ↔ festival: data, venue, biglietto, viaggio e commento restano; l'artista è il primo concerto", () => {
    const v = valoriConcerto(c as never);
    const f = daConcertoAFestival(v);
    expect(f).toMatchObject({ name: "", date: "24/07/2025", venue: "Fabrique", cost: 60.5, giftFrom: "Amici", from: "Casa", comments: "Serata enorme" });
    expect(f.concerts).toEqual([{ artist: "Caparezza", with: ["Lu"], voto: 5, vicinanza: 6, canzoniNote: 4, date: "" }, { artist: "", with: [], date: "" }]);
    expect(daFestivalAConcerto(f)).toEqual(v);
    // un festival di più giorni torna senza data (il primo concerto può averne una sua)
    const g = daFestivalAConcerto({ ...f, date: "30–31/05/2026", concerts: [{ ...f.concerts[0], date: "2026-05-31" }, f.concerts[1]] });
    expect(g.date).toBe("2026-05-31");
    expect(daIso("2026-05-31")).toBe("31/05/2026");
    expect(daIso("31/05/2026")).toBe("");
  });

  it("scorciatoie: venue recenti senza doppioni, compagni frequenti, l'ultima partenza", () => {
    const tutti = [
      concerto({ id: "1", date: "01/03/2026", venue: "Alcatraz", city: "Milano" }),
      concerto({ id: "2", date: "01/02/2026", venue: "alcatraz", city: "Milano", from: "Casa" }),
      concerto({ id: "3", date: "01/01/2026", venue: "Magnolia", city: "Segrate", from: "Ufficio" }),
      concerto({ id: "4", date: "01/12/2026", venue: "?", city: "?" }),
    ];
    expect(venueRecenti(tutti)).toEqual([{ venue: "Alcatraz", city: "Milano" }, { venue: "Magnolia", city: "Segrate" }]);
    expect(venueRecenti(tutti, 1)).toHaveLength(1);
    expect(ultimaPartenza(tutti)).toBe("Casa");
    expect(ultimaPartenza([tutti[0]])).toBeNull();
    const persone = [{ name: "Lu", concerti: 3 }, { name: "Ale", concerti: 9 }, { name: "Bea", concerti: 3 }, { name: "Mai", concerti: 0 }];
    expect(compagniFrequenti(persone)).toEqual(["Ale", "Bea", "Lu"]);
    expect(compagniFrequenti(persone, ["ale"], 2)).toEqual(["Bea", "Lu"]);
  });
});

describe("#persone e #wishlist (spec ux-modifica §6.4–6.5)", () => {
  const oggi = todayKey(Date.UTC(2026, 5, 15, 10));
  const eventi = [
    concerto({ id: "a", date: "10/03/2024", with: ["Lu", "Ale"] }),
    concerto({ id: "b", date: "01/02/2026", with: ["lù"] }),
    concerto({ id: "c", date: "20/05/2027", with: ["Lu", "Bea"] }),
    concerto({ id: "d", date: "15/06/2026", with: ["Bea"] }),
    festival({
      id: "f", date: "12–13/07/2025", name: "Fest",
      concerts: [{ artist: "A", with: ["Ale"] }, { artist: "B", with: ["Ale", "Cami"], date: "13/07/2025" }],
    }),
  ];

  it("l'ultima volta con ciascuno: solo le serate passate, il giorno del concerto di un festival", () => {
    const u = ultimoConcertoPerPersona(eventi, oggi);
    expect(u.get("lu")).toBe("01/02/2026"); // «lù» è la stessa chiave; il 2027 è in programma
    expect(u.get("ale")).toBe("13/07/2025");
    expect(u.get("cami")).toBe("13/07/2025");
    expect(u.has("bea")).toBe(false); // solo oggi (in programma) e nel 2027
    expect(ultimoConcertoPerPersona([festival({ id: "g", date: "12–13/07/2025", concerts: [{ artist: "A", with: ["Ale"] }] })], oggi).get("ale")).toBe("12–13/07/2025");
  });

  it("gli eventi di una persona, dal più recente, anche nei set di un festival", () => {
    expect(eventiDiPersona(eventi, "LU").map(e => e.id)).toEqual(["c", "b", "a"]);
    expect(eventiDiPersona(eventi, "Cami").map(e => e.id)).toEqual(["f"]);
    expect(eventiConPersona(eventi, "Cami")).toEqual(["12–13/07/2025 · Fest"]);
  });

  it("i nomi già usati, senza maiuscole, accenti e spazi doppi", () => {
    expect(nomeGiaUsato(["Marco R.", "Lù"], "  marco   r. ")).toBe("Marco R.");
    expect(nomeGiaUsato(["Marco R.", "Lù"], "lu")).toBe("Lù");
    expect(nomeGiaUsato(["Marco R."], "Marco")).toBeNull();
    expect(nomeGiaUsato(["Marco R."], "  ")).toBeNull();
  });

  it("ricerca, «Mai in un concerto» e ordine delle persone", () => {
    const persone = [
      { id: "1", name: "Lu", concerti: 3 }, { id: "2", name: "Àle", concerti: 9 }, { id: "3", name: "Bea", concerti: 3 },
      { id: "4", name: "Zoe", concerti: 0 }, { id: "5", name: "Mai", concerti: 0 },
    ];
    const nomi = (o: Parameters<typeof elencoPersone>[1]) => elencoPersone(persone, o).map(p => p.name);
    expect(nomi({})).toEqual(["Àle", "Bea", "Lu", "Mai", "Zoe"]);
    expect(nomi({ testo: "ale" })).toEqual(["Àle"]);
    expect(nomi({ testo: " E " })).toEqual(["Àle", "Bea", "Zoe"]);
    expect(nomi({ filtro: "mai" })).toEqual(["Mai", "Zoe"]);
    expect(nomi({ ordine: "piu" })).toEqual(["Àle", "Bea", "Lu", "Mai", "Zoe"]);
    expect(nomi({ ordine: "meno" })).toEqual(["Mai", "Zoe", "Bea", "Lu", "Àle"]);
    expect(persone[0].name).toBe("Lu"); // l'elenco di partenza resta com'è
  });

  it("spostare una voce della wishlist: su, giù, in cima, in fondo", () => {
    const l = ["A", "B", "C", "D"];
    expect(spostata(l, 2, 1)).toEqual(["A", "C", "B", "D"]);
    expect(spostata(l, 1, 2)).toEqual(["A", "C", "B", "D"]);
    expect(spostata(l, 3, 0)).toEqual(["D", "A", "B", "C"]);
    expect(spostata(l, 0, 99)).toEqual(["B", "C", "D", "A"]);
    expect(spostata(l, 9, 0)).toEqual(l);
    expect(l).toEqual(["A", "B", "C", "D"]);
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
