/* ──────────────────────────────────────────────────────────────
   Le parti pure delle sezioni di /<handle>/modifica (T5), testate in
   forme.test.ts:
   - la validazione dei form DERIVATA dallo schema Zod unico (PIANO §5.3):
     lo stesso schema che usano Convex, MCP e l'import, con messaggi in
     italiano e i percorsi dei campi di TanStack Form;
   - i valori del modale dei concerti ↔ l'input di `add_concert` e la
     patch di `update_concert`;
   - il riquadro "da completare" (§1.36, §1.38);
   - l'elenco di #concerti: filtri, ordini, separatori, viaggio, coda dei
     "da completare" (spec ux-modifica §6.1);
   - il form di un concerto: campi mancanti, duplicati, concerto ↔
     festival, le scorciatoie (venue recenti, compagni frequenti, l'ultima
     partenza) e gli errori del server sul loro campo (§6.2);
   - #persone e #wishlist: ricerca, filtri e ordine delle persone, i loro
     concerti e l'ultima volta, i nomi già usati, gli spostamenti (§6.4–6.5);
   - le righe dell'editor del layout de "I dati" (§1.35).
   ────────────────────────────────────────────────────────────── */

import type { z } from "zod";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { isPlanned, isoKey, sortKey } from "../../../shared/lib/dates.ts";
import { SECTIONS, type SectionId } from "../../../shared/sections.ts";

/* ── validazione dallo schema ─────────────────────────────────── */

type Issue = z.core.$ZodIssue;

/** Un messaggio in italiano per un problema di validazione (i valori non si ripetono). */
export function messaggioIssue(i: Issue, valore?: unknown): string {
  // Zod 4 non mette il valore nella issue: il chiamante passa quello del campo, solo per riconoscere il vuoto
  if (valore === "" || ((valore === undefined || valore === null) && i.code === "invalid_type")) return "obbligatorio";
  switch (i.code) {
    case "too_small":
      if (i.origin === "string") return Number(i.minimum) <= 1 ? "obbligatorio" : `troppo corto (almeno ${String(i.minimum)} caratteri)`;
      if (i.origin === "array") return `servono almeno ${String(i.minimum)} elementi`;
      return `minimo ${String(i.minimum)}`;
    case "too_big":
      if (i.origin === "string") return `troppo lungo (al massimo ${String(i.maximum)} caratteri)`;
      if (i.origin === "array") return `al massimo ${String(i.maximum)} elementi`;
      return `massimo ${String(i.maximum)}`;
    case "invalid_type":
      return "valore non valido";
    case "invalid_format":
      return "formato non valido";
    case "custom":
      // i messaggi dei refine dello schema sono già in italiano ("data non valida", "serve un URL https")
      return i.message && !/^Invalid/.test(i.message) ? i.message : "valore non valido";
    default:
      return "valore non ammesso";
  }
}

/** Il nome di un campo di TanStack Form da un percorso Zod: ["concerts", 0, "artist"] → "concerts[0].artist". */
export const campoDi = (path: readonly PropertyKey[]): string =>
  path.reduce<string>((acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc ? `${acc}.${String(seg)}` : String(seg)), "");

/**
 * Validatore di form (`validators.onChange` di TanStack Form) dallo schema:
 * gli errori per campo, oppure undefined se il valore è valido.
 */
export function erroriSchema(schema: z.ZodType, valore: unknown): { fields: Record<string, string> } | undefined {
  const r = schema.safeParse(valore);
  if (r.success) return undefined;
  const fields: Record<string, string> = {};
  for (const i of r.error.issues) {
    const nome = campoDi(i.path);
    if (!(nome in fields)) fields[nome] = messaggioIssue(i, valoreA(valore, i.path));
  }
  return { fields };
}

/** Il valore a un percorso (o undefined). */
const valoreA = (v: unknown, path: readonly PropertyKey[]): unknown =>
  path.reduce<unknown>((x, k) => (x !== null && typeof x === "object" ? (x as Record<PropertyKey, unknown>)[k] : undefined), v);

