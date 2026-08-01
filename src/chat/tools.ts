/* ──────────────────────────────────────────────────────────────
   AI chat: tool definitions shared between the browser and the
   Netlify function. Keep this file free of React/DOM imports —
   the serverless bundle pulls it in too.

   These are TanStack AI *client tools*: no server `execute`, so
   the model's call streams to the browser, runs there (filters,
   scroll), and the result goes back to the model.
   ────────────────────────────────────────────────────────────── */

import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { ALLDATA, CANZONI_NOTE_LABELS, VICINANZA_LABELS, flatConcerts, isFestival, type FlatConcert, type Person } from "../data.ts";

// Single source of truth for the page sections (the TOC adds icons on top).
export const SECTIONS = [
  { id: "sec-kpis", label: "Riepilogo" },
  { id: "sec-andamento", label: "Andamento" },
  { id: "sec-mappa", label: "Dove sono andato" },
  { id: "sec-artisti", label: "Chi ho visto di più" },
  { id: "sec-compagni", label: "Con chi vado di più" },
  { id: "sec-venue", label: "Dove torno più spesso" },
  { id: "sec-vicinanza", label: "Quanto sono vicino" },
  { id: "sec-stagionalita", label: "Quando vado" },
  { id: "sec-giorni", label: "Che giorno esco" },
  { id: "sec-voti", label: "Come li giudico" },
  { id: "sec-voti-migliori", label: "I migliori" },
  { id: "sec-voti-vs", label: "Voto a confronto" },
  { id: "sec-canzoni", label: "Quante canzoni conosco" },
  { id: "sec-spesa", label: "Quanto spendo" },
  { id: "sec-spesa-dettaglio", label: "Quando ho speso di più" },
  { id: "sec-spesa-distribuzione", label: "Quanto pago di solito" },
  { id: "sec-trend", label: "Come cambia nel tempo" },
  { id: "sec-commenti", label: "I miei commenti" }, // hidden when no event has a comment, so this link can be absent
  { id: "sec-archivio", label: "Archivio" },
] as const;

const SECTION_IDS = SECTIONS.map(s => s.id) as [string, ...string[]];

// Every concert flattened out of its event: festival sets count one each,
// with the event's place/date/ticket context attached (see data.ts).
const ALL_CONCERTS = flatConcerts(ALLDATA);

// Vocabularies derived from the data, so the model can only pick real values.
const CITIES = [...new Set(ALLDATA.map(d => d.city))].sort() as [string, ...string[]];
export const COMPANIONS = [...new Set(ALL_CONCERTS.flatMap(c => c.with || []))].sort() as [string, ...string[]];

