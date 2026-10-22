/* ──────────────────────────────────────────────────────────────
   Import CSV/JSON (PIANO §5.10, traguardo 7): l'adattatore tra il formato
   congelato di shared/schema/importFormat.ts e `entryInput`. Non cambia il
   formato: lo legge.

   - CSV con papaparse: intestazione obbligatoria con i nomi di COLONNE_CSV
     (in qualunque ordine; separatore `,`, `;` o tab, riconosciuto da sé);
     le righe `tipo=festival` con stessi `festival`, `venue` e `data` sono
     UN festival, con biglietto e viaggio identici o vuoti nel gruppo.
   - JSON: un array nella forma esterna di entry.ts.
   - Ogni errore è per riga ({riga, campo, messaggio}) e non ripete MAI il
     valore letto: solo la colonna e la regola (come shared/schema/errors.ts).
   - `versoCsv` fa il giro inverso: un export reimportato dà lo stesso
     risultato.
   Puro e isomorfo: lo usano il browser (anteprima) e Convex (importer.ts).
   ────────────────────────────────────────────────────────────── */

import Papa from "papaparse";
import { entryInput, type EntryInput } from "./schema/entry.ts";
import { riassumiErroreZod } from "./schema/errors.ts";
import {
  CHIAVE_FESTIVAL, COLONNE_CSV, COLONNE_DI_GRUPPO, CONFIRM_IMPORT_ROWS, SEPARATORE_CON, type ColonnaCsv,
} from "./schema/importFormat.ts";

/** Massimo di righe (CSV) o elementi (JSON) in un import. */
export const MAX_RIGHE_IMPORT = 2000;

export interface ErroreRiga {
  /** CSV: numero della riga nel file (1 = intestazione); JSON: posizione nell'array (da 1); 0 = il file intero. */
  riga: number;
  /** Colonna CSV o percorso del campo JSON. */
  campo?: string;
  messaggio: string;
}

/** Un concerto o festival pronto, con le righe da cui viene. */
export interface VoceImport {
  righe: number[];
  entry: EntryInput;
}

export interface AnalisiImport {
  /** Righe lette (CSV, senza intestazione) o elementi (JSON). */
  righe: number;
  voci: VoceImport[];
  errori: ErroreRiga[];
}

/** Sopra CONFIRM_IMPORT_ROWS righe l'import chiede conferma (PIANO §5.7). */
export const serveConferma = (righe: number) => righe > CONFIRM_IMPORT_ROWS;

/* ── campi CSV → forma esterna ─────────────────────────────────── */

/** Il campo di entryInput → la colonna CSV, per gli errori. */
const COLONNA_DI: Record<string, ColonnaCsv> = {
  kind: "tipo", date: "data", artist: "artista", name: "festival", venue: "venue", city: "citta", with: "con",
  voto: "voto", vicinanza: "vicinanza", canzoniNote: "canzoni_note", cost: "costo", gift: "regalo",
  giftFrom: "regalato_da", accredito: "accredito", from: "partenza", comments: "commento",
};

const SI = new Set(["si", "sì", "s", "x", "true", "1", "yes", "y"]);
const NO = new Set(["no", "n", "false", "0"]);

type Valore = { ok: true; v: unknown } | { ok: false; messaggio: string };
const ok = (v: unknown): Valore => ({ ok: true, v });
const ko = (messaggio: string): Valore => ({ ok: false, messaggio });

/** Le conversioni da testo; "" = campo assente. I messaggi non ripetono il valore. */
const CONVERTI: Partial<Record<ColonnaCsv, (s: string) => Valore>> = {
  voto: s => (/^[1-5]$/.test(s) ? ok(Number(s)) : ko("un numero da 1 a 5")),
  vicinanza: s => (/^[1-6]$/.test(s) ? ok(Number(s)) : ko("un numero da 1 (Anello alto) a 6 (Transenna)")),
  canzoni_note: s => (/^[1-5]$/.test(s) ? ok(Number(s)) : s.toLowerCase() === "na" ? ok("na") : ko("un numero da 1 a 5 oppure na")),
  costo: s => {
    if (s.toLowerCase() === "na") return ok("na");
    const n = s.replace(/€/g, "").replace(/\s/g, "").replace(",", ".");
    return /^\d+(\.\d+)?$/.test(n) ? ok(Number(n)) : ko("un prezzo in euro (es. 39,50) oppure na");
  },
  regalo: s => (SI.has(s.toLowerCase()) ? ok(true) : NO.has(s.toLowerCase()) ? ok(undefined) : ko("si oppure vuoto")),
  accredito: s => (SI.has(s.toLowerCase()) ? ok(true) : NO.has(s.toLowerCase()) ? ok(undefined) : ko("si oppure vuoto")),
  con: s => ok(s.split(SEPARATORE_CON).map(x => x.trim()).filter(Boolean)),
};

