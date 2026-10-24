/* ──────────────────────────────────────────────────────────────
   La scheda dell'Oracolo in scrittura (propose_concert): la proposta di un
   concerto o festival, nuovo o da modificare, che il proprietario vede
   nella chat, corregge e salva lui. Le stesse funzioni pure girano nel
   server (entries.salvaScheda) e nel browser (la scheda), così i due non
   divergono mai.

   - `propostaConcertoInput`: lo schema che vede il modello. PIATTO e
     STATICO (niente union, literal o null, niente enum dal vocabolario,
     tutto facoltativo): Gemini lo legge bene, e un'approvazione rimasta in
     sospeso non diventa "stale" dopo un deploy (TanStack AI confronta
     l'hash dello schema alla ripresa). Tutto per nome: persone, venue,
     partenza e "regalato da", anche se non esistono ancora.
   - `rifiutoProposta`: il rifiuto tipizzato della scheda (Scarta, o una
     correzione scritta nella chat con le modifiche fatte a mano).
   - `daProposta`: proposta → l'input di add_concert (nuovo) o la patch di
     update_concert (modifica, con la lineup di un festival unita per
     artista), validati con lo schema unico di entry.ts.
   - `applica` / `differenze`: l'anteprima di una modifica e le righe
     "prima → dopo" in italiano.
   - `esitoDa`: il risultato dello strumento dopo il salvataggio, letto dal
     modello e dalla scheda: solo nomi, km e nome della partenza, MAI un
     indirizzo o una coordinata.
   ────────────────────────────────────────────────────────────── */

import { z } from "zod";
import { mancanoDi } from "../lib/mancano.ts";
import { chiaveNome } from "../lib/nomi.ts";
import { canzoniNoteScale, CN_LABELS, VIC_LABELS, vicinanzaScale } from "../model/scale.ts";
import { isoInGiorno, REGOLA_SOPRANNOMI } from "./campi.ts";
import { entryInput, entryPatch, type EntryInput } from "./entry.ts";
import { percorsoSicuro } from "./errors.ts";

/* ── lo schema per il modello ─────────────────────────────────── */

const testo = (max: number) => z.string().trim().min(1).max(max);
const votoP = z.number().int().min(1).max(5).describe("Voto da 1 (pessimo) a 5 (indimenticabile); più alto = meglio");
const vicP = z.number().int().min(1).max(6).describe(`Quanto vicino al palco, più alto = più vicino: ${vicinanzaScale()}`);
const cnP = z.enum(["1", "2", "3", "4", "5", "na"]).describe(`Quante canzoni della scaletta conoscevi: ${canzoniNoteScale()}; "na" = non ricordo`);
const personeP = z.array(testo(40)).max(30).describe(`Compagni, elenco completo (in una modifica sostituisce quello di prima). ${REGOLA_SOPRANNOMI}`);

/** I campi che una modifica può togliere (`remove`). */
export const CAMPI_RIMOVIBILI = ["with", "voto", "vicinanza", "canzoniNote", "cost", "gift", "giftFrom", "accredito", "from", "comments"] as const;
/** I campi che una modifica può togliere a un concerto del festival (`concerts[].remove`). */
export const CAMPI_RIMOVIBILI_CONCERTO = ["with", "voto", "vicinanza", "canzoniNote", "date"] as const;

const concertoDiProposta = z.object({
  artist: testo(120).describe("Artista di questo concerto del festival, come in locandina"),
  date: z.string().trim().max(10).optional().describe("Solo festival su più giorni: il giorno di questo concerto, AAAA-MM-GG"),
  with: personeP.optional(),
  voto: votoP.optional(),
  vicinanza: vicP.optional(),
  canzoniNote: cnP.optional(),
  remove: z.array(z.enum(CAMPI_RIMOVIBILI_CONCERTO)).max(5).optional().describe("Solo per modificare: i campi di questo concerto da togliere"),
});

