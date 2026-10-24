/* ──────────────────────────────────────────────────────────────
   La scheda dell'Oracolo nel browser (spec ux-agente §9), la parte pura:
   la proposta del modello (propose_concert) diventa una bozza modificabile
   con gli STESSI valori del form dei concerti (ValoriConcerto,
   ValoriFestival di forme.ts), e la bozza torna proposta al Salva.

   - `valoriDaProposta`: proposta → bozza. Nuovo: i valori vuoti con
     sopra la proposta; modifica: i valori del concerto attuale (la forma
     esterna di entries.get) con sopra i campi detti, la lineup di un
     festival unita per artista e giorno come fa il server.
   - `propostaDaValori`: bozza → proposta. Nuovo: tutto; modifica: solo i
     campi diversi, più `remove`, i concerti cambiati o aggiunti e
     `remove_concerts`. Prima di risolvere l'approvazione la scheda la
     valida con lo stesso Zod e lo stesso `daProposta` del server
     (`validaScheda`): il client di TanStack AI non valida le risposte.
   - `problemiScheda`: Da sistemare (blocca il Salva), Da controllare
     (avvisi) e Mancano (facoltativi), in italiano. Mai solo colore.
     Anche i doppioni (`doppioni`: lo stesso artista lo stesso giorno, in
     archivio o in un'altra scheda del run, blocca; un giorno prima o dopo
     è un avviso) e i concerti che una modifica toglie dal festival.
   - Le mosse della scheda: «È un festival» / «Fanne un concerto singolo»
     (`inFestival`, `inConcerto`), «Aggiorna quello» (`aggiornaQuello`: la
     scheda nuova diventa la modifica del doppione), la lineup (aggiungi,
     togli, sposta), «Tienilo» / «Toglilo», e il «Modulo completo»
     (`evidenziaDi`, `daModulo`).
   - `statoScheda`: in che stato è la scheda, dall'output dello
     strumento, dall'interruzione del run e dallo store (§9.4).
   Niente React, niente Convex: testato in bozza.test.ts.
   ────────────────────────────────────────────────────────────── */

import { sortKey } from "../../../shared/lib/dates.ts";
import { mancanoDi } from "../../../shared/lib/mancano.ts";
import { chiaveNome, sembraIndirizzo, sembraNomeCompleto, simili, soprannomeSuggerito } from "../../../shared/lib/nomi.ts";
import { isoInGiorno } from "../../../shared/schema/campi.ts";
import {
  CAMPI_RIMOVIBILI, CAMPI_RIMOVIBILI_CONCERTO, daProposta, differenze, propostaConcertoInput,
  type Differenza, type ErroreProposta, type EventoEsterno, type PropostaConcerto, type SetEsterno,
} from "../../../shared/schema/proposta.ts";
import { daConcertoAFestival, daFestivalAConcerto, inIso, type ValoriConcerto, type ValoriFestival, type ValoriSet } from "../sezioni/forme.ts";

/* ── tipi ─────────────────────────────────────────────────────── */

export type TipoScheda = "concert" | "festival";
export type Valori = ValoriConcerto | ValoriFestival;

/** Una scheda aperta: i valori, e per una modifica l'id e il concerto com'è adesso. */
export interface Bozza {
  tipo: TipoScheda;
  valori: Valori;
  id?: string;
  esistente?: EventoEsterno;
  /** Cosa della proposta non si può usare, già in italiano (avvisi). */
  ignorati: string[];
  /** I concerti che la proposta toglie dal festival (remove_concerts): si confermano uno per uno. */
  rimozioni?: SetTolto[];
}

/** Un concerto del festival tolto dalla proposta, con dov'era (per «Tienilo»). */
export interface SetTolto {
  set: ValoriSet;
  indice: number;
}

/** Le righe della scheda: una per campo (il biglietto comprende prezzo, regalo e accredito). */
export type CampoScheda =
  | "artist" | "name" | "date" | "venue" | "with" | "voto" | "vicinanza" | "canzoniNote" | "biglietto" | "from" | "comments" | "concerts";

export const ETICHETTE: Record<CampoScheda, string> = {
  artist: "Artista",
  name: "Festival",
  date: "Data",
  venue: "Venue",
  with: "Con",
  voto: "Voto",
  vicinanza: "Posizione",
  canzoniNote: "Canzoni note",
  biglietto: "Biglietto",
  from: "Partenza",
  comments: "Commento",
  concerts: "Concerti",
};

/** La riga di una differenza (`differenze` di shared/schema/proposta.ts). */
export const CAMPO_DI_DIFFERENZA: Record<string, CampoScheda> = {
  Artista: "artist",
  Festival: "name",
  Data: "date",
  Venue: "venue",
  Con: "with",
  Voto: "voto",
  Posizione: "vicinanza",
  "Canzoni note": "canzoniNote",
  Biglietto: "biglietto",
  "Regalato da": "biglietto",
  Partenza: "from",
  Commento: "comments",
  Concerti: "concerts",
};