interface RigaLetta {
  riga: number;
  celle: Partial<Record<ColonnaCsv, string>>;
}

/** Le celle di una riga convertite, o gli errori della riga. */
function converti(r: RigaLetta, colonne: readonly ColonnaCsv[]): { valori: Partial<Record<ColonnaCsv, unknown>>; errori: ErroreRiga[] } {
  const valori: Partial<Record<ColonnaCsv, unknown>> = {};
  const errori: ErroreRiga[] = [];
  for (const c of colonne) {
    const s = (r.celle[c] ?? "").trim();
    if (!s) continue;
    const f = CONVERTI[c];
    if (!f) {
      valori[c] = s;
      continue;
    }
    const x = f(s);
    if (x.ok) valori[c] = x.v;
    else errori.push({ riga: r.riga, campo: c, messaggio: `${c}: serve ${x.messaggio}` });
  }
  return { valori, errori };
}

const def = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as T;

/** Gli errori di entryInput su una voce, riportati alle righe e colonne CSV. */
function erroriZod(righe: number[], esito: ReturnType<typeof entryInput.safeParse>, colonnaDi: (path: PropertyKey[]) => string | undefined): ErroreRiga[] {
  if (esito.success) return [];
  const out: ErroreRiga[] = [];
  for (const issue of esito.error.issues.slice(0, 5)) {
    const { messaggio } = riassumiErroreZod({ issues: [issue] } as never, entryInput);
    const campo = colonnaDi(issue.path);
    // un errore su un concerto del festival va alla sua riga
    const i = issue.path[0] === "concerts" && typeof issue.path[1] === "number" ? issue.path[1] : -1;
    const riga = i >= 0 && righe[i] !== undefined ? righe[i] : righe[0];
    // una sola voce per riga e colonna (una data sbagliata viola più regole)
    if (out.some(e => e.riga === riga && e.campo === campo)) continue;
    out.push({ riga, campo, messaggio: campo ? messaggio.replace(/^input non valido — [^:]+:/, `input non valido — ${campo}:`) : messaggio });
  }
  return out;
}

const colonnaCsvDi = (path: PropertyKey[]): string | undefined => {
  if (path[0] === "concerts") {
    if (path[2] === "date") return "data_concerto";
    if (typeof path[2] === "string") return COLONNA_DI[path[2]];
    return "tipo";
  }
  return typeof path[0] === "string" ? COLONNA_DI[path[0]] : undefined;
};

/* ── CSV ──────────────────────────────────────────────────────── */