/** La descrizione di un campo dello schema (anche dentro optional, nullable, default). */
export function descrizione(s: z.ZodType | undefined): string | undefined {
  for (let x: unknown = s, n = 0; x && n < 6; n++) {
    const d = (x as z.ZodType).description;
    if (d) return d;
    x = (x as { _zod?: { def?: { innerType?: unknown } } })._zod?.def?.innerType;
  }
  return undefined;
}

/* ── nomi ─────────────────────────────────────────────────────── */

/** Come il server confronta i nomi (convex/lib/refs.ts `chiave`): senza maiuscole, accenti e spazi doppi. */
export const chiaveNome = (s: string): string =>
  s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/* ── date ─────────────────────────────────────────────────────── */

/** "25/10/2026" → "2026-10-25" (per `<input type="date">`); "" se non è un giorno singolo. */
export function inIso(data: string | undefined): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** "2026-10-25" → "25/10/2026" (il contrario di inIso); "" se non è una data ISO. */
export function daIso(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** AAAAMMGG → "25/10/2026". */
export const giornoDaChiave = (k: number): string => {
  const s = String(k).padStart(8, "0");
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
};

/* ── concerti e festival ──────────────────────────────────────── */

/** Una riga di entries.list (concerto o festival, con i nomi). */
export type EventoUi = FunctionReturnType<typeof api.entries.list>["concerts"][number];
export type FestivalUi = Extract<EventoUi, { concerts: unknown }>;
export type ConcertoUi = Exclude<EventoUi, FestivalUi>;

export const eFestival = (e: EventoUi): e is FestivalUi => "concerts" in e && Array.isArray(e.concerts);
export const titoloDi = (e: EventoUi): string => (eFestival(e) ? e.name ?? "" : e.artist ?? "");

type CanzoniNote = 1 | 2 | 3 | 4 | 5 | "na";
type Voto = 1 | 2 | 3 | 4 | 5;
type Vicinanza = 1 | 2 | 3 | 4 | 5 | 6;

/** I campi del biglietto e del viaggio, comuni a concerti e festival. */
interface ValoriEvento {
  date: string;
  venue: string;
  city: string;
  cost?: number | "na";
  gift: boolean;
  giftFrom: string;
  accredito: boolean;
  from: string;
  comments: string;
}

/** I fatti di un concerto (singolo o set di un festival). */
interface ValoriFatti {
  artist: string;
  with: string[];
  voto?: Voto;
  vicinanza?: Vicinanza;
  canzoniNote?: CanzoniNote;
}

export interface ValoriConcerto extends ValoriEvento, ValoriFatti {}
export interface ValoriSet extends ValoriFatti {
  /** "" = il giorno del festival (multi-giorno: quello del set, ISO). */
  date: string;
}
export interface ValoriFestival extends ValoriEvento {
  name: string;
  concerts: ValoriSet[];
}

const setVuoto = (): ValoriSet => ({ artist: "", with: [], date: "" });

function valoriEvento(e?: EventoUi): ValoriEvento {
  return {
    date: "",
    venue: e?.venue && e.venue !== "?" ? e.venue : "",
    city: e?.city && e.city !== "?" ? e.city : "",
    cost: e?.cost,
    gift: !!e?.gift,
    giftFrom: e?.giftFrom ?? "",
    accredito: !!e?.accredito,
    from: e?.from ?? "",
    comments: e?.comments ?? "",
  };
}

const fatti = (c?: { artist?: string; with?: string[]; voto?: number; vicinanza?: number; canzoniNote?: number | string }): ValoriFatti => ({
  artist: c?.artist ?? "",
  with: [...(c?.with ?? [])],
  voto: c?.voto as Voto | undefined,
  vicinanza: c?.vicinanza as Vicinanza | undefined,
  canzoniNote: c?.canzoniNote as CanzoniNote | undefined,
});

/** I valori iniziali del modale di un concerto (vuoti se nuovo). */
export function valoriConcerto(e?: ConcertoUi): ValoriConcerto {
  return { ...valoriEvento(e), ...fatti(e), date: inIso(e?.date) };
}

/** I valori iniziali del modale di un festival (due set vuoti se nuovo). */
export function valoriFestival(e?: FestivalUi): ValoriFestival {
  return {
    ...valoriEvento(e),
    // la data di un festival può coprire più giorni: si scrive come nel DB
    date: e?.date ?? "",
    name: e?.name ?? "",
    concerts: e ? e.concerts.map(c => ({ ...fatti(c), date: inIso(c.date) })) : [setVuoto(), setVuoto()],
  };
}

export const nuovoSet = setVuoto;

/** I fatti senza i campi vuoti (per l'input di add_concert). */
function fattiInput(v: ValoriFatti) {
  return {
    artist: v.artist,
    with: v.with,
    ...(v.voto !== undefined ? { voto: v.voto } : {}),
    ...(v.vicinanza !== undefined ? { vicinanza: v.vicinanza } : {}),
    ...(v.canzoniNote !== undefined ? { canzoniNote: v.canzoniNote } : {}),
  };
}

function eventoInput(v: ValoriEvento) {
  const testo = (s: string) => (s.trim() ? s : undefined);
  const out = {
    date: v.date,
    venue: v.venue,
    city: v.city,
    cost: v.cost,
    gift: v.gift || undefined,
    giftFrom: v.gift ? testo(v.giftFrom) : undefined,
    accredito: v.accredito || undefined,
    from: testo(v.from),
    comments: testo(v.comments),
  };
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined)) as Partial<typeof out> & Pick<typeof out, "date" | "venue" | "city">;
}

