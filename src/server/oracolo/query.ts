/* ──────────────────────────────────────────────────────────────
   query_concerts: conteggi e somme deterministici sui dati della pagina,
   così il modello cita numeri calcolati invece di stimarli.

   Stessa semantica delle date della pagina: primo giorno di un evento su più
   giorni, e un concerto di oggi conta ancora come "in programma". `today`
   arriva da chi chiama (giorno a Roma), mai dall'orologio qui dentro.
   ────────────────────────────────────────────────────────────── */

import { z } from "zod";
import { isFestival, type FlatConcert } from "../../../shared/model/concert.ts";
import { CANZONI_NOTE_LABELS, VICINANZA_LABELS, canzoniNoteScale } from "../../../shared/model/scale.ts";
import { isPlanned } from "../../../shared/lib/dates.ts";
import type { Dataset } from "../../../shared/lib/dataset.ts";
import { enumOrString, type ChatVocab } from "../../chat/tools.ts";

export const MAX_LISTED_CONCERTS = 200; // > dataset size today; the cap only guards future growth

export function queryInputSchema(vocab: ChatVocab) {
  return z.object({
    status: z.enum(["all", "attended", "planned"]).optional().meta({ description: "attended = date before today, planned = today or later. Omitted = all. Past-tense questions ('è andato', 'ha visto') want attended." }),
    people: z.array(enumOrString(vocab.companions)).optional().meta({ description: "Exact companion names; matches concerts with at least one of them (OR). One person = that person's concerts." }),
    solo: z.boolean().optional().meta({ description: "true = only concerts attended alone (no companions)" }),
    artist: z.string().optional().meta({ description: "Case-insensitive substring match on the artist name; festival names (e.g. 'MI AMI 2023') also match every set watched there" }),
    cities: z.array(enumOrString(vocab.cities)).optional().meta({ description: "Concert cities (OR between them)" }),
    years: z.array(z.number()).optional().meta({ description: "Concert years, e.g. [2025]" }),
    gift: z.boolean().optional().meta({ description: "true = only concerts received as a present, false = only paid/own tickets" }),
    accredito: z.boolean().optional().meta({ description: "true = only concerts with free entry via guest list/press pass (accredito), false = exclude them" }),
    canzoniNote: z.array(z.enum(["1", "2", "3", "4", "5"])).optional().meta({ description: `"Canzoni note" — how much of the setlist the page owner already knew: ${canzoniNoteScale()} (OR between them)` }),
    groupBy: z.enum(["person", "artist", "year", "city", "venue", "vicinanza", "canzoniNote"]).optional().meta({ description: "Also return per-group stats (count, avg voto, avg canzoni note, costs) over the matching concerts (person = one entry per companion)" }),
    sortGroupsBy: z.enum(["count", "avgVoto", "avgCost", "totalCost", "avgCanzoniNote"]).optional().meta({ description: "Descending sort of `groups` (default count). For rankings, pick the right key and report the groups exactly in the returned order." }),
  });
}

export type ConcertQuery = z.infer<ReturnType<typeof queryInputSchema>>;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function runConcertQuery(ds: Dataset, q: ConcertQuery, today: number) {
  const planned = (d: { date: string }) => isPlanned(d, today);
  const artist = q.artist?.trim().toLowerCase();
  // per concert: festival sets match individually. The artist filter also
  // matches the festival's own name ("mi ami" finds every set watched there);
  // gift/accredito are ticket facts, so they come from the owning event.
  const matches = ds.flat.filter(c => {
    if (q.status === "attended" && planned(c)) return false;
    if (q.status === "planned" && !planned(c)) return false;
    if (q.people?.length && !q.people.some(p => (c.with || []).includes(p))) return false;
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
    attendedCount: matches.filter(c => !planned(c)).length,
    plannedCount: matches.filter(c => planned(c)).length,
    ...costVotoStats(matches),
    ...(groups ? { groups } : {}),
    concerts: matches.slice(0, MAX_LISTED_CONCERTS).map(c =>
      `${c.date} · ${c.artist}${isFestival(c.ev) ? ` (${c.ev.name})` : ""} · ${c.venue} (${c.city})` +
      ` · ${c.with?.length ? `con ${c.with.join(", ")}` : "da solo"}` +
      (typeof c.cost === "number" ? ` · ${c.cost}€` : c.cost === "na" ? " · prezzo non ricordato" : "") +
      (c.gift ? (c.giftFrom && ds.gifters[c.giftFrom] ? ` · regalo di ${ds.gifters[c.giftFrom].label}` : " · regalo") : "") +
      (c.accredito ? " · accredito" : "") +
      (typeof c.voto === "number" ? ` · voto ${c.voto}` : "") +
      (typeof c.canzoniNote === "number" ? ` · canzoni note ${CANZONI_NOTE_LABELS[c.canzoniNote]}` : "") +
      (planned(c) ? " · in programma" : "") +
      // the comment lives on the event; flattened to one line so a line stays one concert
      (c.ev.comments?.trim() ? ` · commento: "${c.ev.comments.trim().replace(/\s+/g, " ")}"` : "")),
    concertsTruncated: matches.length > MAX_LISTED_CONCERTS,
  };
}