export function analizzaCsv(testo: string): AnalisiImport {
  const parsed = Papa.parse<string[]>(testo.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t"],
  });
  const [intestazione = [], ...dati] = parsed.data;
  const errori: ErroreRiga[] = [];
  const nomi = intestazione.map(h => h.trim().toLowerCase());
  const sconosciute = nomi.filter(n => !(COLONNE_CSV as readonly string[]).includes(n));
  const mancanti = (["tipo", "data", "artista", "venue", "citta"] as const).filter(c => !nomi.includes(c));
  if (!nomi.length || sconosciute.length || mancanti.length) {
    const cosa = [
      sconosciute.length ? `${sconosciute.length} colonne sconosciute` : "",
      mancanti.length ? `mancano ${mancanti.join(", ")}` : "",
    ].filter(Boolean).join("; ");
    errori.push({ riga: 1, messaggio: `intestazione non valida (${cosa || "vuota"}): le colonne sono ${COLONNE_CSV.join(",")}` });
    return { righe: dati.length, voci: [], errori };
  }
  if (dati.length > MAX_RIGHE_IMPORT) {
    errori.push({ riga: 0, messaggio: `troppe righe: al massimo ${MAX_RIGHE_IMPORT} per import` });
    return { righe: dati.length, voci: [], errori };
  }
  const colonne = nomi as ColonnaCsv[];
  const righe: RigaLetta[] = dati.map((celle, i) => ({
    riga: i + 2,
    celle: Object.fromEntries(colonne.map((c, j) => [c, celle[j] ?? ""])) as Partial<Record<ColonnaCsv, string>>,
  }));

  // prima i concerti singoli e i gruppi dei festival, nell'ordine del file
  type Gruppo = { righe: RigaLetta[] };
  const ordine: (RigaLetta | Gruppo)[] = [];
  const gruppi = new Map<string, Gruppo>();
  for (const r of righe) {
    if (r.celle.tipo !== undefined && r.celle.tipo.trim().toLowerCase() === "festival") {
      const chiave = CHIAVE_FESTIVAL.map(c => (r.celle[c] ?? "").trim().toLowerCase()).join("\u0000");
      let g = gruppi.get(chiave);
      if (!g) {
        g = { righe: [] };
        gruppi.set(chiave, g);
        ordine.push(g);
      }
      g.righe.push(r);
    } else ordine.push(r);
  }

  const voci: VoceImport[] = [];
  for (const x of ordine) {
    const voce = "righe" in x ? festivalDaGruppo(x.righe, colonne, errori) : concertoDaRiga(x, colonne, errori);
    if (voce) voci.push(voce);
  }
  return { righe: righe.length, voci, errori };
}

function concertoDaRiga(r: RigaLetta, colonne: readonly ColonnaCsv[], errori: ErroreRiga[]): VoceImport | null {
  const tipo = (r.celle.tipo ?? "").trim().toLowerCase();
  if (tipo !== "concerto") {
    errori.push({ riga: r.riga, campo: "tipo", messaggio: "tipo: serve concerto oppure festival" });
    return null;
  }
  const { valori, errori: e } = converti(r, colonne);
  for (const c of ["festival", "data_concerto"] as const) {
    if (valori[c] !== undefined) e.push({ riga: r.riga, campo: c, messaggio: `${c}: vale solo per tipo=festival` });
  }
  if (e.length) {
    errori.push(...e);
    return null;
  }
  const grezzo = def({
    kind: "concert",
    date: valori.data,
    venue: valori.venue,
    city: valori.citta,
    artist: valori.artista,
    with: valori.con ?? [],
    voto: valori.voto,
    vicinanza: valori.vicinanza,
    canzoniNote: valori.canzoni_note,
    cost: valori.costo,
    gift: valori.regalo,
    giftFrom: valori.regalato_da,
    accredito: valori.accredito,
    from: valori.partenza,
    comments: valori.commento,
  });
  const esito = entryInput.safeParse(grezzo);
  if (!esito.success) {
    errori.push(...erroriZod([r.riga], esito, colonnaCsvDi));
    return null;
  }
  return { righe: [r.riga], entry: esito.data };
}

function festivalDaGruppo(gruppo: RigaLetta[], colonne: readonly ColonnaCsv[], errori: ErroreRiga[]): VoceImport | null {
  const numeri = gruppo.map(r => r.riga);
  const convertite = gruppo.map(r => converti(r, colonne));
  const e = convertite.flatMap(c => c.errori);
  // biglietto, viaggio e commento: identici o vuoti in tutto il gruppo
  const comune: Partial<Record<ColonnaCsv, unknown>> = {};
  for (const c of [...COLONNE_DI_GRUPPO, "citta"] as const) {
    const visti = convertite.map(x => x.valori[c]).filter(x => x !== undefined);
    const distinti = new Set(visti.map(x => JSON.stringify(x)));
    if (distinti.size > 1) e.push({ riga: numeri[0], campo: c, messaggio: `${c}: diverso tra le righe dello stesso festival (righe ${numeri.join(", ")}); lascialo uguale o vuoto` });
    comune[c] = visti[0];
  }
  if (gruppo.length < 2) {
    e.push({ riga: numeri[0], campo: "festival", messaggio: "festival: servono almeno 2 righe (una per concerto) con stessi festival, venue e data" });
  }
  if (e.length) {
    errori.push(...e);
    return null;
  }
  const primo = convertite[0].valori;
  const grezzo = def({
    kind: "festival",
    name: primo.festival,
    date: primo.data,
    venue: primo.venue,
    city: comune.citta,
    cost: comune.costo,
    gift: comune.regalo,
    giftFrom: comune.regalato_da,
    accredito: comune.accredito,
    from: comune.partenza,
    comments: comune.commento,
    concerts: convertite.map(({ valori }) =>
      def({
        artist: valori.artista,
        with: valori.con ?? [],
        voto: valori.voto,
        vicinanza: valori.vicinanza,
        canzoniNote: valori.canzoni_note,
        date: valori.data_concerto,
      }),
    ),
  });
  const esito = entryInput.safeParse(grezzo);
  if (!esito.success) {
    errori.push(...erroriZod(numeri, esito, colonnaCsvDi));
    return null;
  }
  return { righe: numeri, entry: esito.data };
}

