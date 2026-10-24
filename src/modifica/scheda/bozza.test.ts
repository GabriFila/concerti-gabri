/* La scheda dell'Oracolo nel browser, parte pura: proposta ↔ bozza (con
   lo stesso daProposta del server), i problemi Da sistemare / Da
   controllare / Mancano, i doppioni, le mosse della scheda (festival ↔
   concerto, «Aggiorna quello», la lineup, «Tienilo»), il ponte del
   «Modulo completo», lo stato nella chat e le date leggibili. */

import { describe, expect, it } from "vitest";
import { todayKey } from "../../../shared/lib/dates.ts";
import { applica, daProposta, propostaConcertoInput, type EventoEsterno, type PropostaConcerto } from "../../../shared/schema/proposta.ts";
import type { ValoriConcerto, ValoriFestival } from "../sezioni/forme.ts";
import {
  aggiornaQuello, conSetInPiu, daModulo, distanza, doppioni, evidenziaDi, giornoLungo, inConcerto, inFestival, problemiScheda, propostaDaValori,
  senzaSet, singoloPossibile, spostaSet, statoNome, statoScheda, tieniSet, toglieSet, validaScheda, valoriDaProposta,
  type Bozza, type ContestoScheda,
} from "./bozza.ts";

const OGGI = todayKey(Date.parse("2026-10-21T12:00:00+02:00"));
const p = (x: Record<string, unknown>): PropostaConcerto => propostaConcertoInput.parse(x);
const CTX: ContestoScheda = {
  oggi: OGGI,
  persone: ["Lu", "Marco R.", "Marco B."],
  partenze: [{ name: "Casa", stato: "impostato" }, { name: "Lavoro", stato: "mancante" }],
  regali: ["Mamma"],
  venueNelCatalogo: true,
};
const tipi = (b: Bozza, ctx: Partial<ContestoScheda> = {}) => problemiScheda(b, { ...CTX, ...ctx }).daSistemare.map(x => x.tipo);
const avvisi = (b: Bozza, ctx: Partial<ContestoScheda> = {}) => problemiScheda(b, { ...CTX, ...ctx }).daControllare.map(x => x.tipo);

const VERDENA: EventoEsterno = {
  id: "e1", kind: "concert", date: "18/10/2025", venue: "Alcatraz", city: "Milano", artist: "Verdena", with: ["Lu"], voto: 5, cost: 35, from: "Casa", km: 212,
};
const MIAMI: EventoEsterno = {
  id: "e2", kind: "festival", date: "30–31/05/2025", venue: "Magnolia", city: "Segrate", name: "MI AMI", from: "Casa",
  concerts: [
    { artist: "Verdena", with: ["Lu"], voto: 4, vicinanza: 5, date: "30/05/2025" },
    { artist: "Calcutta", with: [] },
    { artist: "Verdena", with: [], date: "31/05/2025" },
  ],
};