export const propostaConcertoInput = z
  .object({
    id: z.string().trim().max(64).optional().describe("Solo per modificare: l'id da list_concerts. Senza id è un evento nuovo"),
    artist: z.string().trim().max(120).optional().describe("Concerto singolo: l'artista, come in locandina"),
    name: z.string().trim().max(120).optional().describe("Solo festival: il nome, es. MI AMI 2026. Allora i concerti vanno in concerts"),
    concerts: z.array(concertoDiProposta).max(60).optional().describe("Festival nuovo: la lineup (almeno 2). Modifica: solo i concerti da cambiare o aggiungere, riconosciuti dall'artista"),
    remove_concerts: z.array(testo(120)).max(60).optional().describe("Solo per modificare un festival: gli artisti da togliere dalla lineup"),
    date: z.string().trim().max(24).optional().describe("AAAA-MM-GG (anche gg/mm/aaaa); più giorni: 30–31/05/2026"),
    venue: z.string().trim().max(120).optional().describe("Il locale come lo dice il proprietario: la scheda lo cerca nel catalogo"),
    city: z.string().trim().max(80).optional().describe("Città della venue"),
    with: personeP.optional(),
    voto: votoP.optional(),
    vicinanza: vicP.optional(),
    canzoniNote: cnP.optional(),
    cost: z.number().min(0).max(10000).optional().describe("Prezzo pagato in euro, commissioni comprese (0 = gratis)"),
    costForgotten: z.boolean().optional().describe("true se pagato ma il prezzo non si ricorda"),
    gift: z.boolean().optional().describe("true se il biglietto è stato regalato"),
    giftFrom: z.string().trim().max(60).optional().describe(`Chi l'ha regalato. Se è una persona: ${REGOLA_SOPRANNOMI}`),
    accredito: z.boolean().optional().describe("true se l'ingresso era con accredito o lista ospiti"),
    from: z.string().trim().max(40).optional().describe("Nome della partenza del viaggio (mai un indirizzo)"),
    comments: z.string().max(2000).optional().describe("Il ricordo della serata, solo con le parole del proprietario"),
    remove: z.array(z.enum(CAMPI_RIMOVIBILI)).max(10).optional().describe("Solo per modificare: i campi da togliere"),
  })
  .describe("Scheda di un concerto o festival");
export type PropostaConcerto = z.infer<typeof propostaConcertoInput>;
type ConcertoDiProposta = z.infer<typeof concertoDiProposta>;

/** Il rifiuto della scheda: «Scarta», o una correzione scritta nella chat mentre la scheda era aperta. */
export const rifiutoProposta = z
  .object({
    motivo: z.enum(["scartata", "correzione"]),
    // le parole del proprietario, scritte nella chat con la scheda aperta
    nota: z.string().trim().min(1).max(4000).optional(),
    // la scheda con le modifiche fatte a mano (solo se toccata)
    bozza: propostaConcertoInput.optional(),
  })
  .strict();
export type RifiutoProposta = z.infer<typeof rifiutoProposta>;

/** L'input di entries.salvaScheda. */
export const salvaSchedaInput = z.object({ proposta: propostaConcertoInput }).describe("La scheda salvata dal proprietario");

/* ── la forma esterna (nomi) ──────────────────────────────────── */

/** Un concerto di festival nella forma esterna. */
export interface SetEsterno {
  artist: string;
  with: string[];
  voto?: number;
  vicinanza?: number;
  canzoniNote?: number | "na";
  date?: string;
}

/** Un concerto o festival nella forma esterna di convex/lib/refs.ts `esterno` (entries.get, entries.list). */
export interface EventoEsterno {
  id?: string;
  kind: "concert" | "festival";
  date: string;
  venue: string;
  city: string;
  cost?: number | "na";
  gift?: boolean;
  giftFrom?: string;
  accredito?: boolean;
  from?: string;
  km?: number;
  kmPending?: boolean;
  comments?: string;
  artist?: string;
  with?: string[];
  voto?: number;
  vicinanza?: number;
  canzoniNote?: number | "na";
  name?: string;
  concerts?: SetEsterno[];
}

export type EntryPatch = z.output<typeof entryPatch>;

/* ── errori per campo, senza valori ───────────────────────────── */

export interface ErroreProposta {
  /** Il percorso del campo: "date", "concerts.1.artist"… */
  campo: string;
  /** In italiano, senza ripetere il valore. */
  messaggio: string;
}