/** L'input di add_concert (forma esterna di shared/schema/entry.ts) da un concerto del modale. */
export const inputConcerto = (v: ValoriConcerto) => ({ kind: "concert" as const, ...eventoInput(v), ...fattiInput(v) });

/** L'input di add_concert da un festival del modale. */
export const inputFestival = (v: ValoriFestival) => ({
  kind: "festival" as const,
  name: v.name,
  ...eventoInput(v),
  concerts: v.concerts.map(c => ({ ...fattiInput(c), ...(c.date ? { date: c.date } : {}) })),
});

/** Gli stessi campi come patch di update_concert: quelli svuotati diventano null (si tolgono). */
function patchEvento(v: ValoriEvento) {
  const testo = (s: string) => (s.trim() ? s : null);
  return {
    date: v.date,
    venue: v.venue,
    city: v.city,
    cost: v.cost ?? null,
    gift: v.gift ? true : null,
    giftFrom: v.gift ? testo(v.giftFrom) : null,
    accredito: v.accredito ? true : null,
    from: testo(v.from),
    comments: testo(v.comments),
  };
}

export const patchConcerto = (v: ValoriConcerto) => ({
  ...patchEvento(v),
  artist: v.artist,
  with: v.with,
  voto: v.voto ?? null,
  vicinanza: v.vicinanza ?? null,
  canzoniNote: v.canzoniNote ?? null,
});

export const patchFestival = (v: ValoriFestival) => ({
  ...patchEvento(v),
  name: v.name,
  concerts: inputFestival(v).concerts,
});

/* ── il form di un concerto (spec ux-modifica §6.2) ───────────── */

export const eValoriFestival = (v: ValoriConcerto | ValoriFestival): v is ValoriFestival => "concerts" in v;

/** Il giorno (AAAAMMGG) dei valori del form: ISO per un concerto, "gg/mm/aaaa" (anche più giorni) per un festival; 0 se non si legge. */
export const giornoValori = (v: ValoriConcerto | ValoriFestival): number =>
  eValoriFestival(v) ? sortKey({ date: v.date }) : (isoKey(v.date) ?? 0);

/** La data del form è oggi o dopo (una data vuota non è in programma). */
export const inProgrammaValori = (v: ValoriConcerto | ValoriFestival, oggi: number): boolean => {
  const g = giornoValori(v);
  return g > 0 && g >= oggi;
};

/**
 * I campi del form che a un evento passato mancano ancora (gli stessi del
 * riquadro "da completare"), come nomi di TanStack Form: voto, vicinanza e
 * canzoniNote (per ogni set di un festival) e la partenza. Niente per un
 * evento in programma o senza una data leggibile.
 */