/** La riga di una voce di «Mancano» («voto (2 concerti)» è della lineup). */
export function campoDiMancante(m: string): CampoScheda {
  if (/\(\d+ concert/.test(m)) return "concerts";
  if (m.startsWith("voto")) return "voto";
  if (m.startsWith("posizione")) return "vicinanza";
  if (m.startsWith("canzoni")) return "canzoniNote";
  if (m.startsWith("partenza")) return "from";
  return "biglietto";
}

/* ── valori ↔ forma esterna ───────────────────────────────────── */

type Canzoni = ValoriConcerto["canzoniNote"];

/** Il giorno di un concerto come lo vuole <input type="date">: ISO; altrimenti il testo com'è (lo segnala la validazione). */
export function giornoIso(s: string): string {
  const t = s.trim();
  if (!t) return "";
  return inIso(isoInGiorno(t)) || t;
}

const testo = (s: string | undefined) => (s && s.trim() ? s.trim() : undefined);
const senzaVuoti = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as T;
/** I nomi senza doppioni per chiave («Lu» e «lu» sono la stessa persona). */
const unici = (nomi: readonly string[]) =>
  nomi.map(n => n.trim()).filter((n, i, a) => n && a.findIndex(x => chiaveNome(x) === chiaveNome(n)) === i);
const canzoni = (v: string | undefined): Canzoni => (v === undefined ? undefined : v === "na" ? "na" : (Number(v) as Canzoni));

export function valoriVuoti(tipo: "concert"): ValoriConcerto;
export function valoriVuoti(tipo: "festival"): ValoriFestival;
export function valoriVuoti(tipo: TipoScheda): Valori;
export function valoriVuoti(tipo: TipoScheda): Valori {
  const evento = { date: "", venue: "", city: "", cost: undefined, gift: false, giftFrom: "", accredito: false, from: "", comments: "" };
  return tipo === "concert" ? { ...evento, artist: "", with: [] } : { ...evento, name: "", concerts: [] };
}

const setDaEsterno = (c: SetEsterno): ValoriSet => ({
  artist: c.artist,
  with: [...(c.with ?? [])],
  voto: c.voto as ValoriSet["voto"],
  vicinanza: c.vicinanza as ValoriSet["vicinanza"],
  canzoniNote: c.canzoniNote as Canzoni,
  date: c.date ? giornoIso(c.date) : "",
});

/** I valori della scheda dalla forma esterna di un concerto o festival (entries.get). */
export function valoriDaEsterno(e: EventoEsterno): Valori {
  const evento = {
    venue: e.venue,
    city: e.city,
    cost: e.cost,
    gift: !!e.gift,
    giftFrom: e.giftFrom ?? "",
    accredito: !!e.accredito,
    from: e.from ?? "",
    comments: e.comments ?? "",
  };
  if (e.kind === "festival") return { ...evento, date: e.date, name: e.name ?? "", concerts: (e.concerts ?? []).map(setDaEsterno) };
  return {
    ...evento,
    date: giornoIso(e.date),
    artist: e.artist ?? "",
    with: [...(e.with ?? [])],
    voto: e.voto as ValoriConcerto["voto"],
    vicinanza: e.vicinanza as ValoriConcerto["vicinanza"],
    canzoniNote: e.canzoniNote as Canzoni,
  };
}

/** La forma esterna dei valori (per Mancano, le differenze e i doppioni): date "gg/mm/aaaa", campi vuoti tolti. */
export function esternoDaValori(tipo: TipoScheda, v: Valori): EventoEsterno {
  const evento = senzaVuoti({
    date: isoInGiorno(v.date),
    venue: v.venue.trim(),
    city: v.city.trim(),
    cost: v.cost,
    gift: v.gift || undefined,
    giftFrom: v.gift ? testo(v.giftFrom) : undefined,
    accredito: v.accredito || undefined,
    from: testo(v.from),
    comments: v.comments.trim() ? v.comments : undefined,
  });
  if (tipo === "festival") {
    const f = v as ValoriFestival;
    return {
      kind: "festival",
      ...evento,
      name: f.name.trim(),
      concerts: f.concerts.map(c =>
        senzaVuoti({ artist: c.artist.trim(), with: unici(c.with), voto: c.voto, vicinanza: c.vicinanza, canzoniNote: c.canzoniNote, date: c.date ? isoInGiorno(c.date) : undefined }),
      ),
    };
  }
  const c = v as ValoriConcerto;
  return senzaVuoti({ kind: "concert" as const, ...evento, artist: c.artist.trim(), with: unici(c.with), voto: c.voto, vicinanza: c.vicinanza, canzoniNote: c.canzoniNote });
}

/* ── proposta → bozza ─────────────────────────────────────────── */

type ConcertoDiProposta = NonNullable<PropostaConcerto["concerts"]>[number];

const stessoGiorno = (a?: string, b?: string) => !a || !b || isoInGiorno(a) === isoInGiorno(b);

/** I fatti detti di un concerto (singolo o del festival), con `remove` per toglierli. */
function fatti(s: { voto?: number; vicinanza?: number; canzoniNote?: Canzoni }, p: Pick<ConcertoDiProposta, "voto" | "vicinanza" | "canzoniNote">, togli: ReadonlySet<string>) {
  const cn = canzoni(p.canzoniNote);
  if (p.voto !== undefined) s.voto = p.voto;
  else if (togli.has("voto")) s.voto = undefined;
  if (p.vicinanza !== undefined) s.vicinanza = p.vicinanza;
  else if (togli.has("vicinanza")) s.vicinanza = undefined;
  if (cn !== undefined) s.canzoniNote = cn;
  else if (togli.has("canzoniNote")) s.canzoniNote = undefined;
}

const setNuovo = (c: ConcertoDiProposta, conGenerale?: string[]): ValoriSet => {
  const s: ValoriSet = { artist: c.artist.trim(), with: unici(c.with ?? conGenerale ?? []), date: c.date ? giornoIso(c.date) : "" };
  fatti(s, c, new Set());
  return s;
};

/** La lineup di una modifica: i concerti della proposta uniti a quelli che ci sono, per artista e giorno (come daProposta). */
function unisciLineup(sets: ValoriSet[], p: PropostaConcerto, ignorati: string[], tolti: SetTolto[]): ValoriSet[] {
  const lineup = sets.map(s => ({ s: { ...s, with: [...s.with] }, preso: false }));
  for (const c of p.concerts ?? []) {
    const k = chiaveNome(c.artist);
    const x = lineup.find(l => !l.preso && chiaveNome(l.s.artist) === k && stessoGiorno(l.s.date, c.date));
    if (!x) {
      lineup.push({ s: setNuovo(c), preso: true });
      continue;
    }
    x.preso = true;
    const togli = new Set<string>(c.remove ?? []);
    if (c.with !== undefined) x.s.with = unici(c.with);
    else if (togli.has("with")) x.s.with = [];
    fatti(x.s, c, togli);
    if (c.date !== undefined) x.s.date = giornoIso(c.date);
    else if (togli.has("date")) x.s.date = "";
  }
  for (const nome of p.remove_concerts ?? []) {
    const i = lineup.findIndex(l => chiaveNome(l.s.artist) === chiaveNome(nome));
    if (i === -1) ignorati.push(`«${nome.trim()}» non è nella lineup: non si toglie niente.`);
    else tolti.push({ set: lineup.splice(i, 1)[0].s, indice: i });
  }
  return lineup.map(l => l.s);
}

/**
 * La bozza di una proposta: per un evento nuovo i valori vuoti con sopra
 * la proposta (festival se ha `name` o `concerts`); per una modifica i
 * valori di `esistente` con sopra i campi detti e `remove`.
 */
export function valoriDaProposta(p: PropostaConcerto, esistente?: EventoEsterno): Bozza {
  const nuovo = !p.id || !esistente;
  const tipo: TipoScheda = nuovo ? (p.name !== undefined || p.concerts !== undefined ? "festival" : "concert") : esistente.kind;
  const v: Valori = nuovo ? valoriVuoti(tipo) : valoriDaEsterno(esistente);
  const togli = new Set<string>(nuovo ? [] : (p.remove ?? []));
  const ignorati: string[] = [];
  const tolti: SetTolto[] = [];

  if (p.date !== undefined) v.date = tipo === "concert" ? giornoIso(p.date) : isoInGiorno(p.date);
  if (p.venue !== undefined) v.venue = p.venue.trim();
  if (p.city !== undefined) v.city = p.city.trim();

  if (tipo === "concert") {
    const c = v as ValoriConcerto;
    if (p.artist !== undefined) c.artist = p.artist.trim();
    if (p.with !== undefined) c.with = unici(p.with);
    else if (togli.has("with")) c.with = [];
    fatti(c, p, togli);
    if (p.name !== undefined || p.concerts !== undefined || p.remove_concerts !== undefined) {
      ignorati.push("Nome del festival e lineup valgono solo per i festival: non si usano.");
    }
  } else {
    const f = v as ValoriFestival;
    if (p.name !== undefined) f.name = p.name.trim();
    if (nuovo) {
      f.concerts = (p.concerts ?? []).map(c => setNuovo(c, p.with));
      if (p.voto !== undefined || p.vicinanza !== undefined || p.canzoniNote !== undefined) ignorati.push("Voto generale ignorato: in un festival si vota ogni concerto.");
      if (p.artist !== undefined) ignorati.push("Artista generale ignorato: in un festival ogni concerto ha il suo.");
    } else {
      if (p.concerts !== undefined || p.remove_concerts !== undefined) f.concerts = unisciLineup(f.concerts, p, ignorati, tolti);
      const soloConcerto = ["artist", "with", "voto", "vicinanza", "canzoniNote"] as const;
      if (soloConcerto.some(k => p[k] !== undefined || togli.has(k))) {
        ignorati.push("In un festival artista, compagni e voti stanno nei singoli concerti: quelli generali non si salvano.");
      }
    }
  }

  // biglietto: "regalato da" vuol dire regalo; togliere il regalo toglie anche chi l'ha fatto
  const prezzo = p.cost ?? (p.costForgotten ? ("na" as const) : undefined);
  if (prezzo !== undefined) v.cost = prezzo;
  else if (togli.has("cost")) v.cost = undefined;
  if (p.giftFrom !== undefined) Object.assign(v, { gift: true, giftFrom: p.giftFrom.trim() });
  else if (p.gift === true) v.gift = true;
  else if (p.gift === false || togli.has("gift")) Object.assign(v, { gift: false, giftFrom: "" });
  else if (togli.has("giftFrom")) v.giftFrom = "";
  if (p.accredito !== undefined) v.accredito = p.accredito;
  else if (togli.has("accredito")) v.accredito = false;
  if (p.from !== undefined) v.from = p.from.trim();
  else if (togli.has("from")) v.from = "";
  if (p.comments !== undefined) v.comments = p.comments;
  else if (togli.has("comments")) v.comments = "";

  return { tipo, valori: v, ...(nuovo ? {} : { id: p.id, esistente }), ignorati, ...(tolti.length ? { rimozioni: tolti } : {}) };
}

/* ── bozza → proposta ─────────────────────────────────────────── */

const cnProposta = (v: number | "na" | undefined) => (v === undefined ? undefined : (String(v) as NonNullable<PropostaConcerto["canzoniNote"]>));
const stessiNomi = (a: readonly string[] = [], b: readonly string[] = []) => a.length === b.length && a.every((x, i) => x === b[i]);

function propostaNuova(tipo: TipoScheda, v: Valori): PropostaConcerto {
  const biglietto = {
    cost: typeof v.cost === "number" ? v.cost : undefined,
    costForgotten: v.cost === "na" ? true : undefined,
    gift: v.gift || undefined,
    giftFrom: v.gift ? testo(v.giftFrom) : undefined,
    accredito: v.accredito || undefined,
  };
  const comune = { date: testo(v.date), venue: testo(v.venue), city: testo(v.city), ...biglietto, from: testo(v.from), comments: v.comments.trim() ? v.comments : undefined };
  if (tipo === "festival") {
    const f = v as ValoriFestival;
    return senzaVuoti({
      name: testo(f.name),
      ...comune,
      concerts: f.concerts.map(c =>
        senzaVuoti({
          artist: c.artist.trim(),
          date: testo(c.date),
          with: c.with.length ? unici(c.with) : undefined,
          voto: c.voto,
          vicinanza: c.vicinanza,
          canzoniNote: cnProposta(c.canzoniNote),
        }),
      ),
    });
  }
  const c = v as ValoriConcerto;
  return senzaVuoti({
    artist: testo(c.artist),
    ...comune,
    with: c.with.length ? unici(c.with) : undefined,
    voto: c.voto,
    vicinanza: c.vicinanza,
    canzoniNote: cnProposta(c.canzoniNote),
  });
}

type Rimovibile = (typeof CAMPI_RIMOVIBILI)[number];
type RimovibileConcerto = (typeof CAMPI_RIMOVIBILI_CONCERTO)[number];

/**
 * La lineup come proposta di modifica: i concerti cambiati o aggiunti, e
 * quelli tolti. remove_concerts dice solo l'artista: se lo stesso artista
 * resta in un altro giorno, quello che resta va anche in `concerts` (col
 * suo giorno), così il server lo riconosce per primo e toglie l'altro.
 */
function lineupProposta(prima: SetEsterno[], dopo: SetEsterno[]): Pick<PropostaConcerto, "concerts" | "remove_concerts"> {
  const presi = new Set<number>();
  const concerts: ConcertoDiProposta[] = [];
  /** I concerti rimasti uguali: indice in `prima` → come sono adesso. */
  const uguali = new Map<number, SetEsterno>();
  for (const s of dopo) {
    const i = prima.findIndex((x, j) => !presi.has(j) && chiaveNome(x.artist) === chiaveNome(s.artist) && stessoGiorno(x.date, s.date));
    if (i === -1) {
      concerts.push(senzaVuoti({ artist: s.artist, date: s.date, with: s.with.length ? s.with : undefined, voto: s.voto, vicinanza: s.vicinanza, canzoniNote: cnProposta(s.canzoniNote) }));
      continue;
    }
    presi.add(i);
    const x = prima[i];
    const c: ConcertoDiProposta = { artist: s.artist, ...(s.date ? { date: s.date } : {}) };
    const remove: RimovibileConcerto[] = [];
    let cambia = false;
    if (!stessiNomi(s.with, x.with ?? [])) {
      cambia = true;
      if (s.with.length) c.with = [...s.with];
      else remove.push("with");
    }
    for (const k of ["voto", "vicinanza"] as const) {
      if (s[k] === x[k]) continue;
      cambia = true;
      if (s[k] !== undefined) c[k] = s[k];
      else remove.push(k);
    }
    if (s.canzoniNote !== x.canzoniNote) {
      cambia = true;
      if (s.canzoniNote !== undefined) c.canzoniNote = cnProposta(s.canzoniNote);
      else remove.push("canzoniNote");
    }
    if (!s.date && x.date) {
      cambia = true;
      remove.push("date");
    }
    if (remove.length) c.remove = remove;
    if (cambia) concerts.push(c);
    else uguali.set(i, s);
  }
  const tolti = prima.filter((_, j) => !presi.has(j)).map(x => x.artist);
  const chiaviTolte = new Set(tolti.map(chiaveNome));
  for (const [, s] of [...uguali].sort(([a], [b]) => a - b)) {
    if (chiaviTolte.has(chiaveNome(s.artist))) concerts.push({ artist: s.artist, ...(s.date ? { date: s.date } : {}) });
  }
  return senzaVuoti({ concerts: concerts.length ? concerts : undefined, remove_concerts: tolti.length ? tolti : undefined });
}

function propostaModifica(tipo: TipoScheda, v: Valori, id: string, e: EventoEsterno): PropostaConcerto {
  const dopo = esternoDaValori(tipo, v);
  const p: PropostaConcerto = { id };
  const remove: Rimovibile[] = [];
  if (dopo.date !== e.date) p.date = v.date.trim();
  if (dopo.venue !== e.venue || dopo.city !== e.city) Object.assign(p, { venue: dopo.venue, city: dopo.city });
  if (tipo === "concert") {
    if ((dopo.artist ?? "") !== (e.artist ?? "")) p.artist = dopo.artist;
    if (!stessiNomi(dopo.with, e.with)) {
      if (dopo.with?.length) p.with = [...dopo.with];
      else remove.push("with");
    }
    for (const k of ["voto", "vicinanza"] as const) {
      if (dopo[k] === e[k]) continue;
      if (dopo[k] !== undefined) p[k] = dopo[k];
      else remove.push(k);
    }
    if (dopo.canzoniNote !== e.canzoniNote) {
      if (dopo.canzoniNote !== undefined) p.canzoniNote = cnProposta(dopo.canzoniNote as Canzoni);
      else remove.push("canzoniNote");
    }
  } else {
    if ((dopo.name ?? "") !== (e.name ?? "")) p.name = dopo.name;
    Object.assign(p, lineupProposta(e.concerts ?? [], dopo.concerts ?? []));
  }
  if (dopo.cost !== e.cost) {
    if (typeof dopo.cost === "number") p.cost = dopo.cost;
    else if (dopo.cost === "na") p.costForgotten = true;
    else remove.push("cost");
  }
  if (!!dopo.gift !== !!e.gift) p.gift = !!dopo.gift;
  if (dopo.gift && (dopo.giftFrom ?? "") !== (e.giftFrom ?? "")) {
    if (dopo.giftFrom) p.giftFrom = dopo.giftFrom;
    else remove.push("giftFrom");
  }
  if (!!dopo.accredito !== !!e.accredito) p.accredito = !!dopo.accredito;
  if ((dopo.from ?? "") !== (e.from ?? "")) {
    if (dopo.from) p.from = dopo.from;
    else remove.push("from");
  }
  if ((dopo.comments ?? "") !== (e.comments ?? "")) {
    if (dopo.comments) p.comments = dopo.comments;
    else remove.push("comments");
  }
  if (remove.length) p.remove = remove;
  return p;
}

/**
 * La proposta da mandare al Salva (o come `bozza` di una correzione):
 * per un evento nuovo tutto, per una modifica solo i campi diversi da
 * `esistente`, con `remove` per quelli tolti.
 */
export function propostaDaValori(b: Pick<Bozza, "tipo" | "valori" | "id" | "esistente">): PropostaConcerto {
  return b.id && b.esistente ? propostaModifica(b.tipo, b.valori, b.id, b.esistente) : propostaNuova(b.tipo, b.valori);
}

/** L'evento come sarà dopo il Salva, nella forma esterna. */
export const dopoDi = (b: Pick<Bozza, "tipo" | "valori">): EventoEsterno => esternoDaValori(b.tipo, b.valori);

/** Le righe «prima → dopo» di una scheda di modifica (vuote per un evento nuovo). */
export function differenzeScheda(b: Bozza): Differenza[] {
  return b.esistente ? differenze(b.esistente, dopoDi(b)) : [];
}

/** La proposta validata come la valida il server (schema del modello, poi daProposta): pronta per `editedArgs`. */
export function validaScheda(b: Bozza): { ok: true; proposta: PropostaConcerto } | { ok: false; errori: ErroreProposta[] } {
  const r = propostaConcertoInput.safeParse(propostaDaValori(b));
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, errori: [{ campo: i.path.map(String).join(".") || "scheda", messaggio: "valore non valido" }] };
  }
  const n = daProposta(r.data, b.esistente);
  return n.ok ? { ok: true, proposta: r.data } : { ok: false, errori: n.errori };
}

