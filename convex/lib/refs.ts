/* ──────────────────────────────────────────────────────────────
   Riferimenti per nome ↔ id (PIANO §1.21). Nel DB persone, partenze,
   venue e "regalato da" sono id; gli input esterni (MCP, import, Oracolo,
   form) usano i nomi, tradotti qui da un unico `resolveRefs`. Un nome
   sconosciuto dà un errore con l'elenco dei nomi VALIDI (mai il valore
   ricevuto).
   ────────────────────────────────────────────────────────────── */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { sortKey } from "../../shared/lib/dates.ts";
import { chiaveNome } from "../../shared/lib/nomi.ts";
import type { EntryInput } from "../../shared/schema/entry.ts";
import { errore } from "./errors.ts";

type Ctx = QueryCtx | MutationCtx;

/** Chiave di confronto dei nomi: minuscole, senza accenti, spazi compressi (la stessa della scheda: shared/lib/nomi.ts). */
export const chiave = chiaveNome;

const elenco = (nomi: string[], max = 60) => {
  const s = [...nomi].sort((a, b) => a.localeCompare(b, "it"));
  return s.length > max ? [...s.slice(0, max), `… (${s.length - max} altri)`] : s;
};

export async function peopleOf(ctx: Ctx, profileId: Id<"profiles">) {
  return await ctx.db.query("people").withIndex("by_profile_name", q => q.eq("profileId", profileId)).collect();
}
export async function departuresOf(ctx: Ctx, profileId: Id<"profiles">) {
  return await ctx.db.query("departures").withIndex("by_profile", q => q.eq("profileId", profileId)).collect();
}
export async function giftersOf(ctx: Ctx, profileId: Id<"profiles">) {
  return await ctx.db.query("gifters").withIndex("by_profile", q => q.eq("profileId", profileId)).collect();
}

export async function venuePerNome(ctx: Ctx, name: string, city: string) {
  return await ctx.db.query("venues").withIndex("by_key", q => q.eq("nameKey", chiave(name)).eq("cityKey", chiave(city))).first();
}

export interface Refs {
  people: Map<string, Id<"people">>;
  departures: Map<string, Id<"departures">>;
  gifters: Map<string, Id<"gifters">>;
  peopleNames: string[];
  departureNames: string[];
  gifterNames: string[];
}

export async function caricaRefs(ctx: Ctx, profileId: Id<"profiles">): Promise<Refs> {
  const [people, deps, gifts] = await Promise.all([peopleOf(ctx, profileId), departuresOf(ctx, profileId), giftersOf(ctx, profileId)]);
  return {
    people: new Map(people.map(p => [chiave(p.name), p._id])),
    departures: new Map(deps.map(d => [chiave(d.name), d._id])),
    gifters: new Map(gifts.map(g => [chiave(g.label), g._id])),
    peopleNames: people.map(p => p.name),
    departureNames: deps.map(d => d.name),
    gifterNames: gifts.map(g => g.label),
  };
}

export function personeDa(refs: Refs, nomi: string[], campo: string): Id<"people">[] {
  return nomi.map((n, i) => {
    const id = refs.people.get(chiave(n));
    if (!id) {
      throw errore("nome_sconosciuto", `${campo}[${i}]: persona sconosciuta; aggiungila prima con add_person (regola: soprannomi o diminutivi, non nome e cognome). Persone valide: ${elenco(refs.peopleNames).join(", ") || "nessuna"}`, { campo: `${campo}.${i}` });
    }
    return id;
  });
}

export function partenzaDa(refs: Refs, nome: string): Id<"departures"> {
  const id = refs.departures.get(chiave(nome));
  if (!id) throw errore("nome_sconosciuto", `from: partenza sconosciuta; aggiungila con add_departure. Partenze valide: ${elenco(refs.departureNames).join(", ") || "nessuna"}`, { campo: "from" });
  return id;
}

export function regaloDa(refs: Refs, label: string): Id<"gifters"> {
  const id = refs.gifters.get(chiave(label));
  if (!id) throw errore("nome_sconosciuto", `giftFrom: "regalato da" sconosciuto; aggiungilo con add_gifter. Validi: ${elenco(refs.gifterNames).join(", ") || "nessuno"}`, { campo: "giftFrom" });
  return id;
}