const valoreA = (v: unknown, path: readonly PropertyKey[]): unknown =>
  path.reduce<unknown>((x, k) => (x !== null && typeof x === "object" ? (x as Record<PropertyKey, unknown>)[k] : undefined), v);

function messaggioIssue(i: z.core.$ZodIssue, campo: string, valore: unknown): string {
  if (campo === "concerts" && i.code === "too_small") return "un festival ha almeno due concerti";
  if (valore === undefined || valore === "") return "obbligatorio";
  if (/(^|\.)date$/.test(campo)) return "data non valida";
  switch (i.code) {
    case "too_small":
      return i.origin === "string" ? "obbligatorio" : i.origin === "array" ? `servono almeno ${String(i.minimum)} elementi` : `minimo ${String(i.minimum)}`;
    case "too_big":
      return i.origin === "string" ? `troppo lungo (al massimo ${String(i.maximum)} caratteri)` : i.origin === "array" ? `al massimo ${String(i.maximum)} elementi` : `massimo ${String(i.maximum)}`;
    case "invalid_format":
      return "formato non valido";
    case "custom":
      return i.message && !/^Invalid/.test(i.message) ? i.message : "valore non valido";
    default:
      return "valore non ammesso";
  }
}

/** Un errore per campo (il primo), con percorsi sicuri e messaggi senza valori. */
function erroriDa(err: z.ZodError, valore: unknown, schema: z.ZodType): ErroreProposta[] {
  const out: ErroreProposta[] = [];
  for (const i of err.issues) {
    const campo = percorsoSicuro(i.path, schema).join(".") || "scheda";
    if (out.some(e => e.campo === campo)) continue;
    out.push({ campo, messaggio: messaggioIssue(i, campo, valoreA(valore, i.path)) });
  }
  return out;
}

/* ── proposta → input o patch ─────────────────────────────────── */

export type EsitoDaProposta =
  | { ok: true; azione: "aggiungi"; input: EntryInput; ignorati: string[] }
  | { ok: true; azione: "modifica"; id: string; patch: EntryPatch }
  | { ok: false; errori: ErroreProposta[] };

/** "1".."5" → numero; "na" resta. */
const canzoni = (v: string | undefined): number | "na" | undefined => (v === undefined ? undefined : v === "na" ? "na" : Number(v));

const senzaVuoti = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as T;

const commento = (s: string | undefined) => (s !== undefined && s.trim() ? s : undefined);

/** I compagni senza doppioni (per chiave: «Marco R.» e «marco r.» sono la stessa persona). */
const unici = (nomi: readonly string[]) => nomi.filter((n, i) => nomi.findIndex(x => chiaveNome(x) === chiaveNome(n)) === i);

/** Il prezzo: quello detto, oppure "na" se pagato ma dimenticato. */
const prezzo = (p: PropostaConcerto) => p.cost ?? (p.costForgotten ? ("na" as const) : undefined);

/** I fatti di un concerto della proposta (singolo o del festival). */
const fattiNuovi = (c: Pick<ConcertoDiProposta, "voto" | "vicinanza" | "canzoniNote">) => ({
  voto: c.voto,
  vicinanza: c.vicinanza,
  canzoniNote: canzoni(c.canzoniNote),
});

function nuovo(p: PropostaConcerto): EsitoDaProposta {
  const festival = p.name !== undefined || p.concerts !== undefined;
  const base = {
    date: p.date,
    venue: p.venue,
    city: p.city,
    cost: prezzo(p),
    gift: p.gift || p.giftFrom !== undefined ? true : undefined,
    giftFrom: p.giftFrom,
    accredito: p.accredito || undefined,
    from: p.from,
    comments: commento(p.comments),
  };
  let input: Record<string, unknown>;
  const ignorati: string[] = [];
  if (festival) {
    // in un festival artista e voti stanno nei singoli concerti: quelli generali si ignorano
    for (const k of ["artist", "voto", "vicinanza", "canzoniNote"] as const) if (p[k] !== undefined) ignorati.push(k);
    input = senzaVuoti({
      kind: "festival",
      name: p.name,
      ...base,
      concerts: (p.concerts ?? []).map(c => senzaVuoti({ artist: c.artist, with: unici(c.with ?? p.with ?? []), ...fattiNuovi(c), date: c.date })),
    });
  } else {
    input = senzaVuoti({ kind: "concert", ...base, artist: p.artist, with: unici(p.with ?? []), ...fattiNuovi(p) });
  }
  const r = entryInput.safeParse(input);
  if (!r.success) return { ok: false, errori: erroriDa(r.error, input, entryInput) };
  return { ok: true, azione: "aggiungi", input: r.data, ignorati };
}