export const setFiltersDef = toolDefinition({
  name: "set_filters",
  description:
    "Cambia i filtri attivi della dashboard. Ogni grafico della pagina si aggiorna per mostrare solo i concerti corrispondenti. " +
    "I campi omessi mantengono il valore attuale; passa `replace: true` per azzerare prima tutto il resto. " +
    "Restituisce quanti concerti corrispondono dopo il cambiamento.",
  inputSchema: z.object({
    replace: z.boolean().optional().meta({ description: "true = azzera tutti i filtri attuali prima di applicare questi; false/omesso = uniscili a quelli attuali" }),
    status: z.enum(["all", "attended", "planned"]).optional().meta({ description: "attended = già visti, planned = in programma" }),
    dateFrom: z.string().optional().meta({ description: "Solo concerti da questa data in poi, ISO YYYY-MM-DD. La stringa vuota lo azzera." }),
    dateTo: z.string().optional().meta({ description: "Solo concerti fino a questa data compresa, ISO YYYY-MM-DD. La stringa vuota lo azzera." }),
    cities: z.array(z.enum(CITIES)).optional().meta({ description: "Città dei concerti (in OR tra loro). Array vuoto = tutte le città." }),
    people: z.array(z.enum(COMPANIONS)).optional().meta({ description: "Compagni con cui è andato Gabri (in OR tra loro). Array vuoto = chiunque." }),
    solo: z.boolean().optional().meta({ description: "true = solo i concerti visti da solo" }),
    vicinanze: z.array(z.enum(["1", "2", "3", "4", "5", "6"])).optional().meta({ description: "Vicinanza al palco, più alto = più vicino: 6 Transenna, 5 Sottopalco, 4 Centro, 3 Fondo, 2 Tribuna, 1 Anello alto. Array vuoto = tutte." }),
    canzoniNote: z.array(z.enum(["1", "2", "3", "4", "5"])).optional().meta({ description: "\"Canzoni note\" — quanta scaletta Gabri già conosceva: 1 Nessuna, 2 Poche, 3 Circa metà, 4 Quasi tutte, 5 Tutte. Array vuoto = tutte." }),
    price: z.enum(["all", "paid", "gift", "accredito", "unknown"]).optional().meta({ description: "paid = ha un prezzo noto, gift = ricevuto in regalo, accredito = ingresso gratuito con lista/accredito stampa, unknown = nessun prezzo registrato" }),
    costMin: z.number().optional().meta({ description: "Costo minimo del biglietto in euro (vincola solo i concerti con un prezzo noto)" }),
    costMax: z.number().optional().meta({ description: "Costo massimo del biglietto in euro" }),
    kmMin: z.number().optional().meta({ description: "Distanza minima del viaggio di andata in km (vincola solo i concerti con una distanza nota)" }),
    kmMax: z.number().optional().meta({ description: "Distanza massima del viaggio di andata in km" }),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    matchCount: z.number().meta({ description: "Concerti che corrispondono ai nuovi filtri" }),
    summary: z.string().meta({ description: "Riepilogo leggibile dei filtri ora attivi" }),
  }),
});

export const clearFiltersDef = toolDefinition({
  name: "clear_filters",
  description: "Rimuovi ogni filtro attivo, così la dashboard torna a mostrare tutti i concerti.",
  inputSchema: z.object({}),
  outputSchema: z.object({ ok: z.boolean(), matchCount: z.number() }),
});

export const goToSectionDef = toolDefinition({
  name: "go_to_section",
  description:
    "Porta la pagina (dietro la chat) su una delle sue sezioni. " +
    "Dopo averlo chiamato, ricorda all'utente di chiudere la chat per vedere la sezione.",
  inputSchema: z.object({
    section: z.enum(SECTION_IDS).meta({ description: "Id della sezione; l'etichetta accanto a ogni id nel system prompt dice cosa mostra" }),
  }),
  // ok:false = that section is not on the page right now (sec-commenti only shows
  // when at least one evening has a comment): say so, don't claim you scrolled.
  outputSchema: z.object({ ok: z.boolean(), label: z.string() }),
});

export const setThemeDef = toolDefinition({
  name: "set_theme",
  description:
    "Cambia il tema di colore della pagina. Il cambiamento si vede subito, anche dietro la chat aperta.",
  inputSchema: z.object({
    theme: z.enum(["dark", "light", "system"]).meta({ description: "dark = tema scuro, light = tema chiaro, system = segui la preferenza del sistema operativo del visitatore" }),
  }),
  outputSchema: z.object({ ok: z.boolean(), theme: z.enum(["dark", "light", "system"]) }),
});

/* ── query_concerts ────────────────────────────────────────────
   Server tool (execute attached in netlify/functions/chat.mts):
   deterministic counts/sums over ALLDATA, so the model quotes
   computed numbers instead of eyeballing the JSON in its prompt. */

// Same date semantics as App.tsx: first day of a multi-day range,
// and a concert happening today still counts as "planned".
const sortKey = (d: { date: string }) => {
  const m = d.date.match(/(\d{1,2})(?:–\d{1,2})?\/(\d{2})\/(\d{4})/);
  return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 0;
};
const todayKey = () => { const t = new Date(); return t.getFullYear() * 10000 + (t.getMonth() + 1) * 100 + t.getDate(); };
const isPlanned = (d: { date: string }) => sortKey(d) >= todayKey();