export function campiMancanti(v: ValoriConcerto | ValoriFestival, oggi: number): string[] {
  const g = giornoValori(v);
  if (!g || g >= oggi) return [];
  const fatti = (f: ValoriFatti, prefisso: string) =>
    (["voto", "vicinanza", "canzoniNote"] as const).filter(k => f[k] === undefined).map(k => `${prefisso}${k}`);
  const out = eValoriFestival(v) ? v.concerts.flatMap((c, i) => fatti(c, `concerts[${i}].`)) : fatti(v, "");
  if (!v.from.trim()) out.push("from");
  return out;
}

/** Le etichette dei campi, per il riepilogo degli errori e «Mancano: …». */
const ETICHETTE: Record<string, string> = {
  name: "Nome del festival",
  artist: "Artista",
  date: "Data",
  venue: "Venue",
  city: "Venue",
  with: "Con chi",
  voto: "Voto",
  vicinanza: "Posizione",
  canzoniNote: "Canzoni note",
  concerts: "Concerti del festival",
  cost: "Prezzo",
  gift: "Regalato",
  giftFrom: "Regalato da",
  accredito: "Accredito",
  from: "Partito da",
  comments: "Commento",
};
const ORDINE_CAMPI = Object.keys(ETICHETTE);
const SET = /^concerts\[(\d+)\]\.(\w+)/;

/** «Artista», «Voto del concerto 2» (un set di un festival; «Giorno» per la sua data). */
export function etichettaCampo(campo: string): string {
  const m = SET.exec(campo);
  if (m) return `${m[2] === "date" ? "Giorno" : (ETICHETTE[m[2]] ?? m[2])} del concerto ${Number(m[1]) + 1}`;
  return ETICHETTE[campo.replace(/\[\d+\].*$/, "")] ?? campo;
}

/** Ordina i campi come compaiono nel form (i set del festival al posto di «Concerti del festival»). */
export function ordinaCampi(campi: string[]): string[] {
  const rango = (c: string) => {
    const m = SET.exec(c);
    const base = ORDINE_CAMPI.indexOf(m ? "concerts" : c.replace(/\[\d+\].*$/, ""));
    return (base === -1 ? 99 : base) * 10_000 + (m ? (Number(m[1]) + 1) * 100 + ORDINE_CAMPI.indexOf(m[2]) : 0);
  };
  return [...campi].sort((a, b) => rango(a) - rango(b));
}

/**
 * Il campo del form di un `campo` di ConvexError (percorsi con i punti):
 * "with.0" → "with", "concerts.1.with.0" → "concerts[1].with", "venue";
 * null se non è un campo del form ("patch").
 */
export function campoDaServer(campo: string | undefined): string | null {
  if (!campo) return null;
  const parti = campo.split(".");
  let out = "";
  for (let i = 0; i < parti.length; i++) {
    const p = parti[i];
    if (/^\d+$/.test(p)) {
      // l'indice di un nome tra i compagni non è un campo; quello di un set sì
      if (parti[i - 1] === "concerts") out += `[${p}]`;
      continue;
    }
    out += out ? `.${p}` : p;
  }
  const radice = out.replace(/\[\d+\].*$/, "");
  return radice in ETICHETTE && radice !== "gift" ? out : null;
}

/**
 * «Duplica»: un concerto nuovo con artista, venue, compagni, partenza e
 * biglietto di quello di partenza, senza data, voti e commento; un
 * festival tiene nome, venue e partenza, con due concerti vuoti.
 */
export function valoriDuplicati(e: EventoUi): ValoriConcerto | ValoriFestival {
  if (eFestival(e)) {
    const base = valoriFestival();
    const da = valoriFestival(e);
    return { ...base, name: da.name, venue: da.venue, city: da.city, from: da.from };
  }
  const v = valoriConcerto(e);
  return { ...v, date: "", voto: undefined, vicinanza: undefined, canzoniNote: undefined, comments: "" };
}

/**
 * Da concerto a festival (il form nuovo cambia tipo): data, venue,
 * biglietto, viaggio e commento restano; artista, compagni e voti
 * diventano il primo concerto del festival.
 */
