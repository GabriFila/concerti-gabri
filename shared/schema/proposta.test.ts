/* La scheda dell'Oracolo (propose_concert), parte pura: proposta → input
   o patch dello schema unico, lineup dei festival unita per artista,
   anteprima e differenze in italiano, risultato per il modello, e lo
   schema per Gemini piatto e statico. */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { todayKey } from "../lib/dates.ts";
import { entryInput } from "./entry.ts";
import {
  applica, daProposta, differenze, esitoDa, nomiDa, propostaConcertoInput, rifiutoProposta, type EventoEsterno, type PropostaConcerto,
} from "./proposta.ts";

const OGGI = todayKey(Date.parse("2026-10-21T12:00:00+02:00"));
const p = (x: Record<string, unknown>): PropostaConcerto => propostaConcertoInput.parse(x);
const nuovo = (x: Record<string, unknown>) => {
  const r = daProposta(p(x));
  if (!r.ok || r.azione !== "aggiungi") throw new Error(JSON.stringify(r));
  return r;
};
const modifica = (x: Record<string, unknown>, e: EventoEsterno) => {
  const r = daProposta(p(x), e);
  if (!r.ok || r.azione !== "modifica") throw new Error(JSON.stringify(r));
  return r;
};
const campiErrati = (r: ReturnType<typeof daProposta>) => (r.ok ? [] : r.errori.map(e => e.campo));

const LUOGO = { date: "2025-10-18", venue: "Alcatraz", city: "Milano" };

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

describe("lo schema per il modello", () => {
  it("piatto per Gemini: niente anyOf, oneOf, const né null; tutto facoltativo", () => {
    for (const io of ["input", "output"] as const) {
      const json = JSON.stringify(z.toJSONSchema(propostaConcertoInput, { io }));
      expect(json).not.toMatch(/"(anyOf|oneOf|allOf|const)"/);
      expect(json).not.toContain("\"null\"");
      expect((z.toJSONSchema(propostaConcertoInput, { io }) as { required?: string[] }).required ?? []).toEqual([]);
    }
  });

  it("valida già le scale: un voto 7 o una posizione 0 non passano", () => {
    expect(propostaConcertoInput.safeParse({ voto: 7 }).success).toBe(false);
    expect(propostaConcertoInput.safeParse({ vicinanza: 0 }).success).toBe(false);
    expect(propostaConcertoInput.safeParse({ canzoniNote: "6" }).success).toBe(false);
    expect(propostaConcertoInput.safeParse({}).success).toBe(true);
  });

  it("il rifiuto: motivo scartata o correzione, nota e bozza facoltative, nient'altro", () => {
    expect(rifiutoProposta.safeParse({ motivo: "scartata" }).success).toBe(true);
    expect(rifiutoProposta.safeParse({ motivo: "correzione", nota: "era venerdì", bozza: { artist: "X", voto: 3 } }).success).toBe(true);
    expect(rifiutoProposta.safeParse({ motivo: "boh" }).success).toBe(false);
    expect(rifiutoProposta.safeParse({ motivo: "scartata", extra: 1 }).success).toBe(false);
    expect(rifiutoProposta.safeParse({ motivo: "correzione", nota: "x".repeat(4001) }).success).toBe(false);
    expect(rifiutoProposta.safeParse({ motivo: "correzione", bozza: { voto: 9 } }).success).toBe(false);
  });
});