const FATTI_DEL_CONCERTO = ["artist", "with", "voto", "vicinanza", "canzoniNote"] as const;

/** La lineup dopo la modifica: i concerti della proposta uniti a quelli esistenti per artista (e giorno). */
function unisciLineup(p: PropostaConcerto, esistenti: SetEsterno[], errori: ErroreProposta[]): SetEsterno[] {
  const lineup = esistenti.map(c => ({ ...c, with: [...(c.with ?? [])], preso: false }));
  const stessoGiorno = (a?: string, b?: string) => !a || !b || isoInGiorno(a) === isoInGiorno(b);
  for (const c of p.concerts ?? []) {
    const k = chiaveNome(c.artist);
    const s = lineup.find(x => !x.preso && chiaveNome(x.artist) === k && stessoGiorno(x.date, c.date));
    if (!s) {
      lineup.push({ artist: c.artist, with: unici(c.with ?? []), ...fattiNuovi(c), date: c.date, preso: true });
      continue;
    }
    s.preso = true;
    const togli = new Set(c.remove ?? []);
    if (c.with !== undefined) s.with = unici(c.with);
    else if (togli.has("with")) s.with = [];
    const fatti = fattiNuovi(c);
    for (const f of ["voto", "vicinanza", "canzoniNote"] as const) {
      if (fatti[f] !== undefined) (s as Record<string, unknown>)[f] = fatti[f];
      else if (togli.has(f)) delete s[f];
    }
    if (c.date !== undefined) s.date = c.date;
    else if (togli.has("date")) delete s.date;
  }
  for (const [j, nome] of (p.remove_concerts ?? []).entries()) {
    // prima un concerto non nominato in `concerts`: lo stesso artista in un altro giorno, se nominato, resta
    const stesso = (x: (typeof lineup)[number]) => chiaveNome(x.artist) === chiaveNome(nome);
    const libero = lineup.findIndex(x => !x.preso && stesso(x));
    const i = libero !== -1 ? libero : lineup.findIndex(stesso);
    if (i === -1) errori.push({ campo: `remove_concerts.${j}`, messaggio: "non è nella lineup del festival" });
    else lineup.splice(i, 1);
  }
  if (lineup.length < 2) errori.push({ campo: "concerts", messaggio: "un festival ha almeno due concerti" });
  return lineup.map(x => {
    const { preso, ...s } = x;
    void preso;
    return senzaVuoti(s);
  });
}