describe("proposta → bozza → proposta: lo stesso daProposta del server", () => {
  it("un concerto: tutti i campi tornano uguali", () => {
    const prop = p({
      artist: "Verdena", date: "2025-10-18", venue: "Alcatraz", city: "Milano", with: ["Lu", "lu", "Marco R."], voto: 5, vicinanza: 6, canzoniNote: "na",
      costForgotten: true, giftFrom: "Mamma", accredito: true, from: "Casa", comments: "Che sera",
    });
    const b = valoriDaProposta(prop);
    expect(b.tipo).toBe("concert");
    expect((b.valori as ValoriConcerto).date).toBe("2025-10-18");
    expect((b.valori as ValoriConcerto).with).toEqual(["Lu", "Marco R."]);
    expect(daProposta(propostaDaValori(b))).toEqual(daProposta(prop));
  });

  it("un festival: compagni generali nei set, voto generale ignorato (e detto)", () => {
    const prop = p({
      name: "MI AMI 2026", date: "30–31/05/2026", venue: "Magnolia", city: "Segrate", with: ["Lu"], voto: 4,
      concerts: [{ artist: "Verdena", voto: 5, date: "2026-05-30" }, { artist: "Calcutta", with: ["Marco R."], canzoniNote: "3" }],
    });
    const b = valoriDaProposta(prop);
    expect(b.tipo).toBe("festival");
    expect((b.valori as ValoriFestival).concerts.map(c => c.with)).toEqual([["Lu"], ["Marco R."]]);
    expect(b.ignorati).toEqual(["Voto generale ignorato: in un festival si vota ogni concerto."]);
    // lo stesso input; il voto generale, già detto alla scheda, non torna
    const a = daProposta(prop);
    const c = daProposta(propostaDaValori(b));
    expect(c.ok && c.azione === "aggiungi" && c.input).toEqual(a.ok && a.azione === "aggiungi" && a.input);
  });

  it("una scheda vuota è un concerto senza niente", () => {
    const b = valoriDaProposta(p({}));
    expect(b.tipo).toBe("concert");
    expect(propostaDaValori(b)).toEqual({});
  });

  it("una modifica: lo stesso evento dopo il Salva, e solo i campi diversi (più remove)", () => {
    const prop = p({ id: "e1", voto: 4, remove: ["cost"], with: ["Lu", "Marco R."], comments: "nota" });
    const b = valoriDaProposta(prop, VERDENA);
    expect(b.id).toBe("e1");
    const indietro = propostaDaValori(b);
    expect(indietro).toEqual({ id: "e1", with: ["Lu", "Marco R."], voto: 4, comments: "nota", remove: ["cost"] });
    const a = daProposta(prop, VERDENA);
    const c = daProposta(indietro, VERDENA);
    if (!a.ok || !c.ok || a.azione !== "modifica" || c.azione !== "modifica") throw new Error("non ok");
    expect(applica(VERDENA, c.patch)).toEqual(applica(VERDENA, a.patch));
  });

  it("un valore uguale a quello che c'è non diventa una differenza", () => {
    const b = valoriDaProposta(p({ id: "e1", voto: 5 }), VERDENA);
    expect(propostaDaValori(b)).toEqual({ id: "e1" });
    expect(tipi(b)).toEqual(["nessuna_differenza"]);
  });

  it("togliere un regalo toglie anche chi l'ha fatto; il prezzo dimenticato è costForgotten", () => {
    const conRegalo: EventoEsterno = { ...VERDENA, gift: true, giftFrom: "Mamma", cost: undefined };
    const b = valoriDaProposta(p({ id: "e1", gift: false, costForgotten: true }), conRegalo);
    expect(propostaDaValori(b)).toEqual({ id: "e1", costForgotten: true, gift: false });
  });

  it("festival: la lineup si unisce per artista e giorno, e torna come concerti cambiati e tolti", () => {
    const prop = p({ id: "e2", concerts: [{ artist: "verdena", date: "31/05/2025", voto: 3 }, { artist: "Afterhours" }], remove_concerts: ["Calcutta"] });
    const b = valoriDaProposta(prop, MIAMI);
    expect((b.valori as ValoriFestival).concerts.map(c => `${c.artist}:${c.voto ?? "-"}`)).toEqual(["Verdena:4", "Verdena:3", "Afterhours:-"]);
    const indietro = propostaDaValori(b);
    expect(indietro.remove_concerts).toEqual(["Calcutta"]);
    expect(indietro.concerts).toEqual([{ artist: "Verdena", date: "31/05/2025", voto: 3 }, { artist: "Afterhours" }]);
    const a = daProposta(prop, MIAMI);
    const c = daProposta(indietro, MIAMI);
    if (!a.ok || !c.ok || a.azione !== "modifica" || c.azione !== "modifica") throw new Error("non ok");
    expect(applica(MIAMI, c.patch)).toEqual(applica(MIAMI, a.patch));
  });

  it("in un festival i fatti generali non si salvano: un avviso, niente errore", () => {
    const b = valoriDaProposta(p({ id: "e2", voto: 5, name: "MI AMI 2025" }), MIAMI);
    expect(b.ignorati[0]).toMatch(/stanno nei singoli concerti/);
    expect(propostaDaValori(b)).toEqual({ id: "e2", name: "MI AMI 2025" });
  });

  it("validaScheda: la proposta pronta per editedArgs, o gli errori del server", () => {
    const ok = validaScheda(valoriDaProposta(p({ artist: "Verdena", date: "2025-10-18", venue: "Alcatraz", city: "Milano" })));
    expect(ok.ok && ok.proposta).toEqual({ artist: "Verdena", date: "2025-10-18", venue: "Alcatraz", city: "Milano" });
    const ko = validaScheda(valoriDaProposta(p({ artist: "Verdena" })));
    expect(ko.ok ? [] : ko.errori.map(e => e.campo)).toEqual(expect.arrayContaining(["date", "venue", "city"]));
  });
});