export function daConcertoAFestival(v: ValoriConcerto): ValoriFestival {
  const { artist, with: con, voto, vicinanza, canzoniNote, date, ...evento } = v;
  return { ...evento, date: daIso(date), name: "", concerts: [{ artist, with: [...con], voto, vicinanza, canzoniNote, date: "" }, setVuoto()] };
}

/** Da festival a concerto: il primo concerto del festival diventa il concerto (gli altri si perdono). */
export function daFestivalAConcerto(v: ValoriFestival): ValoriConcerto {
  const { name: _nome, concerts, date, ...evento } = v;
  void _nome;
  const primo = concerts[0] ?? setVuoto();
  return {
    ...evento,
    date: inIso(date) || primo.date,
    artist: primo.artist,
    with: [...primo.with],
    voto: primo.voto,
    vicinanza: primo.vicinanza,
    canzoniNote: primo.canzoniNote,
  };
}

/** Le venue degli ultimi eventi (dal più recente), senza doppioni: le scorciatoie «Usate di recente». */
export function venueRecenti(eventi: EventoUi[], n = 5): { venue: string; city: string }[] {
  const out: { venue: string; city: string }[] = [];
  const viste = new Set<string>();
  for (const e of ordinaEventi(eventi)) {
    if (!e.venue || e.venue === "?") continue;
    const k = `${chiaveNome(e.venue)}|${chiaveNome(e.city)}`;
    if (viste.has(k)) continue;
    viste.add(k);
    out.push({ venue: e.venue, city: e.city });
    if (out.length === n) break;
  }
  return out;
}

/** Le persone con più concerti (le scorciatoie «Frequenti»), senza quelle già scelte. */
export function compagniFrequenti(persone: { name: string; concerti: number }[], scelte: string[] = [], n = 6): string[] {
  const via = new Set(scelte.map(chiaveNome));
  return persone
    .filter(p => p.concerti > 0 && !via.has(chiaveNome(p.name)))
    .sort((a, b) => b.concerti - a.concerti || a.name.localeCompare(b.name, "it"))
    .slice(0, n)
    .map(p => p.name);
}

/** La partenza dell'ultimo concerto che ne ha una (per «Come l'ultimo: …»), o null. */
export function ultimaPartenza(eventi: EventoUi[]): string | null {
  return ordinaEventi(eventi).find(e => !!e.from)?.from ?? null;
}

/* ── elenco ───────────────────────────────────────────────────── */

/** Dal più recente; a parità di giorno, l'ordine di inserimento rovesciato. */
export const ordinaEventi = (eventi: EventoUi[]): EventoUi[] =>
  eventi.map((e, i) => ({ e, i, k: sortKey(e) })).sort((a, b) => b.k - a.k || b.i - a.i).map(x => x.e);

/** Ricerca libera: artista, festival, venue, città, compagni (senza maiuscole). */
export function cercaEventi(eventi: EventoUi[], testo: string): EventoUi[] {
  const q = testo.trim().toLowerCase();
  if (!q) return eventi;
  return eventi.filter(e => {
    const parti = [e.venue, e.city, e.date, titoloDi(e), ...(eFestival(e) ? e.concerts.flatMap(c => [c.artist, ...c.with]) : (e.with ?? []))];
    return parti.some(p => (p ?? "").toLowerCase().includes(q));
  });
}

/** I compagni di un evento (di tutti i set, per un festival), senza doppioni. */
export function compagniDi(e: EventoUi): string[] {
  const tutti = eFestival(e) ? e.concerts.flatMap(c => c.with) : (e.with ?? []);
  const visti = new Set<string>();
  return tutti.filter(n => !visti.has(chiaveNome(n)) && visti.add(chiaveNome(n)));
}

/** «Cami <3, Espi +2»: i primi due compagni e quanti altri. */
export function compagniBrevi(e: EventoUi): string {
  const c = compagniDi(e);
  if (!c.length) return "";
  return c.slice(0, 2).join(", ") + (c.length > 2 ? ` +${c.length - 2}` : "");
}