function modifica(p: PropostaConcerto & { id: string }, e: EventoEsterno): EsitoDaProposta {
  const errori: ErroreProposta[] = [];
  const togli = new Set<string>(p.remove ?? []);
  const patch: Record<string, unknown> = {};
  // un valore detto vince su remove; remove senza valore toglie (null)
  const imposta = (k: string, v: unknown) => {
    if (v !== undefined) patch[k] = v;
    else if (togli.has(k)) patch[k] = null;
  };
  if (p.date !== undefined) patch.date = p.date;
  if (p.venue !== undefined) patch.venue = p.venue;
  if (p.city !== undefined) patch.city = p.city;

  if (e.kind === "concert") {
    for (const k of ["name", "concerts", "remove_concerts"] as const) {
      if (p[k] !== undefined) errori.push({ campo: k, messaggio: "nome e lineup valgono solo per i festival" });
    }
    if (p.artist !== undefined) patch.artist = p.artist;
    if (p.with !== undefined) patch.with = unici(p.with);
    else if (togli.has("with")) patch.with = [];
    const fatti = fattiNuovi(p);
    for (const k of ["voto", "vicinanza", "canzoniNote"] as const) imposta(k, fatti[k]);
  } else {
    for (const k of FATTI_DEL_CONCERTO) {
      if (p[k] !== undefined || togli.has(k)) {
        errori.push({ campo: k, messaggio: "in un festival artista, compagni e voti stanno nei singoli concerti" });
        break;
      }
    }
    if (p.name !== undefined) patch.name = p.name;
    if (p.concerts !== undefined || p.remove_concerts !== undefined) patch.concerts = unisciLineup(p, e.concerts ?? [], errori);
  }

  // biglietto: "regalato da" vuol dire regalo; togliere il regalo toglie anche chi l'ha fatto
  imposta("cost", prezzo(p));
  if (p.giftFrom !== undefined) Object.assign(patch, { gift: true, giftFrom: p.giftFrom });
  else if (p.gift === true) patch.gift = true;
  else if (p.gift === false || togli.has("gift")) Object.assign(patch, { gift: null, giftFrom: null });
  else if (togli.has("giftFrom")) patch.giftFrom = null;
  if (p.accredito === true) patch.accredito = true;
  else if (p.accredito === false || togli.has("accredito")) patch.accredito = null;
  imposta("from", p.from);
  if (p.comments !== undefined) patch.comments = commento(p.comments) ?? null;
  else if (togli.has("comments")) patch.comments = null;

  if (errori.length) return { ok: false, errori };
  const r = entryPatch.safeParse(patch);
  if (!r.success) return { ok: false, errori: erroriDa(r.error, patch, entryPatch) };
  return { ok: true, azione: "modifica", id: p.id, patch: r.data };
}

/**
 * La proposta come input di add_concert (senza `id`) o patch di
 * update_concert (con `id`; serve l'evento attuale nella forma esterna).
 * Senza `id` è un festival se ha `name` o `concerts`, altrimenti un
 * concerto. `remove` e `remove_concerts` valgono solo per le modifiche.
 */
export function daProposta(p: PropostaConcerto, esistente?: EventoEsterno): EsitoDaProposta {
  if (p.id === undefined || p.id === "") return nuovo(p);
  if (!esistente) return { ok: false, errori: [{ campo: "id", messaggio: "concerto non trovato" }] };
  return modifica(p as PropostaConcerto & { id: string }, esistente);
}

/** I nomi da creare al salvataggio: persone (anche dei set), "regalato da" e partenza. */
export function nomiDa(n: Extract<EsitoDaProposta, { ok: true }>): { persone: string[]; regalo?: string; partenza?: string } {
  const d = (n.azione === "aggiungi" ? n.input : n.patch) as {
    with?: string[];
    concerts?: { with?: string[] }[];
    giftFrom?: string | null;
    from?: string | null;
  };
  const persone = [...(d.with ?? []), ...(d.concerts ?? []).flatMap(c => c.with ?? [])];
  return {
    persone,
    ...(typeof d.giftFrom === "string" ? { regalo: d.giftFrom } : {}),
    ...(typeof d.from === "string" ? { partenza: d.from } : {}),
  };
}

/* ── anteprima e differenze ───────────────────────────────────── */

const CAMPI_SEMPLICI = ["date", "venue", "city", "artist", "name", "voto", "vicinanza", "canzoniNote", "cost", "gift", "giftFrom", "accredito", "from", "comments"] as const;

/** L'evento come sarà dopo la patch (per l'anteprima: i km si sanno solo al salvataggio). */
export function applica(e: EventoEsterno, patch: EntryPatch): EventoEsterno {
  const out: Record<string, unknown> = { ...e };
  for (const k of CAMPI_SEMPLICI) {
    const v = (patch as Record<string, unknown>)[k];
    if (v === null) delete out[k];
    else if (v !== undefined) out[k] = v;
  }
  if (patch.with !== undefined) out.with = [...patch.with];
  if (patch.concerts !== undefined) out.concerts = patch.concerts.map(c => senzaVuoti({ ...c, with: [...c.with] }));
  const dopo = out as unknown as EventoEsterno;
  if (dopo.from !== e.from || chiaveNome(dopo.venue) !== chiaveNome(e.venue) || chiaveNome(dopo.city) !== chiaveNome(e.city)) {
    delete dopo.km;
    delete dopo.kmPending;
  }
  return dopo;
}