describe("problemiScheda", () => {
  const nuovo = (x: Record<string, unknown>) => valoriDaProposta(p({ artist: "Verdena", date: "2025-10-18", venue: "Alcatraz", city: "Milano", ...x }));

  it("completa: niente da sistemare; mancano posizione, canzoni note, partenza e prezzo", () => {
    const r = problemiScheda(nuovo({ voto: 5 }), CTX);
    expect(r.daSistemare).toEqual([]);
    expect(r.mancano).toEqual(["posizione", "canzoni note", "partenza", "prezzo"]);
  });

  it("i campi che mancano, la data non valida, la venue", () => {
    expect(problemiScheda(valoriDaProposta(p({})), CTX).daSistemare.map(x => x.testo)).toEqual(["Manca l'artista.", "Manca la data.", "Manca la venue."]);
    expect(tipi(nuovo({ date: "31/02/20" }))).toEqual(["data_non_valida"]);
    expect(problemiScheda(nuovo({}), { ...CTX, venueNelCatalogo: false }).daSistemare[0].testo).toBe("Scegli la venue: «Alcatraz» (Milano) non è ancora nel catalogo.");
    // venue ancora da verificare: non blocca
    expect(tipi(nuovo({}), { venueNelCatalogo: undefined })).toEqual([]);
  });

  it("persone: esistente, nuova, ambigua, nome e cognome (con l'uscita «Va bene così»)", () => {
    expect(tipi(nuovo({ with: ["lu"] }))).toEqual([]);
    expect(avvisi(nuovo({ with: ["Sara"] }))).toEqual(["persona_nuova"]);
    const ambigua = problemiScheda(nuovo({ with: ["Marco"] }), CTX).daSistemare[0];
    expect(ambigua).toMatchObject({ tipo: "persona_ambigua", opzioni: ["Marco R.", "Marco B."], testo: "«Marco»: intendi «Marco R.» o «Marco B.»?" });
    const completo = problemiScheda(nuovo({ with: ["Giulia Verdi"] }), CTX).daSistemare[0];
    expect(completo).toMatchObject({ tipo: "nome_completo", opzioni: ["Giulia V."], testo: "«Giulia Verdi» è nome e cognome: sulla pagina pubblica usa un soprannome." });
    expect(tipi(nuovo({ with: ["Giulia Verdi"] }), { nomiOk: ["giulia verdi"] })).toEqual([]);
    expect(avvisi(nuovo({ with: ["Giulia Verdi"] }), { nomiOk: ["giulia verdi"] })).toEqual(["persona_nuova"]);
    // il soprannome suggerito prima, poi i nomi simili che ci sono già
    expect(problemiScheda(nuovo({ with: ["Marco Rossi"] }), CTX).daSistemare[0].opzioni).toEqual(["Marco R.", "Marco B."]);
  });

  it("statoNome: per i chip di «Con»", () => {
    expect(statoNome("lu", CTX.persone)).toBe("esistente");
    expect(statoNome("Sara", CTX.persone)).toBe("nuovo");
    expect(statoNome("Marco", CTX.persone)).toBe("problema");
    expect(statoNome("Marco", CTX.persone, ["marco"])).toBe("nuovo");
    expect(statoNome("Marco", undefined)).toBe("attesa");
  });

  it("partenze: nuova, senza indirizzo, e un nome che sembra un indirizzo (blocca)", () => {
    expect(avvisi(nuovo({ from: "Ufficio" }))).toEqual(["partenza_nuova"]);
    expect(avvisi(nuovo({ from: "lavoro" }))).toEqual(["partenza_senza_indirizzo"]);
    expect(avvisi(nuovo({ from: "Casa" }))).toEqual([]);
    expect(tipi(nuovo({ from: "via Roma 3" }))).toEqual(["partenza_indirizzo"]);
  });

  it("\"regalato da\": nuovo (avviso) o nome e cognome (blocca)", () => {
    expect(avvisi(nuovo({ giftFrom: "Zia" }))).toEqual(["regalo_nuovo"]);
    expect(avvisi(nuovo({ giftFrom: "mamma" }))).toEqual([]);
    expect(tipi(nuovo({ giftFrom: "Anna Neri" }))).toEqual(["nome_completo"]);
  });

  it("festival: almeno due concerti, ognuno con l'artista", () => {
    const corto = valoriDaProposta(p({ name: "F", date: "2026-06-20", venue: "Fabrique", city: "Milano", concerts: [{ artist: "A" }] }));
    expect(tipi(corto)).toEqual(["festival_corto"]);
    const b = valoriDaProposta(p({ name: "F", date: "2026-06-20", venue: "Fabrique", city: "Milano", concerts: [{ artist: "A" }, { artist: "B" }] }));
    (b.valori as ValoriFestival).concerts[1].artist = " ";
    expect(tipi(b)).toEqual(["set_senza_artista"]);
  });

  it("modifica: il concerto non c'è più, o nessuna differenza", () => {
    const b = valoriDaProposta(p({ id: "e1", voto: 4 }), VERDENA);
    expect(tipi(b)).toEqual([]);
    expect(tipi(b, { bersaglioSparito: true })).toEqual(["bersaglio_sparito"]);
    expect(tipi(valoriDaProposta(p({ id: "e1", voto: 5 }), VERDENA))).toEqual(["nessuna_differenza"]);
  });

  it("senza una data «mancano» non si sa (null); una venue omonima senza città si sceglie", () => {
    expect(problemiScheda(valoriDaProposta(p({})), CTX).mancano).toBeNull();
    const b = valoriDaProposta(p({ artist: "X", date: "2025-10-18", venue: "Teatro Verdi" }));
    expect(problemiScheda(b, { ...CTX, venueNelCatalogo: false, venueAmbigua: true }).daSistemare).toContainEqual(
      expect.objectContaining({ tipo: "venue_fuori_catalogo", testo: "Scegli la venue: nel catalogo c'è più di un «Teatro Verdi»." }),
    );
  });

  it("avvisi: data futura con un voto, campi ignorati; in programma mancano solo partenza e prezzo", () => {
    const futuro = nuovo({ date: "2026-12-01", voto: 4 });
    expect(avvisi(futuro)).toEqual(["futuro_con_voto"]);
    expect(problemiScheda(futuro, CTX).mancano).toEqual(["partenza", "prezzo"]);
    const festival = valoriDaProposta(p({ name: "F", artist: "X", date: "2026-06-20", venue: "Fabrique", city: "Milano", concerts: [{ artist: "A" }, { artist: "B" }] }));
    expect(avvisi(festival)).toEqual(["ignorato"]);
  });
});