/* ── le mosse della scheda ─────────────────────────────────────── */

const setVuoto = (): ValoriSet => ({ artist: "", with: [], date: "" });

/** Il primo giorno di una data di festival ("30–31/05/2026" → "2026-05-30"), ISO; "" se non si legge. */
function primoGiornoIso(data: string): string {
  const m = /^(\d{2})(?:[–-]\d{2})?\/(\d{2})\/(\d{4})$/.exec(isoInGiorno(data));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** «È un festival»: il concerto diventa il primo concerto del festival, più uno vuoto (solo schede nuove). */
export function inFestival(b: Bozza): Bozza {
  if (b.tipo === "festival" || b.id) return b;
  return { ...b, tipo: "festival", valori: daConcertoAFestival(b.valori as ValoriConcerto) };
}

/** «Fanne un concerto singolo»: il primo concerto del festival diventa il concerto (solo schede nuove). */
export function inConcerto(b: Bozza): Bozza {
  if (b.tipo === "concert" || b.id) return b;
  const f = b.valori as ValoriFestival;
  const c = daFestivalAConcerto(f);
  // un festival su più giorni: il primo giorno (o quello del suo primo concerto)
  return { ...b, tipo: "concert", valori: { ...c, date: c.date || primoGiornoIso(f.date) } };
}

/** Si può fare un concerto singolo di questo festival senza perdere concerti? (al massimo uno con l'artista) */
export const singoloPossibile = (b: Pick<Bozza, "tipo" | "id" | "valori">) =>
  b.tipo === "festival" && !b.id && (b.valori as ValoriFestival).concerts.filter(c => c.artist.trim()).length <= 1;

/**
 * «Aggiorna quello»: la scheda nuova diventa la modifica del concerto che
 * c'è già. I campi detti nella scheda vanno sopra i suoi (come una
 * proposta di modifica: i vuoti non tolgono niente, i compagni sono
 * l'elenco intero); il Salva manda solo le differenze.
 */
export function aggiornaQuello(b: Bozza, esistente: EventoEsterno & { id: string }): Bozza {
  if (b.id || b.tipo !== esistente.kind) return b;
  const proposta = { ...propostaNuova(b.tipo, b.valori), id: esistente.id };
  return valoriDaProposta(proposta, esistente);
}

/** La lineup con un concerto in più (vuoto) in fondo. */
export const conSetInPiu = (f: ValoriFestival): ValoriFestival => ({ ...f, concerts: [...f.concerts, setVuoto()] });

/** La lineup senza il concerto i (mai sotto i due: × è spento). */
export const senzaSet = (f: ValoriFestival, i: number): ValoriFestival =>
  f.concerts.length <= 2 ? f : { ...f, concerts: f.concerts.filter((_, j) => j !== i) };

/** Il concerto i spostato di un posto su (-1) o giù (+1). */
export function spostaSet(f: ValoriFestival, i: number, verso: -1 | 1): ValoriFestival {
  const j = i + verso;
  if (j < 0 || j >= f.concerts.length) return f;
  const concerts = [...f.concerts];
  [concerts[i], concerts[j]] = [concerts[j], concerts[i]];
  return { ...f, concerts };
}

/** «Tienilo»: il concerto che la proposta toglieva torna dov'era. */
export function tieniSet(b: Bozza, k: number): Pick<Bozza, "valori" | "rimozioni"> {
  const r = b.rimozioni?.[k];
  if (!r || b.tipo !== "festival") return { valori: b.valori, rimozioni: b.rimozioni };
  const f = b.valori as ValoriFestival;
  const concerts = [...f.concerts];
  concerts.splice(Math.min(r.indice, concerts.length), 0, r.set);
  return { valori: { ...f, concerts }, rimozioni: b.rimozioni!.filter((_, j) => j !== k) };
}

/** «Toglilo»: la rimozione proposta è confermata. */
export const toglieSet = (b: Bozza, k: number): Pick<Bozza, "rimozioni"> => ({ rimozioni: b.rimozioni?.filter((_, j) => j !== k) });

const CAMPI_FORM: Record<string, string> = {
  artist: "artist", name: "name", date: "date", venue: "venue", city: "venue", with: "with", voto: "voto", vicinanza: "vicinanza",
  canzoniNote: "canzoniNote", cost: "cost", costForgotten: "cost", gift: "gift", giftFrom: "giftFrom", accredito: "accredito",
  from: "from", comments: "comments",
};

/**
 * I campi del form da segnare «proposto dall'Oracolo» nel «Modulo
 * completo» (i nomi di TanStack Form, es. "concerts[1].voto"): per una
 * scheda nuova quelli compilati, per una modifica quelli cambiati.
 */
export function evidenziaDi(b: Bozza): string[] {
  const p = propostaDaValori(b);
  const out = new Set<string>();
  for (const k of Object.keys(p)) if (CAMPI_FORM[k]) out.add(CAMPI_FORM[k]);
  if (b.tipo === "festival") {
    const sets = (b.valori as ValoriFestival).concerts;
    for (const c of p.concerts ?? []) {
      const i = sets.findIndex(s => chiaveNome(s.artist) === chiaveNome(c.artist) && stessoGiorno(s.date, c.date));
      if (i === -1) continue;
      if (!b.id) out.add(`concerts[${i}].artist`);
      for (const k of ["with", "voto", "vicinanza", "canzoniNote", "date"] as const) if (c[k] !== undefined) out.add(`concerts[${i}].${k}`);
    }
  }
  return [...out];
}

/** I valori tornati dal «Modulo completo» («Usa nella scheda»): la scheda li prende, e le righe cambiate prendono la ✎. */
export function daModulo(b: Pick<Bozza, "tipo" | "valori">, valori: Valori): { valori: Valori; cambiati: CampoScheda[] } {
  const cambiati = differenze(esternoDaValori(b.tipo, b.valori), esternoDaValori(b.tipo, valori)).map(d => CAMPO_DI_DIFFERENZA[d.campo]);
  return { valori, cambiati: [...new Set(cambiati.filter(Boolean))] };
}

/* ── doppioni ─────────────────────────────────────────────────── */

/** Un concerto (o festival) che sembra lo stesso della scheda: in archivio o in un'altra scheda del run. */
export interface Doppione {
  /** Per ricordare «È un altro concerto»: l'id in archivio, o `scheda:<id della chiamata>`. */
  chiave: string;
  /** In archivio: l'id del concerto o del festival. */
  id?: string;
  /** Un'altra scheda aperta nello stesso run (id della chiamata). */
  fratello?: string;
  /** Il tipo di quello trovato (un concerto può stare dentro un festival). */
  tipo: TipoScheda;
  titolo: string;
  /** "gg/mm/aaaa" (o "30–31/05/2026"). */
  data: string;
  luogo?: string;
  /** Il nome del festival, se l'artista è un suo concerto. */
  festival?: string;
  /** Giorni di distanza: 0 lo stesso giorno, -1 un giorno prima, 1 un giorno dopo. */
  giorni: number;
}

/** Un'altra scheda nuova aperta nello stesso run (prima di questa). */
export interface Fratello {
  id: string;
  tipo: TipoScheda;
  titolo: string;
  /** "gg/mm/aaaa". */
  data: string;
}

const MS_GIORNO = 86_400_000;
const giorniFra = (a: number, b: number) => Math.round((giornoDi(b).getTime() - giornoDi(a).getTime()) / MS_GIORNO);

/** Il primo e l'ultimo giorno (AAAAMMGG) di una data, anche "30–31/05/2026"; null se non si legge. */
function giorniDi(data: string | undefined): [number, number] | null {
  const d = isoInGiorno(data ?? "");
  const k = sortKey({ date: d });
  if (!k) return null;
  const r = /^\d{2}[–-](\d{2})\//.exec(d);
  return [k, r ? Math.floor(k / 100) * 100 + Number(r[1]) : k];
}

/** Quanti giorni separano il giorno `k` da un intervallo (0 se ci cade dentro). */
const distanzaDa = (k: number, [da, a]: [number, number]) => (k < da ? giorniFra(k, da) : k > a ? giorniFra(k, a) : 0);

/**
 * I doppioni di una scheda nuova: lo stesso artista (o lo stesso festival)
 * lo stesso giorno o a un giorno di distanza, in archivio (`eventi`, la
 * forma esterna di entries.list) o in un'altra scheda nuova del run aperta
 * prima di questa (solo lo stesso giorno). Una modifica non ne ha.
 */
export function doppioni(b: Bozza, eventi: readonly EventoEsterno[], fratelli: readonly Fratello[] = []): Doppione[] {
  if (b.id) return [];
  const festival = b.tipo === "festival";
  const titolo = (festival ? (b.valori as ValoriFestival).name : (b.valori as ValoriConcerto).artist).trim();
  const giorni = giorniDi(dopoDi(b).date);
  if (!titolo || !giorni) return [];
  const k = chiaveNome(titolo);
  const out: Doppione[] = [];
  const vicino = (g: number) => Math.abs(g) <= 1;
  for (const e of eventi) {
    if (!e.id) continue;
    const luogo = `${e.venue}, ${e.city}`;
    if (festival) {
      const dove = giorniDi(e.date);
      if (e.kind !== "festival" || chiaveNome(e.name ?? "") !== k || !dove) continue;
      // due intervalli: 0 se si toccano, altrimenti i giorni tra i bordi più vicini
      const g = giorni[1] < dove[0] ? giorniFra(giorni[1], dove[0]) : giorni[0] > dove[1] ? giorniFra(giorni[0], dove[1]) : 0;
      if (vicino(g)) out.push({ chiave: e.id, id: e.id, tipo: "festival", titolo: e.name ?? "", data: e.date, luogo, giorni: g });
      continue;
    }
    if (e.kind === "concert") {
      const dove = giorniDi(e.date);
      if (chiaveNome(e.artist ?? "") !== k || !dove) continue;
      const g = distanzaDa(giorni[0], dove);
      if (vicino(g)) out.push({ chiave: e.id, id: e.id, tipo: "concert", titolo: e.artist ?? "", data: e.date, luogo, giorni: g });
      continue;
    }
    // dentro un festival: il suo concerto più vicino a quel giorno (lo stesso artista può suonare due giorni)
    let migliore: Doppione | null = null;
    for (const s of e.concerts ?? []) {
      const dove = giorniDi(s.date || e.date);
      if (chiaveNome(s.artist) !== k || !dove) continue;
      const g = distanzaDa(giorni[0], dove);
      if (vicino(g) && (!migliore || Math.abs(g) < Math.abs(migliore.giorni))) {
        migliore = { chiave: e.id, id: e.id, tipo: "festival", titolo: s.artist, data: isoInGiorno(s.date || e.date), luogo, festival: e.name, giorni: g };
      }
    }
    if (migliore) out.push(migliore);
  }
  for (const f of fratelli) {
    const dove = giorniDi(f.data);
    if (f.tipo !== b.tipo || chiaveNome(f.titolo) !== k || !dove || distanzaDa(giorni[0], dove) !== 0) continue;
    out.push({ chiave: `scheda:${f.id}`, fratello: f.id, tipo: f.tipo, titolo: f.titolo, data: f.data, giorni: 0 });
  }
  // prima lo stesso giorno
  return out.sort((x, y) => Math.abs(x.giorni) - Math.abs(y.giorni));
}

/** «Hai già Verdena il 17/10/2026 (Alcatraz, Milano).» e simili. */
export function testoDoppione(d: Doppione): string {
  if (d.fratello) return `Anche un'altra scheda qui sopra è ${d.tipo === "festival" ? `il festival «${d.titolo}»` : d.titolo} il ${d.data}.`;
  const cosa = d.festival ? `${d.titolo} nel festival «${d.festival}»` : d.tipo === "festival" ? `il festival «${d.titolo}»` : d.titolo;
  if (d.giorni === 0) return `Hai già ${cosa} il ${d.data}${d.luogo ? ` (${d.luogo})` : ""}.`;
  return `Hai già ${cosa} il ${d.data}, un giorno ${d.giorni < 0 ? "prima" : "dopo"}.`;
}

/* ── problemi ─────────────────────────────────────────────────── */

export type TipoProblema =
  | "manca" | "data_non_valida" | "venue_manca" | "venue_fuori_catalogo" | "persona_ambigua" | "nome_completo" | "partenza_indirizzo"
  | "doppione" | "festival_corto" | "set_senza_artista" | "set_rimosso" | "bersaglio_sparito" | "nessuna_differenza" | "schema";

/** Un problema che blocca il Salva, con quello che serve per risolverlo. */
export interface Problema {
  chiave: string;
  tipo: TipoProblema;
  testo: string;
  /** La riga da aprire. */
  campo?: CampoScheda;
  /** Il nome scritto (persone, "regalato da"). */
  nome?: string;
  /** Persona o "regalato da". */
  ruolo?: "persona" | "regalo";
  /** I nomi esistenti che potrebbero essere lui, o il soprannome suggerito per primo. */
  opzioni?: string[];
  /** Lo stesso concerto già in archivio (o in un'altra scheda). */
  doppione?: Doppione;
  /** Quale rimozione della proposta (indice in `rimozioni`). */
  indice?: number;
}

export type TipoAvviso = "persona_nuova" | "regalo_nuovo" | "partenza_nuova" | "partenza_senza_indirizzo" | "futuro_con_voto" | "doppione_vicino" | "ignorato";

export interface Avviso {
  chiave: string;
  tipo: TipoAvviso;
  testo: string;
  /** Il nome della partenza (link a Partenze). */
  partenza?: string;
  /** Lo stesso artista un giorno prima o dopo («Apri quello»). */
  doppione?: Doppione;
}

/** Quello che la scheda sa dei dati del proprietario; undefined = non ancora caricato. */
export interface ContestoScheda {
  /** AAAAMMGG di oggi (Roma). */
  oggi: number;
  persone?: readonly string[];
  partenze?: readonly { name: string; stato: "impostato" | "mancante" }[];
  regali?: readonly string[];
  /** La venue è nel catalogo condiviso (undefined: non si sa ancora). */
  venueNelCatalogo?: boolean;
  /** Senza città, nel catalogo ci sono più venue con quel nome: si sceglie quale. */
  venueAmbigua?: boolean;
  /** Chiavi (chiaveNome) dei nomi nuovi confermati così come sono. */
  nomiOk?: readonly string[];
  /** Una modifica il cui concerto non c'è più. */
  bersaglioSparito?: boolean;
  /** I concerti e festival in archivio (entries.list, forma esterna con id): per i doppioni. */
  eventi?: readonly EventoEsterno[];
  /** Le altre schede nuove aperte prima di questa nello stesso run. */
  fratelli?: readonly Fratello[];
  /** Le chiavi dei doppioni lasciati così («È un altro concerto»). */
  doppioniOk?: readonly string[];
}

export interface ProblemiScheda {
  daSistemare: Problema[];
  daControllare: Avviso[];
  /** Le voci di mancanoDi (con il prezzo); null finché non si sa (la data manca o non si legge). */
  mancano: string[] | null;
}

const ETICHETTE_ERRORE: Record<string, string> = {
  artist: "Artista", name: "Festival", date: "Data", venue: "Venue", city: "Città", with: "Con", voto: "Voto", vicinanza: "Posizione",
  canzoniNote: "Canzoni note", cost: "Prezzo", giftFrom: "Regalato da", from: "Partenza", comments: "Commento", concerts: "Concerti",
  remove_concerts: "Concerti", id: "Scheda", scheda: "Scheda",
};
const CAMPO_ERRORE: Record<string, CampoScheda> = {
  artist: "artist", name: "name", date: "date", venue: "venue", city: "venue", with: "with", voto: "voto", vicinanza: "vicinanza",
  canzoniNote: "canzoniNote", cost: "biglietto", gift: "biglietto", giftFrom: "biglietto", accredito: "biglietto", from: "from", comments: "comments",
  concerts: "concerts", remove_concerts: "concerts",
};

const frase = (s: string) => {
  const t = s.trim();
  const m = t ? t[0].toUpperCase() + t.slice(1) : t;
  return /[.!?…]$/.test(m) ? m : `${m}.`;
};

/** I nomi di persona della bozza (anche dei set di un festival), senza doppioni. */
export function personeDi(b: Pick<Bozza, "tipo" | "valori">): string[] {
  const v = b.valori;
  return unici(b.tipo === "festival" ? (v as ValoriFestival).concerts.flatMap(c => c.with) : (v as ValoriConcerto).with);
}

/** Che cosa è un nome scritto rispetto alle persone che ci sono: esistente, nuovo, o da sistemare. */
export function statoNome(nome: string, persone: readonly string[] | undefined, nomiOk: readonly string[] = []): "esistente" | "nuovo" | "problema" | "attesa" {
  if (!persone) return "attesa";
  const k = chiaveNome(nome);
  if (persone.some(p => chiaveNome(p) === k)) return "esistente";
  if (nomiOk.includes(k)) return "nuovo";
  if (sembraNomeCompleto(nome) || simili(nome, persone).length) return "problema";
  return "nuovo";
}

/** Un nome nuovo da sistemare: nome e cognome (col soprannome suggerito) o uno che somiglia a nomi esistenti. */
function problemaNome(nome: string, esistenti: readonly string[], ruolo: "persona" | "regalo", campo: CampoScheda): Problema | null {
  const k = chiaveNome(nome);
  const vicini = simili(nome, esistenti);
  const soprannome = soprannomeSuggerito(nome);
  if (soprannome) {
    const opzioni = [soprannome, ...vicini.filter(x => chiaveNome(x) !== chiaveNome(soprannome))].slice(0, 4);
    return { chiave: `nome:${ruolo}:${k}`, tipo: "nome_completo", nome, ruolo, campo, opzioni, testo: `«${nome}» è nome e cognome: sulla pagina pubblica usa un soprannome.` };
  }
  if (!vicini.length) return null;
  const elenco = vicini.map(x => `«${x}»`);
  const quale = elenco.length === 1 ? elenco[0] : `${elenco.slice(0, -1).join(", ")} o ${elenco[elenco.length - 1]}`;
  return { chiave: `nome:${ruolo}:${k}`, tipo: "persona_ambigua", nome, ruolo, campo, opzioni: vicini, testo: `«${nome}»: intendi ${quale}?` };
}

/**
 * Cosa blocca il Salva, cosa controllare e cosa manca. Il primo blocco
 * viene dai controlli espliciti (con le loro azioni); gli altri errori
 * della validazione del server diventano «Etichetta: messaggio».
 */
export function problemiScheda(b: Bozza, ctx: ContestoScheda): ProblemiScheda {
  const daSistemare: Problema[] = [];
  const daControllare: Avviso[] = [];
  const v = b.valori;
  const festival = b.tipo === "festival";
  const nomiOk = ctx.nomiOk ?? [];

  if (b.id && ctx.bersaglioSparito) {
    daSistemare.push({ chiave: "sparito", tipo: "bersaglio_sparito", testo: "Questo concerto non c'è più: forse è stato cancellato o annullato." });
    return { daSistemare, daControllare, mancano: null };
  }

  const val = validaScheda(b);
  const errori = val.ok ? [] : val.errori;
  const coperti = new Set<string>();
  const erroreSu = (campo: string) => errori.some(e => e.campo === campo || e.campo.startsWith(`${campo}.`));

  // la serata
  if (festival ? !(v as ValoriFestival).name.trim() : !(v as ValoriConcerto).artist.trim()) {
    const campo = festival ? "name" : "artist";
    daSistemare.push({ chiave: `manca:${campo}`, tipo: "manca", campo, testo: festival ? "Manca il nome del festival." : "Manca l'artista." });
    coperti.add(campo);
  }
  if (!v.date.trim()) daSistemare.push({ chiave: "manca:date", tipo: "manca", campo: "date", testo: "Manca la data." });
  else if (erroreSu("date")) daSistemare.push({ chiave: "data", tipo: "data_non_valida", campo: "date", testo: "Data non valida." });
  coperti.add("date");

  // doppioni (solo le schede nuove): lo stesso giorno blocca finché non si sceglie; a un giorno di distanza è un avviso
  const doppi = ctx.eventi && !erroreSu("date") ? doppioni(b, ctx.eventi, ctx.fratelli) : [];
  for (const d of doppi) {
    if (d.giorni === 0 && !(ctx.doppioniOk ?? []).includes(d.chiave)) {
      daSistemare.push({ chiave: `doppione:${d.chiave}`, tipo: "doppione", testo: testoDoppione(d), doppione: d });
    }
  }
  if (!v.venue.trim()) {
    daSistemare.push({ chiave: "venue", tipo: "venue_manca", campo: "venue", testo: "Manca la venue." });
  } else if (ctx.venueNelCatalogo === false) {
    const citta = v.city.trim() ? ` (${v.city.trim()})` : "";
    const testo = ctx.venueAmbigua
      ? `Scegli la venue: nel catalogo c'è più di un «${v.venue.trim()}».`
      : `Scegli la venue: «${v.venue.trim()}»${citta} non è ancora nel catalogo.`;
    daSistemare.push({ chiave: "venue", tipo: "venue_fuori_catalogo", campo: "venue", testo });
  }
  if (!v.venue.trim() || ctx.venueNelCatalogo === false) ["venue", "city"].forEach(c => coperti.add(c));

  // la lineup
  if (festival) {
    const sets = (v as ValoriFestival).concerts;
    if (sets.length < 2) daSistemare.push({ chiave: "lineup", tipo: "festival_corto", campo: "concerts", testo: "Un festival ha almeno due concerti." });
    else if (sets.some(s => !s.artist.trim())) daSistemare.push({ chiave: "lineup", tipo: "set_senza_artista", campo: "concerts", testo: "Un concerto del festival non ha l'artista." });
    if (sets.length < 2 || sets.some(s => !s.artist.trim())) coperti.add("concerts");
    // i concerti che la proposta toglie: uno per uno, «Tienilo» o «Toglilo»
    for (const [i, r] of (b.rimozioni ?? []).entries()) {
      daSistemare.push({ chiave: `tolto:${i}:${chiaveNome(r.set.artist)}`, tipo: "set_rimosso", campo: "concerts", indice: i, testo: `Questa modifica toglie ${r.set.artist} dal festival.` });
    }
  }

  // persone
  if (ctx.persone) {
    for (const nome of personeDi(b)) {
      const k = chiaveNome(nome);
      if (ctx.persone.some(p => chiaveNome(p) === k)) continue;
      const pr = nomiOk.includes(k) ? null : problemaNome(nome, ctx.persone, "persona", festival ? "concerts" : "with");
      if (pr) daSistemare.push(pr);
      else daControllare.push({ chiave: `persona:${k}`, tipo: "persona_nuova", testo: `Persona nuova: «${nome}» si aggiunge alle tue persone quando salvi.` });
    }
  }

  // "regalato da"
  const regalo = v.gift ? v.giftFrom.trim() : "";
  if (regalo && ctx.regali && !ctx.regali.some(r => chiaveNome(r) === chiaveNome(regalo))) {
    const pr = nomiOk.includes(chiaveNome(regalo)) || !sembraNomeCompleto(regalo) ? null : problemaNome(regalo, [], "regalo", "biglietto");
    if (pr) daSistemare.push(pr);
    else daControllare.push({ chiave: "regalo", tipo: "regalo_nuovo", testo: `"Regalato da" nuovo: «${regalo}» si aggiunge quando salvi.` });
  }

  // partenza (solo il nome: l'indirizzo si imposta in Partenze)
  const da = v.from.trim();
  if (da && ctx.partenze) {
    const p = ctx.partenze.find(x => chiaveNome(x.name) === chiaveNome(da));
    if (p?.stato === "mancante") {
      daControllare.push({ chiave: "partenza", tipo: "partenza_senza_indirizzo", partenza: p.name, testo: `«${p.name}» non ha ancora un indirizzo: i km restano in attesa finché non lo imposti in Partenze.` });
    } else if (!p && sembraIndirizzo(da)) {
      daSistemare.push({
        chiave: "partenza",
        tipo: "partenza_indirizzo",
        campo: "from",
        testo: `«${da}» sembra un indirizzo: il nome della partenza è pubblico. Usa un nome come «Casa» e l'indirizzo impostalo in Partenze.`,
      });
      coperti.add("from");
    } else if (!p) {
      daControllare.push({ chiave: "partenza", tipo: "partenza_nuova", partenza: da, testo: `Partenza nuova: «${da}» si aggiunge senza indirizzo; i km arrivano quando lo imposti in Partenze.` });
    }
  }

  // il resto della validazione (gli stessi controlli del server)
  for (const e of errori) {
    const radice = e.campo.split(".")[0];
    if (coperti.has(radice) || daSistemare.some(p => p.chiave === `schema:${radice}`)) continue;
    daSistemare.push({ chiave: `schema:${radice}`, tipo: "schema", campo: CAMPO_ERRORE[radice], testo: `${ETICHETTE_ERRORE[radice] ?? "Scheda"}: ${frase(e.messaggio)}` });
  }

  const dopo = dopoDi(b);
  if (b.esistente && !differenzeScheda(b).length && !daSistemare.length) {
    daSistemare.push({ chiave: "uguale", tipo: "nessuna_differenza", testo: "Nessuna differenza con quello che c'è già." });
  }

  // avvisi
  const votato = festival ? (v as ValoriFestival).concerts.some(s => s.voto !== undefined) : (v as ValoriConcerto).voto !== undefined;
  if (votato && sortKey(dopo) > ctx.oggi) daControllare.push({ chiave: "futuro", tipo: "futuro_con_voto", testo: "La data è futura ma c'è un voto: controlla la data." });
  for (const d of doppi) {
    if (d.giorni !== 0) daControllare.push({ chiave: `vicino:${d.chiave}`, tipo: "doppione_vicino", testo: testoDoppione(d), doppione: d });
  }
  for (const [i, t] of b.ignorati.entries()) daControllare.push({ chiave: `ignorato:${i}`, tipo: "ignorato", testo: t });

  const mancano = v.date.trim() && !erroreSu("date") ? mancanoDi(dopo, ctx.oggi, { prezzo: true }) : null;
  return { daSistemare, daControllare, mancano };
}

/* ── lo stato della scheda nella chat ─────────────────────────── */

export type StatoScheda =
  | "salvata" | "annullata" | "non_salvata" | "scartata" | "corretta" | "chiusa"
  | "in_arrivo" | "pronta" | "in_salvataggio" | "bozza" | "errore_ripresa" | "scaduta";

/** Una parte "tool-call" di propose_concert, come la dà useChat. */
export interface ParteScheda {
  id: string;
  name: string;
  state?: string;
  input?: unknown;
  approval?: { id: string; approved?: boolean };
  output?: unknown;
}

/** L'id dell'interruzione (approvazione) di una chiamata. */
export const idApprovazione = (part: Pick<ParteScheda, "id" | "approval">) => part.approval?.id ?? `approval_${part.id}`;

/** L'output dello strumento come oggetto (o null). */
export function esitoDi(part: Pick<ParteScheda, "output">): Record<string, unknown> | null {
  let o = part.output;
  if (typeof o === "string") {
    try {
      o = JSON.parse(o) as unknown;
    } catch {
      return null;
    }
  }
  return o && typeof o === "object" ? (o as Record<string, unknown>) : null;
}

/**
 * Lo stato, valutato nell'ordine della spec (§9.4): prima l'esito (salvata,
 * non salvata, scartata, corretta, chiusa), poi il run (in arrivo, pronta,
 * in salvataggio, bozza, errore) e infine «scaduta» (riaperta dallo
 * storico o dopo un ricaricamento: niente più run da riprendere).
 */
export function statoScheda(
  part: ParteScheda,
  interruzione: { status: string; canResolve: boolean } | undefined,
  voce: { inviata?: boolean; annullata?: boolean; scartata?: boolean; notaInviata?: string } | undefined,
  o: { caricando: boolean; erroreRipresa?: boolean; annullataNelRegistro?: boolean },
): StatoScheda {
  const out = esitoDi(part);
  if (out?.ok === true) return voce?.annullata || o.annullataNelRegistro ? "annullata" : "salvata";
  if (out?.ok === false && out.errore) return "non_salvata";
  if (out?.motivo === "scartata") return "scartata";
  if (out?.motivo === "correzione") return "corretta";
  if (out && "error" in out) return "chiusa";
  // decisa qui e già partita (la risposta arriva): Scarta o una correzione scritta nella chat
  const partita = !interruzione || interruzione.status === "submitting";
  if (!out && partita && voce?.notaInviata !== undefined) return "corretta";
  if (!out && partita && voce?.scartata) return "scartata";
  if (part.state === "input-streaming" || part.state === "awaiting-input" || (!part.approval && o.caricando)) return "in_arrivo";
  if (interruzione?.status === "staged") return "pronta";
  if (voce?.inviata && (!interruzione || interruzione.status === "submitting" || interruzione.status === "validating")) {
    // il run è finito senza un risultato per lei (un errore del server): non resta «Salvo…» per sempre
    return o.erroreRipresa ? "errore_ripresa" : o.caricando || interruzione ? "in_salvataggio" : "scaduta";
  }
  if (interruzione && interruzione.status === "pending" && interruzione.canResolve) return "bozza";
  if (interruzione?.status === "error" || o.erroreRipresa) return "errore_ripresa";
  if (!interruzione && o.caricando) return "in_arrivo";
  return "scaduta";
}

/* ── date leggibili ───────────────────────────────────────────── */

const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MESI_LUNGHI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

const giornoDi = (k: number) => new Date(Date.UTC(Math.floor(k / 10000), (Math.floor(k / 100) % 100) - 1, k % 100));

/** «sab 17 ott 2026»; più giorni come sono («30–31/05/2026»); "" se non si legge. */
export function giornoLungo(data: string): string {
  const d = isoInGiorno(data);
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return /^\d{2}[–-]\d{2}\/\d{2}\/\d{4}$/.test(d) ? d : "";
  const g = giornoDi(sortKey({ date: d }));
  return `${GIORNI[g.getUTCDay()]} ${g.getUTCDate()} ${MESI[g.getUTCMonth()]} ${g.getUTCFullYear()}`;
}

/** «17 ottobre 2026» (per gli annunci a voce). */
export function giornoParlato(data: string): string {
  const k = sortKey({ date: isoInGiorno(data) });
  if (!k) return data;
  const g = giornoDi(k);
  return `${g.getUTCDate()} ${MESI_LUNGHI[g.getUTCMonth()]} ${g.getUTCFullYear()}`;
}

/** «oggi», «ieri», «domani», «6 giorni fa», «tra 12 giorni», «3 mesi fa», «2 anni fa»; "" se la data non si legge. */
export function distanza(data: string, oggi: number): string {
  const k = sortKey({ date: isoInGiorno(data) });
  if (!k || !oggi) return "";
  const giorni = Math.round((giornoDi(k).getTime() - giornoDi(oggi).getTime()) / 86_400_000);
  if (giorni === 0) return "oggi";
  if (giorni === -1) return "ieri";
  if (giorni === 1) return "domani";
  const n = Math.abs(giorni);
  const quanto = n < 45 ? `${n} giorni` : n < 365 ? `${Math.round(n / 30)} ${Math.round(n / 30) === 1 ? "mese" : "mesi"}` : `${Math.floor(n / 365)} ${Math.floor(n / 365) === 1 ? "anno" : "anni"}`;
  return giorni < 0 ? `${quanto} fa` : `tra ${quanto}`;
}