export interface Differenza {
  /** L'etichetta italiana del campo ("Voto"); per la lineup sempre "Concerti". */
  campo: string;
  /** "—" se mancava; "" nelle righe della lineup (il testo intero sta in `dopo`). */
  prima: string;
  /** "tolto" se c'era e non c'è più. */
  dopo: string;
}

const VUOTO = "—";
const euro = (n: number) => `${String(n).replace(".", ",")} €`;
export const fmtVoto = (v?: number) => (v === undefined ? VUOTO : `${"★".repeat(v)} ${v}`);
export const fmtPosizione = (v?: number) => (v === undefined ? VUOTO : `${v} · ${VIC_LABELS[v] ?? "?"}`);
export const fmtCanzoni = (v?: number | "na") => (v === undefined ? VUOTO : v === "na" ? "Non ricordo" : `${v} · ${CN_LABELS[v] ?? "?"}`);
export const fmtPersone = (w?: string[]) => (w && w.length ? w.join(", ") : VUOTO);
export function fmtBiglietto(e: Pick<EventoEsterno, "cost" | "gift" | "accredito">): string {
  const parti: string[] = [];
  if (e.gift) parti.push("Regalo");
  if (e.accredito) parti.push("Accredito");
  if (e.cost === "na") parti.push("Pagato, prezzo dimenticato");
  else if (typeof e.cost === "number") parti.push(euro(e.cost));
  return parti.join(" · ") || VUOTO;
}
const fmtTesto = (s?: string) => (s ? s : VUOTO);
const tronca = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fmtCommento = (s?: string) => (s ? `«${tronca(s.replace(/\s+/g, " ").trim(), 60)}»` : VUOTO);
const fmtLuogo = (e: Pick<EventoEsterno, "venue" | "city">) => `${e.venue}, ${e.city}`;

/** Una riga "prima → dopo", se i due valori mostrati sono diversi. */
function riga(out: Differenza[], campo: string, prima: string, dopo: string) {
  if (prima === dopo) return;
  out.push({ campo, prima, dopo: dopo === VUOTO && prima !== VUOTO ? "tolto" : dopo });
}

const CAMPI_DEL_SET: [keyof SetEsterno, string, (c: SetEsterno) => string][] = [
  ["date", "giorno", c => fmtTesto(c.date)],
  ["with", "con", c => fmtPersone(c.with)],
  ["voto", "voto", c => fmtVoto(c.voto)],
  ["vicinanza", "posizione", c => fmtPosizione(c.vicinanza)],
  ["canzoniNote", "canzoni note", c => fmtCanzoni(c.canzoniNote)],
];

/** La lineup: «+ Afterhours», «− Calcutta», «Verdena: voto — → ★★★★★ 5» (per artista e giorno, come la modifica). */
function differenzeLineup(prima: SetEsterno[], dopo: SetEsterno[], out: Differenza[]) {
  const presi = new Set<number>();
  const stessoGiorno = (a?: string, b?: string) => !a || !b || isoInGiorno(a) === isoInGiorno(b);
  const righe: Differenza[] = [];
  for (const d of dopo) {
    const i = prima.findIndex((p, j) => !presi.has(j) && chiaveNome(p.artist) === chiaveNome(d.artist) && stessoGiorno(p.date, d.date));
    if (i === -1) {
      righe.push({ campo: "Concerti", prima: "", dopo: `+ ${d.artist}` });
      continue;
    }
    presi.add(i);
    for (const [, etichetta, fmt] of CAMPI_DEL_SET) {
      const a = fmt(prima[i]);
      const b = fmt(d);
      if (a !== b) righe.push({ campo: "Concerti", prima: "", dopo: `${d.artist}: ${etichetta} ${a} → ${b === VUOTO && a !== VUOTO ? "tolto" : b}` });
    }
  }
  for (const [j, p] of prima.entries()) if (!presi.has(j)) righe.push({ campo: "Concerti", prima: "", dopo: `− ${p.artist}` });
  out.push(...righe);
}