describe("doppioni", () => {
  const nuovo = (x: Record<string, unknown>) => valoriDaProposta(p({ artist: "Verdena", date: "2025-10-18", venue: "Fabrique", city: "Milano", ...x }));
  const ARCHIVIO = [VERDENA, MIAMI];

  it("lo stesso artista lo stesso giorno blocca; un giorno prima o dopo è un avviso", () => {
    expect(doppioni(nuovo({}), ARCHIVIO).map(d => [d.id, d.giorni])).toEqual([["e1", 0]]);
    expect(tipi(nuovo({}), { eventi: ARCHIVIO })).toEqual(["doppione"]);
    expect(problemiScheda(nuovo({}), { ...CTX, eventi: ARCHIVIO }).daSistemare[0].testo).toBe("Hai già Verdena il 18/10/2025 (Alcatraz, Milano).");
    // «È un altro concerto»: non blocca più
    expect(tipi(nuovo({}), { eventi: ARCHIVIO, doppioniOk: ["e1"] })).toEqual([]);
    const dopo = problemiScheda(nuovo({ date: "2025-10-19" }), { ...CTX, eventi: ARCHIVIO });
    expect(dopo.daSistemare).toEqual([]);
    expect(dopo.daControllare.find(a => a.tipo === "doppione_vicino")?.testo).toBe("Hai già Verdena il 18/10/2025, un giorno prima.");
    expect(problemiScheda(nuovo({ date: "2025-10-17" }), { ...CTX, eventi: ARCHIVIO }).daControllare.find(a => a.tipo === "doppione_vicino")?.testo).toBe(
      "Hai già Verdena il 18/10/2025, un giorno dopo.",
    );
    expect(doppioni(nuovo({ date: "2025-10-21" }), ARCHIVIO)).toEqual([]);
    // un'altra persona, o una modifica: niente
    expect(doppioni(nuovo({ artist: "Calcutta" }), ARCHIVIO)).toEqual([]);
    expect(doppioni(valoriDaProposta(p({ id: "e1", voto: 4 }), VERDENA), ARCHIVIO)).toEqual([]);
  });

  it("un concerto di un festival (anche col giorno del suo set) e un festival con lo stesso nome", () => {
    const set = doppioni(nuovo({ date: "2025-05-31" }), ARCHIVIO);
    expect(set).toMatchObject([{ id: "e2", tipo: "festival", festival: "MI AMI", giorni: 0, data: "31/05/2025" }]);
    expect(problemiScheda(nuovo({ date: "2025-05-31" }), { ...CTX, eventi: ARCHIVIO }).daSistemare[0].testo).toBe(
      "Hai già Verdena nel festival «MI AMI» il 31/05/2025 (Magnolia, Segrate).",
    );
    const fest = valoriDaProposta(p({ name: "mi ami", date: "31/05/2025", venue: "Magnolia", city: "Segrate", concerts: [{ artist: "A" }, { artist: "B" }] }));
    expect(doppioni(fest, ARCHIVIO).map(d => [d.id, d.giorni])).toEqual([["e2", 0]]);
    const festDopo = valoriDaProposta(p({ name: "MI AMI", date: "01/06/2025", venue: "Magnolia", city: "Segrate", concerts: [{ artist: "A" }, { artist: "B" }] }));
    expect(doppioni(festDopo, ARCHIVIO).map(d => d.giorni)).toEqual([-1]);
  });

  it("un'altra scheda nuova del run, lo stesso giorno", () => {
    const fratelli = [{ id: "t0", tipo: "concert" as const, titolo: "verdena", data: "18/10/2025" }];
    const d = doppioni(nuovo({ venue: "Alcatraz" }), [], fratelli);
    expect(d).toMatchObject([{ chiave: "scheda:t0", fratello: "t0", giorni: 0 }]);
    expect(problemiScheda(nuovo({}), { ...CTX, eventi: [], fratelli }).daSistemare[0].testo).toBe("Anche un'altra scheda qui sopra è verdena il 18/10/2025.");
    expect(doppioni(nuovo({ date: "2025-10-19" }), [], fratelli)).toEqual([]);
  });

  it("«Aggiorna quello»: la scheda nuova diventa la modifica, con solo le differenze", () => {
    const b = aggiornaQuello(nuovo({ venue: "Alcatraz", with: ["Lu", "Sara"], vicinanza: 6 }), VERDENA as EventoEsterno & { id: string });
    expect(b).toMatchObject({ tipo: "concert", id: "e1" });
    // il voto e il prezzo che c'erano restano (la scheda non li diceva)
    expect(propostaDaValori(b)).toEqual({ id: "e1", with: ["Lu", "Sara"], vicinanza: 6 });
    expect(tipi(b, { eventi: [VERDENA] })).toEqual([]);
    // tipi diversi: niente
    expect(aggiornaQuello(nuovo({}), MIAMI as EventoEsterno & { id: string }).id).toBeUndefined();
  });
});