/** Il voto di una riga: quello del concerto, o il più alto dei set di un festival. */
export function votoDi(e: EventoUi): number | undefined {
  const voti = (eFestival(e) ? e.concerts.map(c => c.voto) : [e.voto]).filter((v): v is NonNullable<typeof v> => v !== undefined);
  return voti.length ? Math.max(...voti) : undefined;
}

/** L'anno di un evento (quello del primo giorno). */
export const annoDi = (e: { date: string }): number => Math.floor(sortKey(e) / 10000);

/** Gli anni dell'archivio, dal più recente. */
export const anniDi = (eventi: EventoUi[]): number[] => [...new Set(eventi.map(annoDi).filter(a => a > 0))].sort((a, b) => b - a);

/**
 * Il viaggio di una riga, esattamente: «da Casa · 212 km», «da Casa · km in
 * attesa» (la partenza non ha l'indirizzo), «da Casa» (km storici assenti)
 * o «—» senza partenza.
 */
export function viaggioDi(e: { from?: string; km?: number; kmPending?: boolean }): string {
  if (!e.from) return "—";
  if (e.kmPending) return `da ${e.from} · km in attesa`;
  return e.km !== undefined ? `da ${e.from} · ${e.km} km` : `da ${e.from}`;
}

/* ── elenco: filtri, ordini, separatori (spec ux-modifica §6.1) ── */

/** Le pastiglie dei filtri; `?filtro=` dell'URL usa gli stessi token. */
export type FiltroConcerti = "tutti" | "programma" | "passati" | "da-completare" | "festival";
export type OrdineConcerti = "recenti" | "meno-recenti" | "artista" | "voto";

export interface Filtri {
  filtro?: FiltroConcerti;
  anno?: number | null;
  /** Il nome di una persona (dal suo id in `?con=`). */
  con?: string | null;
  testo?: string;
}

/** Gli eventi che passano tutti i filtri attivi. */
export function filtraEventi(eventi: EventoUi[], f: Filtri, oggi: number): EventoUi[] {
  const con = f.con ? chiaveNome(f.con) : null;
  const passa = (e: EventoUi) => {
    switch (f.filtro ?? "tutti") {
      case "programma":
        if (!isPlanned(e, oggi)) return false;
        break;
      case "passati":
        if (isPlanned(e, oggi)) return false;
        break;
      case "da-completare":
        if (!mancanoEvento(e, oggi).length) return false;
        break;
      case "festival":
        if (!eFestival(e)) return false;
        break;
    }
    if (f.anno && annoDi(e) !== f.anno) return false;
    if (con && !compagniDi(e).some(n => chiaveNome(n) === con)) return false;
    return true;
  };
  return cercaEventi(eventi.filter(passa), f.testo ?? "");
}

/**
 * L'elenco in un ordine: per data (dal più recente o dal meno recente),
 * per artista (il nome del festival per un festival) o per voto (il più
 * alto dei set per un festival; senza voto in fondo). A parità vale
 * l'ordine per data, dal più recente.
 */
export function ordinaEventiPer(eventi: EventoUi[], ordine: OrdineConcerti): EventoUi[] {
  const recenti = ordinaEventi(eventi);
  switch (ordine) {
    case "meno-recenti":
      return [...recenti].reverse();
    case "artista":
      return [...recenti].sort((a, b) => titoloDi(a).localeCompare(titoloDi(b), "it", { sensitivity: "base" }));
    case "voto":
      return [...recenti].sort((a, b) => (votoDi(b) ?? 0) - (votoDi(a) ?? 0));
    default:
      return recenti;
  }
}

/** Una riga dell'elenco: un evento, o un separatore (l'anno, «oggi»). */
export type RigaElenco = { tipo: "evento"; e: EventoUi } | { tipo: "anno"; anno: number; conta: number } | { tipo: "oggi" };

/**
 * I separatori di un elenco in ordine di data: l'anno («2026 · 32») a ogni
 * cambio d'anno e una sola riga «oggi» tra gli eventi in programma e quelli
 * passati (prima dell'anno, se cadono insieme). Negli altri ordini niente.
 */