describe("daProposta: un evento nuovo", () => {
  it("vuota: gli errori dicono cosa manca, per campo", () => {
    const r = daProposta(p({}));
    expect(r.ok).toBe(false);
    expect(campiErrati(r)).toEqual(expect.arrayContaining(["artist", "date", "venue", "city"]));
    if (!r.ok) expect(r.errori.find(e => e.campo === "date")?.messaggio).toBe("obbligatorio");
  });

  it("un concerto: canzoni note in numero (na resta), prezzo dimenticato, \"regalato da\" = regalo, date ISO", () => {
    const r = nuovo({ ...LUOGO, artist: "Verdena", with: ["Marco R."], voto: 5, canzoniNote: "3", costForgotten: true, giftFrom: "Mamma", from: "Casa" });
    expect(r.input).toEqual({
      kind: "concert", date: "18/10/2025", venue: "Alcatraz", city: "Milano", artist: "Verdena", with: ["Marco R."], voto: 5, canzoniNote: 3,
      cost: "na", gift: true, giftFrom: "Mamma", from: "Casa",
    });
    expect(nuovo({ ...LUOGO, artist: "X", canzoniNote: "na" }).input).toMatchObject({ canzoniNote: "na", with: [] });
    // un prezzo detto vince su "dimenticato"; remove e remove_concerts non valgono per un evento nuovo
    expect(nuovo({ ...LUOGO, artist: "X", cost: 30, costForgotten: true, remove: ["voto"] }).input).toMatchObject({ cost: 30 });
    // i compagni senza doppioni
    expect(nuovo({ ...LUOGO, artist: "X", with: ["Lu", "lu", "Sara"] }).input).toMatchObject({ with: ["Lu", "Sara"] });
  });

  it("un festival: compagni generali nei set senza i loro, voto generale ignorato", () => {
    const r = nuovo({ ...LUOGO, date: "30–31/05/2026", name: "MI AMI", voto: 5, with: ["Lu"], concerts: [{ artist: "Verdena", voto: 4 }, { artist: "Calcutta", with: ["Sara"], date: "2026-05-31" }] });
    expect(r.ignorati).toEqual(["voto"]);
    expect(r.input).toMatchObject({
      kind: "festival", name: "MI AMI",
      concerts: [{ artist: "Verdena", with: ["Lu"], voto: 4 }, { artist: "Calcutta", with: ["Sara"], date: "31/05/2026" }],
    });
    expect(r.input).not.toHaveProperty("voto");
  });

  it("un festival di un solo concerto non esiste", () => {
    const r = daProposta(p({ ...LUOGO, name: "MI AMI", concerts: [{ artist: "Verdena" }] }));
    expect(r).toEqual({ ok: false, errori: [{ campo: "concerts", messaggio: "un festival ha almeno due concerti" }] });
    expect(campiErrati(daProposta(p({ ...LUOGO, name: "MI AMI" })))).toEqual(["concerts"]);
  });

  it("l'input passa sempre dallo schema unico (entryInput)", () => {
    for (const x of [
      { ...LUOGO, artist: "X" },
      { ...LUOGO, artist: "X", gift: true, accredito: false, comments: "bello" },
      { ...LUOGO, name: "F", concerts: [{ artist: "A" }, { artist: "B", vicinanza: 6 }] },
    ]) {
      expect(entryInput.safeParse(nuovo(x).input).success).toBe(true);
    }
  });

  it("date sbagliate e testi troppo lunghi: errori senza ripetere i valori", () => {
    const r = daProposta(p({ ...LUOGO, date: "Via dei Canarini 7", artist: "X" }));
    expect(r).toEqual({ ok: false, errori: [{ campo: "date", messaggio: "data non valida" }] });
    expect(JSON.stringify(r)).not.toContain("Canarini");
    expect(daProposta(p({ ...LUOGO, date: "2025-13-40", artist: "X" }))).toMatchObject({ ok: false, errori: [{ campo: "date" }] });
  });

  it("i nomi da creare: persone (anche dei set), \"regalato da\" e partenza", () => {
    expect(nomiDa(nuovo({ ...LUOGO, artist: "X", with: ["Lu"], giftFrom: "Mamma", from: "Ufficio" }))).toEqual({ persone: ["Lu"], regalo: "Mamma", partenza: "Ufficio" });
    expect(nomiDa(nuovo({ ...LUOGO, name: "F", concerts: [{ artist: "A", with: ["Lu"] }, { artist: "B", with: ["Sara", "Lu"] }] }))).toEqual({ persone: ["Lu", "Sara", "Lu"] });
  });
});