describe("le mosse della scheda", () => {
  const concerto = () => valoriDaProposta(p({ artist: "Verdena", date: "2026-05-30", venue: "Magnolia", city: "Segrate", with: ["Lu"], voto: 5, cost: 30 }));

  it("«È un festival» e «Fanne un concerto singolo»: andata e ritorno", () => {
    const f = inFestival(concerto());
    expect(f.tipo).toBe("festival");
    const v = f.valori as ValoriFestival;
    expect(v).toMatchObject({ name: "", date: "30/05/2026", venue: "Magnolia", cost: 30 });
    expect(v.concerts).toEqual([{ artist: "Verdena", with: ["Lu"], voto: 5, vicinanza: undefined, canzoniNote: undefined, date: "" }, { artist: "", with: [], date: "" }]);
    expect(tipi(f)).toEqual(["manca", "set_senza_artista"]);
    expect(singoloPossibile(f)).toBe(true);
    const c = inConcerto(f);
    expect(c.tipo).toBe("concert");
    expect(propostaDaValori(c)).toEqual(propostaDaValori(concerto()));
    // un festival su più giorni senza il giorno del set: il primo giorno
    const multi = valoriDaProposta(p({ name: "F", date: "30–31/05/2026", venue: "Magnolia", city: "Segrate", concerts: [{ artist: "A" }] }));
    expect((inConcerto(multi).valori as ValoriConcerto).date).toBe("2026-05-30");
    // con due artisti si perderebbe un concerto
    expect(singoloPossibile(valoriDaProposta(p({ name: "F", concerts: [{ artist: "A" }, { artist: "B" }] })))).toBe(false);
  });

  it("la lineup: aggiungi, togli (mai sotto due), sposta", () => {
    const f = inFestival(concerto()).valori as ValoriFestival;
    const tre = conSetInPiu(f);
    expect(tre.concerts).toHaveLength(3);
    expect(senzaSet(f, 0)).toBe(f);
    expect(senzaSet(tre, 0).concerts.map(c => c.artist)).toEqual(["", ""]);
    const giu = spostaSet({ ...f, concerts: [{ artist: "A", with: [], date: "" }, { artist: "B", with: [], date: "" }] }, 0, 1);
    expect(giu.concerts.map(c => c.artist)).toEqual(["B", "A"]);
    expect(spostaSet(giu, 1, 1)).toBe(giu);
  });

  it("× sul secondo giorno dello stesso artista: si toglie quello, non il primo", () => {
    const b = valoriDaProposta(p({ id: "e2" }), MIAMI);
    const via = { ...b, valori: senzaSet(b.valori as ValoriFestival, 2) };
    const prop = propostaDaValori(via);
    expect(prop.remove_concerts).toEqual(["Verdena"]);
    // il Verdena che resta è nominato (col suo giorno): il server lo riconosce per primo
    expect(prop.concerts).toMatchObject([{ artist: "Verdena" }]);
    const r = daProposta(prop, MIAMI);
    expect(r.ok && r.azione === "modifica" ? r.patch.concerts : null).toMatchObject([{ artist: "Verdena", with: ["Lu"], voto: 4, vicinanza: 5 }, { artist: "Calcutta" }]);
  });

  it("una modifica che toglie un concerto dal festival: blocca finché non si sceglie «Tienilo» o «Toglilo»", () => {
    const b = valoriDaProposta(p({ id: "e2", remove_concerts: ["Calcutta"] }), MIAMI);
    expect(b.rimozioni).toEqual([{ set: { artist: "Calcutta", with: [], voto: undefined, vicinanza: undefined, canzoniNote: undefined, date: "" }, indice: 1 }]);
    const r = problemiScheda(b, CTX).daSistemare;
    expect(r).toMatchObject([{ tipo: "set_rimosso", indice: 0, testo: "Questa modifica toglie Calcutta dal festival." }]);
    // Toglilo: si salva la rimozione
    const via = { ...b, ...toglieSet(b, 0) };
    expect(tipi(via)).toEqual([]);
    expect(propostaDaValori(via)).toEqual({ id: "e2", remove_concerts: ["Calcutta"] });
    // Tienilo: torna dov'era, e non resta niente da cambiare
    const resta = { ...b, ...tieniSet(b, 0) };
    expect((resta.valori as ValoriFestival).concerts.map(c => c.artist)).toEqual(["Verdena", "Calcutta", "Verdena"]);
    expect(tipi(resta)).toEqual(["nessuna_differenza"]);
  });

  it("«Modulo completo»: i campi da segnare, e i valori che tornano con le righe cambiate", () => {
    expect(evidenziaDi(concerto()).sort()).toEqual(["artist", "city", "cost", "date", "venue", "voto", "with"].filter(x => x !== "city").sort());
    const fest = valoriDaProposta(p({ name: "F", date: "2026-06-20", venue: "Fabrique", city: "Milano", concerts: [{ artist: "A", voto: 4 }, { artist: "B" }] }));
    expect(evidenziaDi(fest)).toEqual(expect.arrayContaining(["name", "concerts[0].artist", "concerts[0].voto", "concerts[1].artist"]));
    expect(evidenziaDi(valoriDaProposta(p({ id: "e1", voto: 4 }), VERDENA))).toEqual(["voto"]);
    const b = concerto();
    const r = daModulo(b, { ...(b.valori as ValoriConcerto), artist: "Verdena (acustico)", vicinanza: 6 });
    expect(r.cambiati.sort()).toEqual(["artist", "vicinanza"]);
  });
});