export function conSeparatori(eventi: EventoUi[], ordine: OrdineConcerti, oggi: number): RigaElenco[] {
  if (ordine !== "recenti" && ordine !== "meno-recenti") return eventi.map(e => ({ tipo: "evento", e }));
  const perAnno = new Map<number, number>();
  for (const e of eventi) perAnno.set(annoDi(e), (perAnno.get(annoDi(e)) ?? 0) + 1);
  const out: RigaElenco[] = [];
  let anno: number | null = null;
  let programma: boolean | null = null;
  let oggiMesso = false;
  for (const e of eventi) {
    const p = isPlanned(e, oggi);
    if (programma !== null && p !== programma && !oggiMesso) {
      out.push({ tipo: "oggi" });
      oggiMesso = true;
    }
    programma = p;
    const a = annoDi(e);
    if (a !== anno) {
      out.push({ tipo: "anno", anno: a, conta: perAnno.get(a) ?? 0 });
      anno = a;
    }
    out.push({ tipo: "evento", e });
  }
  return out;
}

/* ── da completare (§1.36, §1.38) ─────────────────────────────── */

export interface DaCompletare {
  id: string;
  titolo: string;
  date: string;
  /** Cosa manca, già in italiano: "voto", "posizione", "canzoni note", "partenza". */
  mancano: string[];
}

/** Cosa manca a un evento passato ([] se è in programma o completo), in italiano. */
export function mancanoEvento(e: EventoUi, oggi: number): string[] {
  if (isPlanned(e, oggi)) return [];
  const concerti = eFestival(e) ? e.concerts : [e];
  const quanti = (manca: (c: (typeof concerti)[number]) => boolean) => concerti.filter(manca).length;
  const mancano: string[] = [];
  const conta = (n: number, nome: string) => {
    if (n) mancano.push(eFestival(e) ? `${nome} (${n} ${n === 1 ? "concerto" : "concerti"})` : nome);
  };
  conta(quanti(c => c.voto === undefined), "voto");
  conta(quanti(c => c.vicinanza === undefined), "posizione");
  conta(quanti(c => c.canzoniNote === undefined), "canzoni note");
  if (!e.from) mancano.push("partenza");
  return mancano;
}

/**
 * Gli eventi passati a cui manca qualcosa: voto, posizione (vicinanza) o
 * canzoni note di un concerto (anche dei set di un festival), oppure la
 * partenza del viaggio. Dal più recente.
 */
export function daCompletare(eventi: EventoUi[], oggi: number): DaCompletare[] {
  const out: DaCompletare[] = [];
  for (const e of ordinaEventi(eventi)) {
    const mancano = mancanoEvento(e, oggi);
    if (mancano.length) out.push({ id: e.id, titolo: titoloDi(e), date: e.date, mancano });
  }
  return out;
}

/**
 * Il prossimo da completare dopo `id`, nell'ordine dell'elenco di prima del
 * salvataggio (quello appena salvato si salta anche se manca ancora
 * qualcosa); null alla fine.
 */
export function prossimoDaCompletare(lista: { id: string }[], id: string): string | null {
  const i = lista.findIndex(x => x.id === id);
  const resto = i === -1 ? lista.filter(x => x.id !== id) : lista.slice(i + 1);
  return resto[0]?.id ?? null;
}

/* ── persone (#persone, spec ux-modifica §6.5) ────────────────── */

/** Gli eventi in cui compare una persona (anche in un set di festival), dal più recente. */
export function eventiDiPersona(eventi: EventoUi[], nome: string): EventoUi[] {
  const k = chiaveNome(nome);
  return ordinaEventi(eventi).filter(e => compagniDi(e).some(n => chiaveNome(n) === k));
}

/** Gli eventi in cui compare una persona, come "gg/mm/aaaa · titolo". */
export function eventiConPersona(eventi: EventoUi[], nome: string): string[] {
  return eventiDiPersona(eventi, nome).map(e => `${e.date} · ${titoloDi(e)}`);
}

/**
 * L'ultima serata passata con ciascuna persona («ultima volta 01/02/2025»):
 * chiave del nome (chiaveNome) → data. Un concerto in programma (anche di
 * oggi) non conta; in un festival vale il giorno del suo concerto, se c'è.
 */