/** Le differenze tra due forme esterne, con etichette italiane e valori come li mostra la scheda. */
export function differenze(prima: EventoEsterno, dopo: EventoEsterno): Differenza[] {
  const out: Differenza[] = [];
  if (dopo.kind === "festival") riga(out, "Festival", fmtTesto(prima.name), fmtTesto(dopo.name));
  else riga(out, "Artista", fmtTesto(prima.artist), fmtTesto(dopo.artist));
  riga(out, "Data", prima.date, dopo.date);
  riga(out, "Venue", fmtLuogo(prima), fmtLuogo(dopo));
  if (dopo.kind === "festival") differenzeLineup(prima.concerts ?? [], dopo.concerts ?? [], out);
  else {
    riga(out, "Con", fmtPersone(prima.with), fmtPersone(dopo.with));
    riga(out, "Voto", fmtVoto(prima.voto), fmtVoto(dopo.voto));
    riga(out, "Posizione", fmtPosizione(prima.vicinanza), fmtPosizione(dopo.vicinanza));
    riga(out, "Canzoni note", fmtCanzoni(prima.canzoniNote), fmtCanzoni(dopo.canzoniNote));
  }
  riga(out, "Biglietto", fmtBiglietto(prima), fmtBiglietto(dopo));
  riga(out, "Regalato da", fmtTesto(prima.giftFrom), fmtTesto(dopo.giftFrom));
  riga(out, "Partenza", fmtTesto(prima.from), fmtTesto(dopo.from));
  riga(out, "Commento", fmtCommento(prima.comments), fmtCommento(dopo.comments));
  return out;
}

/* ── il risultato dello strumento ─────────────────────────────── */

/** Quello che restituisce entries.salvaScheda (nomi, mai indirizzi). */
export interface RisultatoScheda {
  azione: "aggiunto" | "modificato";
  id: string;
  activityId: string;
  prima?: EventoEsterno;
  dopo: EventoEsterno;
  creati: { persone: string[]; partenza?: string; regalatoDa?: string };
}

export type EsitoProposta =
  | {
      ok: true;
      azione: "aggiunto" | "modificato";
      tipo: "concert" | "festival";
      id: string;
      activityId: string;
      /** "Verdena" o il nome del festival. */
      titolo: string;
      /** "17/10/2026". */
      data: string;
      /** "Alcatraz, Milano". */
      luogo: string;
      /** Solo per una modifica; il commento compare come "modificato". */
      cambiati?: Differenza[];
      creati: { persone: string[]; partenza?: string; regalatoDa?: string };
      mancano: string[];
      partenza?: string;
      km?: number;
      kmInAttesa?: true;
      /** `/<handle>/modifica#partenze` quando i km aspettano l'indirizzo. */
      fix?: string;
    }
  | { ok: false; errore: { code: string; messaggio: string; campo?: string; fix?: string }; bozza: PropostaConcerto };

export const titoloEvento = (e: Pick<EventoEsterno, "kind" | "artist" | "name">) => (e.kind === "festival" ? e.name ?? "" : e.artist ?? "");

/** Il risultato per il modello e la scheda, da quello di entries.salvaScheda. */
export function esitoDa(r: RisultatoScheda, { today, handle }: { today: number; handle: string }): Extract<EsitoProposta, { ok: true }> {
  const d = r.dopo;
  const cambiati = r.prima
    ? differenze(r.prima, d).map(x => (x.campo === "Commento" ? { campo: x.campo, prima: "", dopo: x.dopo === "tolto" ? "tolto" : "modificato" } : x))
    : undefined;
  const creati = senzaVuoti({ persone: r.creati.persone, partenza: r.creati.partenza, regalatoDa: r.creati.regalatoDa });
  return senzaVuoti({
    ok: true as const,
    azione: r.azione,
    tipo: d.kind,
    id: r.id,
    activityId: r.activityId,
    titolo: titoloEvento(d),
    data: d.date,
    luogo: fmtLuogo(d),
    cambiati,
    creati,
    mancano: mancanoDi(d, today, { prezzo: true }),
    partenza: d.from,
    km: d.km,
    kmInAttesa: d.kmPending ? (true as const) : undefined,
    fix: d.kmPending ? `/${handle}/modifica#partenze` : undefined,
  });
}