describe("statoScheda", () => {
  const parte = (x: Record<string, unknown> = {}) => ({ id: "t1", name: "propose_concert", state: "approval-requested", approval: { id: "approval_t1" }, ...x });
  const pending = { status: "pending", canResolve: true };

  it("dall'esito dello strumento", () => {
    expect(statoScheda(parte({ output: { ok: true } }), undefined, undefined, { caricando: false })).toBe("salvata");
    expect(statoScheda(parte({ output: { ok: true } }), undefined, { annullata: true }, { caricando: false })).toBe("annullata");
    expect(statoScheda(parte({ output: { ok: true } }), undefined, undefined, { caricando: false, annullataNelRegistro: true })).toBe("annullata");
    expect(statoScheda(parte({ output: { ok: false, errore: { code: "x" } } }), undefined, undefined, { caricando: false })).toBe("non_salvata");
    expect(statoScheda(parte({ output: { motivo: "scartata" } }), undefined, undefined, { caricando: false })).toBe("scartata");
    expect(statoScheda(parte({ output: JSON.stringify({ motivo: "correzione", nota: "x" }) }), undefined, undefined, { caricando: false })).toBe("corretta");
    expect(statoScheda(parte({ output: { ok: false, error: "non eseguito" } }), undefined, undefined, { caricando: false })).toBe("chiusa");
  });

  it("dal run: in arrivo, bozza, pronta, in salvataggio, errore, scaduta", () => {
    expect(statoScheda(parte({ state: "input-streaming", approval: undefined }), undefined, undefined, { caricando: true })).toBe("in_arrivo");
    expect(statoScheda(parte(), undefined, undefined, { caricando: true })).toBe("in_arrivo");
    expect(statoScheda(parte(), pending, undefined, { caricando: false })).toBe("bozza");
    expect(statoScheda(parte(), { status: "staged", canResolve: true }, undefined, { caricando: false })).toBe("pronta");
    expect(statoScheda(parte(), undefined, { inviata: true }, { caricando: true })).toBe("in_salvataggio");
    expect(statoScheda(parte(), undefined, { inviata: true }, { caricando: false })).toBe("scaduta");
    expect(statoScheda(parte(), { status: "error", canResolve: true }, { inviata: true }, { caricando: false })).toBe("errore_ripresa");
    expect(statoScheda(parte(), undefined, { inviata: true }, { caricando: false, erroreRipresa: true })).toBe("errore_ripresa");
    expect(statoScheda(parte(), undefined, undefined, { caricando: false })).toBe("scaduta");
  });

  it("Scarta e una correzione già partite si vedono subito", () => {
    expect(statoScheda(parte(), undefined, { notaInviata: "voto 3" }, { caricando: true })).toBe("corretta");
    expect(statoScheda(parte(), undefined, { scartata: true }, { caricando: true })).toBe("scartata");
    expect(statoScheda(parte(), { status: "staged", canResolve: true }, { scartata: true }, { caricando: false })).toBe("pronta");
  });
});

describe("date leggibili", () => {
  it("giorno della settimana e distanza da oggi", () => {
    expect(giornoLungo("2026-10-17")).toBe("sab 17 ott 2026");
    expect(giornoLungo("17/10/2026")).toBe("sab 17 ott 2026");
    expect(giornoLungo("30–31/05/2026")).toBe("30–31/05/2026");
    expect(giornoLungo("boh")).toBe("");
    expect(distanza("2026-10-21", OGGI)).toBe("oggi");
    expect(distanza("2026-10-20", OGGI)).toBe("ieri");
    expect(distanza("2026-10-15", OGGI)).toBe("6 giorni fa");
    expect(distanza("2026-11-02", OGGI)).toBe("tra 12 giorni");
    expect(distanza("2026-07-21", OGGI)).toBe("3 mesi fa");
    expect(distanza("2024-10-01", OGGI)).toBe("2 anni fa");
  });
});