export function ultimoConcertoPerPersona(eventi: EventoUi[], oggi: number): Map<string, string> {
  const ultimo = new Map<string, { k: number; data: string }>();
  for (const e of eventi) {
    const serate = eFestival(e) ? e.concerts.map(c => ({ data: c.date || e.date, con: c.with })) : [{ data: e.date, con: e.with ?? [] }];
    for (const s of serate) {
      const k = sortKey({ date: s.data });
      if (!k || k >= oggi) continue;
      for (const n of s.con) {
        const c = chiaveNome(n);
        const prima = ultimo.get(c);
        if (!prima || k > prima.k) ultimo.set(c, { k, data: s.data });
      }
    }
  }
  return new Map([...ultimo].map(([c, x]) => [c, x.data]));
}

/** Il nome già usato con la stessa chiave (maiuscole, accenti e spazi a parte), o null. */
export function nomeGiaUsato(nomi: readonly string[], nome: string): string | null {
  const k = chiaveNome(nome);
  return k ? (nomi.find(n => chiaveNome(n) === k) ?? null) : null;
}

export type FiltroPersone = "tutte" | "mai";
export type OrdinePersone = "nome" | "piu" | "meno";

/** #persone: la ricerca (senza maiuscole né accenti), «Mai in un concerto» e l'ordine (a parità, per nome). */
export function elencoPersone<P extends { name: string; concerti: number }>(
  persone: readonly P[],
  { testo = "", filtro = "tutte", ordine = "nome" }: { testo?: string; filtro?: FiltroPersone; ordine?: OrdinePersone },
): P[] {
  const q = chiaveNome(testo);
  const perNome = (a: P, b: P) => a.name.localeCompare(b.name, "it");
  const confronto =
    ordine === "piu" ? (a: P, b: P) => b.concerti - a.concerti || perNome(a, b) : ordine === "meno" ? (a: P, b: P) => a.concerti - b.concerti || perNome(a, b) : perNome;
  return persone.filter(p => (filtro !== "mai" || p.concerti === 0) && (!q || chiaveNome(p.name).includes(q))).sort(confronto);
}

/* ── wishlist (#wishlist, §6.4) ───────────────────────────────── */

/** La lista con la voce `da` spostata al posto `a` (0 = in cima; oltre la fine = in fondo). */
export function spostata<T>(lista: readonly T[], da: number, a: number): T[] {
  const l = [...lista];
  if (da < 0 || da >= l.length) return l;
  const [x] = l.splice(da, 1);
  l.splice(Math.max(0, Math.min(a, l.length)), 0, x);
  return l;
}

/* ── layout de "I dati" (§1.35) ───────────────────────────────── */

export interface RigaLayout {
  id: SectionId;
  visibile: boolean;
  /** "" = il titolo di base. */
  titolo: string;
}
type Layout = { ordine: string[]; nascoste: string[]; titoli: Record<string, string> };

/** Le righe dell'editor: prima l'ordine salvato, poi le altre sezioni nell'ordine di base. */
export function righeLayout(l: Layout): RigaLayout[] {
  const ids = SECTIONS.map(s => s.id as SectionId);
  const salvati = l.ordine.filter((id): id is SectionId => (ids as string[]).includes(id));
  const ordine = [...new Set([...salvati, ...ids])];
  return ordine.map(id => ({ id, visibile: !l.nascoste.includes(id), titolo: l.titoli[id] ?? "" }));
}

/** Il layout da salvare: l'ordine solo se diverso da quello di base, i titoli solo se cambiati. */
export function layoutDa(righe: RigaLayout[]): Layout {
  const ordine = righe.map(r => r.id);
  const base = SECTIONS.every((s, i) => s.id === ordine[i]);
  return {
    ordine: base ? [] : ordine,
    nascoste: righe.filter(r => !r.visibile).map(r => r.id),
    titoli: Object.fromEntries(
      righe.map(r => [r.id, r.titolo.trim()] as const).filter(([id, t]) => t && t !== SECTIONS.find(s => s.id === id)?.label),
    ),
  };
}
