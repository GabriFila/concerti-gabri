/* ──────────────────────────────────────────────────────────────
   Le parti pure delle sezioni di /<handle>/modifica (T5), testate in
   forme.test.ts:
   - la validazione dei form DERIVATA dallo schema Zod unico (PIANO §5.3):
     lo stesso schema che usano Convex, MCP e l'import, con messaggi in
     italiano e i percorsi dei campi di TanStack Form;
   - i valori del modale dei concerti ↔ l'input di `add_concert` e la
     patch di `update_concert`;
   - il riquadro "da completare" (§1.36, §1.38);
   - le righe dell'editor del layout de "I dati" (§1.35).
   ────────────────────────────────────────────────────────────── */

import type { z } from "zod";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { isPlanned, sortKey } from "../../../shared/lib/dates.ts";
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

/* ── da completare (§1.36, §1.38) ─────────────────────────────── */

export interface DaCompletare {
  id: string;
  titolo: string;
  date: string;
  /** Cosa manca, già in italiano: "voto", "posizione", "canzoni note", "partenza". */
  mancano: string[];
}

/**
 * Gli eventi passati a cui manca qualcosa: voto, posizione (vicinanza) o
 * canzoni note di un concerto (anche dei set di un festival), oppure la
 * partenza del viaggio. Dal più recente.
 */
export function daCompletare(eventi: EventoUi[], oggi: number): DaCompletare[] {
  const out: DaCompletare[] = [];
  for (const e of ordinaEventi(eventi)) {
    if (isPlanned(e, oggi)) continue;
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
    if (mancano.length) out.push({ id: e.id, titolo: titoloDi(e), date: e.date, mancano });
  }
  return out;
}

/* ── persone ──────────────────────────────────────────────────── */

/** Gli eventi in cui compare una persona (anche in un set di festival), come "gg/mm/aaaa · titolo". */
export function eventiConPersona(eventi: EventoUi[], nome: string): string[] {
  const k = chiaveNome(nome);
  return ordinaEventi(eventi)
    .filter(e => (eFestival(e) ? e.concerts.flatMap(c => c.with) : (e.with ?? [])).some(n => chiaveNome(n) === k))
    .map(e => `${e.date} · ${titoloDi(e)}`);
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