export async function venueDa(ctx: Ctx, name: string, city: string): Promise<Id<"venues">> {
  const v = await venuePerNome(ctx, name, city);
  if (!v) throw errore("nome_sconosciuto", "venue: non è nel catalogo; cercala con search_venue e aggiungila con add_venue, poi usa il nome e la città con cui compare nel catalogo", { campo: "venue" });
  return v._id;
}

/** Anno e chiave di ordinamento dalla data dell'evento. */
export const tempoDi = (date: string) => {
  const k = sortKey({ date });
  return { sortKey: k, y: Math.floor(k / 10000) };
};

let cidSeq = 0;
export const nuovoCid = () => `c${Date.now().toString(36)}${(cidSeq++ % 1296).toString(36).padStart(2, "0")}`;

/** I campi DB (senza profilo, km e updatedAt) da un input esterno già validato. */
export async function campiDaInput(ctx: Ctx, refs: Refs, input: EntryInput) {
  const venueId = await venueDa(ctx, input.venue, input.city);
  const base = {
    date: input.date,
    ...tempoDi(input.date),
    venueId,
    cost: input.cost,
    gift: input.gift,
    giftFromId: input.giftFrom ? regaloDa(refs, input.giftFrom) : undefined,
    accredito: input.accredito,
    departureId: input.from ? partenzaDa(refs, input.from) : undefined,
    comments: input.comments,
  };
  if (input.kind === "concert") {
    return {
      ...base,
      kind: "concert" as const,
      artist: input.artist,
      with: personeDa(refs, input.with, "with"),
      voto: input.voto,
      vicinanza: input.vicinanza,
      canzoniNote: input.canzoniNote,
    };
  }
  return {
    ...base,
    kind: "festival" as const,
    name: input.name,
    concerts: input.concerts.map((c, i) => ({
      cid: nuovoCid(),
      artist: c.artist,
      with: personeDa(refs, c.with, `concerts.${i}.with`),
      voto: c.voto,
      vicinanza: c.vicinanza,
      canzoniNote: c.canzoniNote,
      date: c.date,
    })),
  };
}

/** Forma esterna (nomi) di un concerto, per agenti ed elenchi. */
export function esterno(
  e: Doc<"entries">,
  n: { people: Map<string, string>; venues: Map<string, Doc<"venues">>; departures: Map<string, string>; gifters: Map<string, string> },
) {
  const v = n.venues.get(e.venueId);
  const nomi = (ids?: Id<"people">[]) => (ids ?? []).map(id => n.people.get(id) ?? "?");
  const base = {
    id: e._id as string,
    kind: e.kind,
    date: e.date,
    venue: v?.name ?? "?",
    city: v?.city ?? "?",
    cost: e.cost,
    gift: e.gift,
    giftFrom: e.giftFromId ? n.gifters.get(e.giftFromId) : undefined,
    accredito: e.accredito,
    from: e.departureId ? n.departures.get(e.departureId) : undefined,
    km: e.km,
    kmPending: e.kmPending,
    comments: e.comments,
  };
  return e.kind === "festival"
    ? { ...base, name: e.name, concerts: (e.concerts ?? []).map(c => ({ artist: c.artist, with: nomi(c.with), voto: c.voto, vicinanza: c.vicinanza, canzoniNote: c.canzoniNote, date: c.date })) }
    : { ...base, artist: e.artist, with: nomi(e.with), voto: e.voto, vicinanza: e.vicinanza, canzoniNote: e.canzoniNote };
}

export async function nomiPerEsterno(ctx: Ctx, profileId: Id<"profiles">, entries: Doc<"entries">[]) {
  const [people, deps, gifts] = await Promise.all([peopleOf(ctx, profileId), departuresOf(ctx, profileId), giftersOf(ctx, profileId)]);
  const venues = new Map<string, Doc<"venues">>();
  for (const id of new Set(entries.map(e => e.venueId))) {
    const v = await ctx.db.get(id);
    if (v) venues.set(id, v);
  }
  return {
    people: new Map(people.map(p => [p._id as string, p.name])),
    departures: new Map(deps.map(d => [d._id as string, d.name])),
    gifters: new Map(gifts.map(g => [g._id as string, g.label])),
    venues,
  };
}