describe("daProposta: una modifica", () => {
  it("solo i campi detti; remove toglie (null, i compagni diventano [])", () => {
    expect(modifica({ id: "e1", voto: 4 }, VERDENA).patch).toEqual({ voto: 4 });
    expect(modifica({ id: "e1", remove: ["voto", "with", "cost", "from", "comments"] }, VERDENA).patch).toEqual({ voto: null, with: [], cost: null, from: null, comments: null });
    // un valore detto vince su remove
    expect(modifica({ id: "e1", voto: 3, remove: ["voto"] }, VERDENA).patch).toEqual({ voto: 3 });
    expect(modifica({ id: "e1", date: "2025-10-17", canzoniNote: "5", with: ["Lu", "Marco R."] }, VERDENA).patch).toEqual({ date: "17/10/2025", canzoniNote: 5, with: ["Lu", "Marco R."] });
    // il regalo: "regalato da" lo implica, toglierlo toglie anche chi
    expect(modifica({ id: "e1", giftFrom: "Mamma" }, VERDENA).patch).toEqual({ gift: true, giftFrom: "Mamma" });
    expect(modifica({ id: "e1", gift: false }, VERDENA).patch).toEqual({ gift: null, giftFrom: null });
    expect(modifica({ id: "e1", costForgotten: true }, VERDENA).patch).toEqual({ cost: "na" });
  });

  it("senza l'evento attuale, o con nome e lineup su un concerto: errore", () => {
    expect(daProposta(p({ id: "e1", voto: 4 }))).toEqual({ ok: false, errori: [{ campo: "id", messaggio: "concerto non trovato" }] });
    expect(campiErrati(daProposta(p({ id: "e1", name: "X" }), VERDENA))).toEqual(["name"]);
  });

  it("in un festival artista, compagni e voti stanno nei singoli concerti", () => {
    for (const x of [{ voto: 4 }, { with: ["Lu"] }, { artist: "X" }, { remove: ["voto"] }]) {
      const r = daProposta(p({ id: "e2", ...x }), MIAMI);
      expect(r.ok, JSON.stringify(x)).toBe(false);
      if (!r.ok) expect(r.errori[0].messaggio).toBe("in un festival artista, compagni e voti stanno nei singoli concerti");
    }
  });

  it("la lineup si unisce per artista (e giorno): i campi non detti restano, i nuovi si accodano", () => {
    const r = modifica({ id: "e2", concerts: [{ artist: "calcutta", voto: 5 }, { artist: "Afterhours", with: ["Sara"] }] }, MIAMI);
    expect(r.patch.concerts).toEqual([
      { artist: "Verdena", with: ["Lu"], voto: 4, vicinanza: 5, date: "30/05/2025" },
      { artist: "Calcutta", with: [], voto: 5 },
      { artist: "Verdena", with: [], date: "31/05/2025" },
      { artist: "Afterhours", with: ["Sara"] },
    ]);
  });

  it("due set dello stesso artista: li distingue il giorno; remove del set toglie i suoi campi", () => {
    const r = modifica({ id: "e2", concerts: [{ artist: "Verdena", date: "2025-05-31", voto: 3 }, { artist: "Verdena", date: "30/05/2025", remove: ["vicinanza", "with"] }] }, MIAMI);
    expect(r.patch.concerts).toEqual([
      { artist: "Verdena", with: [], voto: 4, date: "30/05/2025" },
      { artist: "Calcutta", with: [] },
      { artist: "Verdena", with: [], voto: 3, date: "31/05/2025" },
    ]);
    // senza giorno vale il primo non ancora preso
    expect(modifica({ id: "e2", concerts: [{ artist: "Verdena", voto: 1 }, { artist: "Verdena", voto: 2 }] }, MIAMI).patch.concerts).toMatchObject([{ voto: 1 }, {}, { voto: 2 }]);
  });

  it("remove_concerts con lo stesso artista in due giorni: toglie quello non nominato in concerts", () => {
    // la scheda toglie il Verdena del 31: nomina quello del 30 (che resta) e toglie «Verdena»
    const r = modifica({ id: "e2", concerts: [{ artist: "Verdena", date: "30/05/2025" }], remove_concerts: ["Verdena"] }, MIAMI);
    expect(r.patch.concerts).toEqual([
      { artist: "Verdena", with: ["Lu"], voto: 4, vicinanza: 5, date: "30/05/2025" },
      { artist: "Calcutta", with: [] },
    ]);
    // senza nominarne uno, il primo (come prima)
    expect(modifica({ id: "e2", remove_concerts: ["Verdena"] }, MIAMI).patch.concerts).toMatchObject([{ artist: "Calcutta" }, { artist: "Verdena", date: "31/05/2025" }]);
  });

  it("remove_concerts toglie dalla lineup; meno di due concerti è un errore", () => {
    expect(modifica({ id: "e2", remove_concerts: ["Calcutta"] }, MIAMI).patch.concerts?.map(c => c.artist)).toEqual(["Verdena", "Verdena"]);
    expect(daProposta(p({ id: "e2", remove_concerts: ["Calcutta", "Verdena"] }), MIAMI)).toEqual({ ok: false, errori: [{ campo: "concerts", messaggio: "un festival ha almeno due concerti" }] });
    expect(campiErrati(daProposta(p({ id: "e2", remove_concerts: ["Nessuno"] }), MIAMI))).toEqual(["remove_concerts.0"]);
  });
});