/* ── JSON ─────────────────────────────────────────────────────── */

export function analizzaJson(testo: string): AnalisiImport {
  let dati: unknown;
  try {
    dati = JSON.parse(testo.replace(/^\uFEFF/, ""));
  } catch {
    return { righe: 0, voci: [], errori: [{ riga: 0, messaggio: "JSON non leggibile: controlla virgole e parentesi" }] };
  }
  if (!Array.isArray(dati)) {
    return { righe: 0, voci: [], errori: [{ riga: 0, messaggio: "il JSON deve essere un array di concerti e festival" }] };
  }
  if (dati.length > MAX_RIGHE_IMPORT) {
    return { righe: dati.length, voci: [], errori: [{ riga: 0, messaggio: `troppi elementi: al massimo ${MAX_RIGHE_IMPORT} per import` }] };
  }
  const voci: VoceImport[] = [];
  const errori: ErroreRiga[] = [];
  dati.forEach((x, i) => {
    const esito = entryInput.safeParse(x);
    if (esito.success) voci.push({ righe: [i + 1], entry: esito.data });
    else {
      for (const issue of esito.error.issues.slice(0, 5)) {
        const { messaggio, campo } = riassumiErroreZod({ issues: [issue] } as never, entryInput);
        if (!errori.some(e => e.riga === i + 1 && e.campo === campo)) errori.push({ riga: i + 1, campo, messaggio });
      }
    }
  });
  return { righe: dati.length, voci, errori };
}

/** Il contenuto di import_concerts, in uno dei due formati. */
export const analizzaImport = (formato: "csv" | "json", contenuto: string): AnalisiImport =>
  formato === "csv" ? analizzaCsv(contenuto) : analizzaJson(contenuto);

/* ── export ───────────────────────────────────────────────────── */

const testoCosto = (c: number | "na" | undefined) => (c === undefined ? "" : String(c));
const si = (b: boolean | undefined) => (b ? "si" : "");

/** Concerti e festival nel CSV di import (un festival = una riga per concerto, biglietto ripetuto). */
export function versoCsv(entries: EntryInput[]): string {
  const righe: Record<ColonnaCsv, string>[] = [];
  for (const e of entries) {
    const evento = {
      data: e.date, venue: e.venue, citta: e.city, costo: testoCosto(e.cost), regalo: si(e.gift),
      regalato_da: e.giftFrom ?? "", accredito: si(e.accredito), partenza: e.from ?? "", commento: e.comments ?? "",
    };
    const fatti = (c: { artist: string; with: string[]; voto?: number; vicinanza?: number; canzoniNote?: number | "na" }) => ({
      artista: c.artist, con: c.with.join(SEPARATORE_CON), voto: c.voto === undefined ? "" : String(c.voto),
      vicinanza: c.vicinanza === undefined ? "" : String(c.vicinanza), canzoni_note: c.canzoniNote === undefined ? "" : String(c.canzoniNote),
    });
    if (e.kind === "concert") righe.push({ tipo: "concerto", data_concerto: "", festival: "", ...evento, ...fatti(e) });
    else for (const c of e.concerts) righe.push({ tipo: "festival", data_concerto: c.date ?? "", festival: e.name, ...evento, ...fatti(c) });
  }
  return Papa.unparse({ fields: [...COLONNE_CSV], data: righe.map(r => COLONNE_CSV.map(c => r[c])) }, { newline: "\n" });
}