const MAX_LISTED_CONCERTS = 200; // > dataset size today; the cap only guards future growth

const queryInputSchema = z.object({
  status: z.enum(["all", "attended", "planned"]).optional().meta({ description: "attended = data precedente a oggi, planned = oggi o dopo. Omesso = tutti. Le domande al passato ('è andato', 'ha visto') vogliono attended." }),
  people: z.array(z.enum(COMPANIONS)).optional().meta({ description: "Nomi esatti dei compagni; seleziona i concerti con almeno uno di loro (OR). Una sola persona = i concerti di quella persona." }),
  solo: z.boolean().optional().meta({ description: "true = solo i concerti visti da solo (senza compagni)" }),
  artist: z.string().optional().meta({ description: "Sottostringa del nome dell'artista, senza distinzione tra maiuscole e minuscole; i nomi dei festival (es. 'MI AMI 2023') selezionano anche ogni set visto lì" }),
  cities: z.array(z.enum(CITIES)).optional().meta({ description: "Città dei concerti (in OR tra loro)" }),
  years: z.array(z.number()).optional().meta({ description: "Anni dei concerti, es. [2025]" }),
  gift: z.boolean().optional().meta({ description: "true = solo i concerti ricevuti in regalo, false = solo i biglietti pagati da lui" }),
  accredito: z.boolean().optional().meta({ description: "true = solo i concerti con ingresso gratuito tramite lista/accredito stampa, false = escludili" }),
  canzoniNote: z.array(z.enum(["1", "2", "3", "4", "5"])).optional().meta({ description: "\"Canzoni note\" — quanta scaletta Gabri già conosceva: 1 Nessuna, 2 Poche, 3 Circa metà, 4 Quasi tutte, 5 Tutte (in OR tra loro)" }),
  groupBy: z.enum(["person", "artist", "year", "city", "venue", "vicinanza", "canzoniNote"]).optional().meta({ description: "Restituisci anche le statistiche per gruppo (conteggio, voto medio, canzoni note medie, costi) sui concerti selezionati (person = una voce per ogni compagno)" }),
  sortGroupsBy: z.enum(["count", "avgVoto", "avgCost", "totalCost", "avgCanzoniNote"]).optional().meta({ description: "Ordinamento decrescente di `groups` (default count). Per le classifiche, scegli la chiave giusta e riporta i gruppi esattamente nell'ordine restituito." }),
});

export type ConcertQuery = z.infer<typeof queryInputSchema>;