describe("anteprima e differenze", () => {
  it("le etichette e i valori della scheda: stelle, posizione, prezzo, «tolto»", () => {
    const { patch } = modifica({ id: "e1", voto: 4, vicinanza: 6, canzoniNote: "4", with: ["Lu", "Marco R."], remove: ["cost", "from"] }, VERDENA);
    const dopo = applica(VERDENA, patch);
    expect(dopo).toMatchObject({ voto: 4, vicinanza: 6, canzoniNote: 4, with: ["Lu", "Marco R."] });
    // la partenza cambia: i km si sanno solo al salvataggio
    expect(dopo).not.toHaveProperty("km");
    expect(VERDENA.km).toBe(212);
    expect(differenze(VERDENA, dopo)).toEqual([
      { campo: "Con", prima: "Lu", dopo: "Lu, Marco R." },
      { campo: "Voto", prima: "★★★★★ 5", dopo: "★★★★ 4" },
      { campo: "Posizione", prima: "—", dopo: "6 · Transenna" },
      { campo: "Canzoni note", prima: "—", dopo: "4 · Molte" },
      { campo: "Biglietto", prima: "35 €", dopo: "tolto" },
      { campo: "Partenza", prima: "Casa", dopo: "tolto" },
    ]);
    expect(differenze(VERDENA, VERDENA)).toEqual([]);
  });

  it("la lineup: + aggiunto, − tolto, «Artista: campo prima → dopo»", () => {
    const { patch } = modifica({ id: "e2", concerts: [{ artist: "Calcutta", voto: 5 }, { artist: "Afterhours" }], remove_concerts: ["Verdena"] }, MIAMI);
    expect(differenze(MIAMI, applica(MIAMI, patch)).map(d => d.dopo)).toEqual(["Calcutta: voto — → ★★★★★ 5", "+ Afterhours", "− Verdena"]);
    expect(differenze(MIAMI, applica(MIAMI, patch)).every(d => d.campo === "Concerti")).toBe(true);
  });
});

describe("esitoDa", () => {
  const dopo: EventoEsterno = { ...VERDENA, voto: 4, kmPending: true, km: undefined, from: "Ufficio", cost: undefined, comments: "che serata" };
  it("titolo, data, luogo, cosa è cambiato (il commento solo «modificato»), cosa manca, km in attesa con il fix", () => {
    const e = esitoDa({ azione: "modificato", id: "e1", activityId: "a1", prima: VERDENA, dopo, creati: { persone: [], partenza: "Ufficio" } }, { today: OGGI, handle: "lu" });
    expect(e).toEqual({
      ok: true, azione: "modificato", tipo: "concert", id: "e1", activityId: "a1", titolo: "Verdena", data: "18/10/2025", luogo: "Alcatraz, Milano",
      cambiati: [
        { campo: "Voto", prima: "★★★★★ 5", dopo: "★★★★ 4" },
        { campo: "Biglietto", prima: "35 €", dopo: "tolto" },
        { campo: "Partenza", prima: "Casa", dopo: "Ufficio" },
        { campo: "Commento", prima: "", dopo: "modificato" },
      ],
      creati: { persone: [], partenza: "Ufficio" },
      mancano: ["posizione", "canzoni note", "prezzo"],
      partenza: "Ufficio", kmInAttesa: true, fix: "/lu/modifica#partenze",
    });
  });

  it("un'aggiunta con i km: niente cambiati né fix", () => {
    const e = esitoDa({ azione: "aggiunto", id: "e1", activityId: "a1", dopo: VERDENA, creati: { persone: ["Lu"] } }, { today: OGGI, handle: "lu" });
    expect(e).toMatchObject({ azione: "aggiunto", km: 212, partenza: "Casa", creati: { persone: ["Lu"] }, mancano: ["posizione", "canzoni note"] });
    expect(e).not.toHaveProperty("cambiati");
    expect(e).not.toHaveProperty("fix");
    expect(e).not.toHaveProperty("kmInAttesa");
  });
});