export const queryConcertsDef = toolDefinition({
  name: "query_concerts",
  description:
    "L'UNICA fonte dei dati sui concerti. Un CONCERTO è il set di un artista; un festival (es. MI AMI) è un EVENTO/biglietto che contiene più concerti, " +
    "quindi i conteggi sono per concerto mentre i costi sono per biglietto/evento. Restituisce, per i concerti che corrispondono ai filtri (combinati in AND): " +
    "conteggio esatto, divisione già visti/in programma, numero di eventi/biglietti distinti, costo totale e medio del biglietto, voto medio, canzoni note medie, facoltativamente la ripartizione per " +
    "persona/artista/anno/città/locale/vicinanza/canzoniNote, e l'elenco completo in ordine cronologico. " +
    "Chiamalo (anche più di una volta) prima di rispondere a QUALSIASI domanda sui dati.",
  inputSchema: queryInputSchema,
  outputSchema: z.object({
    count: z.number().meta({ description: "Concerti (set) che corrispondono a tutti i filtri — un festival ne conta uno per ogni set visto" }),
    attendedCount: z.number(),
    plannedCount: z.number(),
    eventCount: z.number().meta({ description: "Eventi/biglietti distinti dietro i concerti selezionati (un festival conta una volta sola)" }),
    totalCost: z.number().meta({ description: "Somma dei costi noti dei biglietti sugli eventi selezionati, in euro (il biglietto di un festival conta una volta sola)" }),
    costKnownCount: z.number().meta({ description: "Quanti di quegli eventi/biglietti hanno un costo noto (un biglietto pagato ma di cui Gabri non ricorda più il prezzo qui conta come sconosciuto, e nell'elenco compare come 'prezzo non ricordato')" }),
    avgCost: z.number().nullable().meta({ description: "Costo medio per biglietto/evento, non per concerto" }),
    avgVoto: z.number().nullable().meta({ description: "Voto medio sui concerti selezionati che ne hanno uno" }),
    avgCanzoniNote: z.number().nullable().meta({ description: "Livello medio di canzoni note (1..5) sui concerti selezionati che ne hanno uno" }),
    groups: z.array(z.object({
      key: z.string(),
      count: z.number(),
      totalCost: z.number(),
      avgCost: z.number().nullable(),
      avgVoto: z.number().nullable(),
      avgCanzoniNote: z.number().nullable(),
    })).optional().meta({ description: "Già ordinati per sortGroupsBy (decrescente): una classifica pronta. count = concerti; i costi = biglietti distinti del gruppo" }),
    concerts: z.array(z.string()).meta({ description: "In ordine cronologico; ogni riga è 'data · artista[ (nome del festival)] · locale (città) · con compagni|da solo[ · N€][ · regalo][ · accredito][ · voto N][ · canzoni note ETICHETTA][ · in programma][ · commento: \"…\"]'. I set di festival mostrano il festival tra parentesi e nessun costo per set: il biglietto appartiene all'intero evento. Il commento è l'osservazione in testo libero che Gabri ha scritto sulla SERATA (il commento di un festival vale per tutto il festival, quindi i suoi set lo ripetono): citalo, non parafrasarlo mai in fatti nuovi." }),
    concertsTruncated: z.boolean(),
  }),
});

/* Called by the model when a data question cannot be computed with
   query_concerts. Server-side execute (in chat.mts) logs it, so the
   function logs double as a wishlist of missing chat capabilities. */
export const reportUnsupportedDef = toolDefinition({
  name: "report_unsupported_query",
  description:
    "Segnala una domanda sui dati che query_concerts non riesce a calcolare (manca un filtro, un'aggregazione o una funzionalità). " +
    "Chiamalo INVECE di tirare a indovinare, poi di' all'utente che non puoi calcolarlo e che può chiedere a Gabri di estendere la chat.",
  inputSchema: z.object({
    question: z.string().meta({ description: "La domanda dell'utente, così come l'ha posta" }),
    missing: z.string().meta({ description: "Breve descrizione della funzionalità mancante, es. 'costo mediano', 'filtro per giorno della settimana'" }),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
});

const round2 = (n: number) => Math.round(n * 100) / 100;

export function runConcertQuery(q: ConcertQuery) {
  const artist = q.artist?.trim().toLowerCase();
  // per concert: festival sets match individually. The artist filter also
  // matches the festival's own name ("mi ami" finds every set watched there);
  // gift/accredito are ticket facts, so they come from the owning event.
  const matches = ALL_CONCERTS.filter(c => {
    if (q.status === "attended" && isPlanned(c)) return false;
    if (q.status === "planned" && !isPlanned(c)) return false;
    if (q.people?.length && !q.people.some(p => (c.with || []).includes(p as Person))) return false;
    if (q.solo && (c.with || []).length > 0) return false;
    if (artist && !c.artist.toLowerCase().includes(artist) && !(isFestival(c.ev) && c.ev.name.toLowerCase().includes(artist))) return false;
    if (q.cities?.length && !q.cities.includes(c.city)) return false;
    if (q.years?.length && !q.years.includes(c.y)) return false;
    if (q.gift !== undefined && !!c.ev.gift !== q.gift) return false;
    if (q.accredito !== undefined && !!c.ev.accredito !== q.accredito) return false;
    if (q.canzoniNote?.length && !q.canzoniNote.includes(String(c.canzoniNote) as "1")) return false;
    return true;
  });

  // voto/canzoni are per concert; money is per ticket, so cost figures run
  // over the DISTINCT events behind the given concerts (a festival counts once)
  const costVotoStats = (list: FlatConcert[]) => {
    const events = [...new Set(list.map(c => c.ev))];
    const withCost = events.filter(d => typeof d.cost === "number");
    const withVoto = list.filter(c => typeof c.voto === "number");
    const withCN = list.filter(c => typeof c.canzoniNote === "number");
    const totalCost = withCost.reduce((s, d) => s + (d.cost as number), 0);
    return {
      eventCount: events.length,
      totalCost: round2(totalCost),
      costKnownCount: withCost.length,
      avgCost: withCost.length ? round2(totalCost / withCost.length) : null,
      avgVoto: withVoto.length ? round2(withVoto.reduce((s, c) => s + (c.voto as number), 0) / withVoto.length) : null,
      avgCanzoniNote: withCN.length ? round2(withCN.reduce((s, c) => s + (c.canzoniNote as number), 0) / withCN.length) : null,
    };
  };

  type Group = { key: string; count: number; totalCost: number; avgCost: number | null; avgVoto: number | null; avgCanzoniNote: number | null };
  let groups: Group[] | undefined;
  if (q.groupBy) {
    const keysOf = (c: FlatConcert): string[] =>
      q.groupBy === "person" ? (c.with || [])
      : q.groupBy === "artist" ? [c.artist]
      : q.groupBy === "year" ? [String(c.y)]
      : q.groupBy === "city" ? [c.city]
      : q.groupBy === "venue" ? [c.venue]
      : q.groupBy === "canzoniNote" ? [typeof c.canzoniNote === "number" ? `${c.canzoniNote} (${CANZONI_NOTE_LABELS[c.canzoniNote]})` : String(c.canzoniNote ?? "non impostata")]
      : [typeof c.vicinanza === "number" ? `${c.vicinanza} (${VICINANZA_LABELS[c.vicinanza]})` : String(c.vicinanza ?? "non impostata")];
    const byKey = new Map<string, FlatConcert[]>();
    for (const c of matches) for (const k of keysOf(c)) byKey.set(k, [...(byKey.get(k) || []), c]);
    const sortBy = q.sortGroupsBy || "count";
    groups = [...byKey.entries()]
      .map(([key, list]) => {
        const { costKnownCount: _ignored, eventCount: _ignored2, ...stats } = costVotoStats(list);
        return { key, count: list.length, ...stats };
      })
      .sort((a, b) =>
        ((b[sortBy] ?? -Infinity) - (a[sortBy] ?? -Infinity)) || (b.count - a.count) || a.key.localeCompare(b.key));
  }

  return {
    count: matches.length,
    attendedCount: matches.filter(c => !isPlanned(c)).length,
    plannedCount: matches.filter(c => isPlanned(c)).length,
    ...costVotoStats(matches),
    ...(groups ? { groups } : {}),
    concerts: matches.slice(0, MAX_LISTED_CONCERTS).map(c =>
      `${c.date} · ${c.artist}${isFestival(c.ev) ? ` (${c.ev.name})` : ""} · ${c.venue} (${c.city})` +
      ` · ${c.with?.length ? `con ${c.with.join(", ")}` : "da solo"}` +
      (typeof c.cost === "number" ? ` · ${c.cost}€` : c.cost === "na" ? " · prezzo non ricordato" : "") +
      (c.gift ? " · regalo" : "") +
      (c.accredito ? " · accredito" : "") +
      (typeof c.voto === "number" ? ` · voto ${c.voto}` : "") +
      (typeof c.canzoniNote === "number" ? ` · canzoni note ${CANZONI_NOTE_LABELS[c.canzoniNote]}` : "") +
      (isPlanned(c) ? " · in programma" : "") +
      // the comment lives on the event; flattened to one line so a line stays one concert
      (c.ev.comments?.trim() ? ` · commento: "${c.ev.comments.trim().replace(/\s+/g, " ")}"` : "")),
    concertsTruncated: matches.length > MAX_LISTED_CONCERTS,
  };
}

export const chatToolDefs = [setFiltersDef, clearFiltersDef, goToSectionDef, setThemeDef];
