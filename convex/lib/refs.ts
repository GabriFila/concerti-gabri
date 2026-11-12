/* ──────────────────────────────────────────────────────────────
   Riferimenti per nome ↔ id (PIANO §1.21). Nel DB persone, partenze,
   venue e "regalato da" sono id; gli input esterni (MCP, import, Oracolo,
   form) usano i nomi, tradotti qui da un unico `resolveRefs`. Un nome
   sconosciuto dà un errore con l'elenco dei nomi VALIDI (mai il valore
   ricevuto). Le venue no: con un autore, una venue che non è tra quelle
   del profilo nasce col nome scritto (lib/venueUtente.ts). Ogni profilo ha
   le sue venue: si cercano sempre per (profilo, nome, città).
   L'headliner di un'apertura si indica con l'artista e si cerca tra i
   concerti singoli della stessa data (`headlinerDa`, DECISIONI «Aperture»):
   non trovato o ambiguo è un errore con gli headliner validi di quel giorno.
   ────────────────────────────────────────────────────────────── */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { sortKey } from "../../shared/lib/dates.ts";
import { chiaveNome } from "../../shared/lib/nomi.ts";
import type { EntryInput } from "../../shared/schema/entry.ts";
import { errore } from "./errors.ts";
import type { AutoreLotto } from "./mancanti.ts";
import { venueOCrea } from "./venueUtente.ts";

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

/** La venue di questo profilo con questo nome e città (senza maiuscole e accenti). */
export async function venuePerNome(ctx: Ctx, profileId: Id<"profiles">, name: string, city: string) {
  return await ctx.db
    .query("venues")
    .withIndex("by_profile_key", q => q.eq("profileId", profileId).eq("nameKey", chiave(name)).eq("cityKey", chiave(city)))
    .first();
}

/** Le venue di un profilo. */
export async function venuesOf(ctx: Ctx, profileId: Id<"profiles">) {
  return await ctx.db.query("venues").withIndex("by_profile_key", q => q.eq("profileId", profileId)).collect();
}

export interface Refs {
  profileId: Id<"profiles">;
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
    profileId,
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

export async function venueDa(ctx: Ctx, profileId: Id<"profiles">, name: string, city: string): Promise<Id<"venues">> {
  const v = await venuePerNome(ctx, profileId, name, city);
  if (!v) throw errore("nome_sconosciuto", "venue: non è tra le tue venue; cercala con search_venue e aggiungila con add_venue, poi usa il nome e la città con cui compare", { campo: "venue" });
  return v._id;
}

/** Anno e chiave di ordinamento dalla data dell'evento. */
export const tempoDi = (date: string) => {
  const k = sortKey({ date });
  return { sortKey: k, y: Math.floor(k / 10000) };
};

let cidSeq = 0;
export const nuovoCid = () => `c${Date.now().toString(36)}${(cidSeq++ % 1296).toString(36).padStart(2, "0")}`;

/* ── aperture ─────────────────────────────────────────────────── */

const stessaVenue = (v: Doc<"venues"> | null, venue: string, city: string) => !!v && chiave(v.name) === chiave(venue) && chiave(v.city) === chiave(city);

/**
 * L'headliner di un'apertura: il concerto singolo del profilo (non un
 * festival, non a sua volta un'apertura) della stessa data con l'artista
 * `nome`; se nella data ce n'è più d'uno, decide la venue. Non trovato o
 * ambiguo: errore con gli headliner validi di quel giorno (mai i valori
 * ricevuti). `self` esclude il concerto che si sta modificando.
 */
export async function headlinerDa(
  ctx: Ctx,
  profileId: Id<"profiles">,
  nome: string,
  dove: { date: string; venue?: string; city?: string },
  { campo = "aperturaDi", self }: { campo?: string; self?: Id<"entries"> } = {},
): Promise<Doc<"entries">> {
  const { sortKey: k } = tempoDi(dove.date);
  const stessoGiorno = (await ctx.db.query("entries").withIndex("by_profile_sortKey", q => q.eq("profileId", profileId).eq("sortKey", k)).collect())
    .filter(e => e._id !== self);
  const n = chiave(nome);
  const conNome = stessoGiorno.filter(e => chiave((e.kind === "festival" ? e.name : e.artist) ?? "") === n);
  const validi = stessoGiorno.filter(e => e.kind === "concert" && !e.aperturaDiId);
  let scelti = conNome.filter(e => validi.includes(e));
  if (scelti.length > 1 && dove.venue !== undefined && dove.city !== undefined) {
    const nella = [];
    for (const e of scelti) if (stessaVenue(await ctx.db.get(e.venueId), dove.venue, dove.city)) nella.push(e);
    scelti = nella;
  }
  if (scelti.length === 1) return scelti[0];
  if (scelti.length > 1) {
    throw errore("input_non_valido", `${campo}: in quella data ci sono più concerti di quell'artista; indica la venue dell'headliner`, { campo });
  }
  if (conNome.some(e => e.kind === "festival")) {
    throw errore("input_non_valido", `${campo}: è un festival, e un festival non ha aperture (la lineup le comprende già): aggiungi questo concerto ai concerti del festival`, { campo });
  }
  if (conNome.length) {
    throw errore("input_non_valido", `${campo}: quel concerto è a sua volta un'apertura; indica l'headliner della serata`, { campo });
  }
  const nomi = elenco([...new Set(validi.map(e => e.artist ?? ""))].filter(Boolean));
  throw errore(
    "nome_sconosciuto",
    `${campo}: nessun concerto di quell'artista in quella data (l'headliner dev'essere un concerto singolo già salvato, con la stessa data). Headliner validi in quella data: ${nomi.join(", ") || "nessuno"}`,
    { campo },
  );
}

/**
 * Un'apertura è nella serata del suo headliner: venue, città e partenza
 * scritte nell'input (se ci sono) devono essere le sue. Errore sul campo,
 * senza valori.
 */
export async function controllaSerata(
  ctx: Ctx,
  refs: Refs,
  h: Doc<"entries">,
  input: { date?: string; venue?: string; city?: string; from?: string | null },
  prefisso = "",
) {
  if (input.date !== undefined && tempoDi(input.date).sortKey !== h.sortKey) {
    throw errore("input_non_valido", `${prefisso}date: un'apertura ha la data del suo headliner; cambiala sull'headliner o togli aperturaDi`, { campo: `${prefisso}date` });
  }
  if (input.venue !== undefined || input.city !== undefined) {
    const v = await ctx.db.get(h.venueId);
    if (!stessaVenue(v, input.venue ?? v?.name ?? "", input.city ?? v?.city ?? "")) {
      throw errore("input_non_valido", `${prefisso}venue: un'apertura è nella venue del suo headliner; scrivi la stessa venue e città o togli aperturaDi`, { campo: `${prefisso}venue` });
    }
  }
  if (input.from !== undefined) {
    const dep = input.from === null ? undefined : partenzaDa(refs, input.from);
    if (dep !== h.departureId) {
      throw errore("input_non_valido", `${prefisso}from: un'apertura parte con il suo headliner (stessa partenza, nessun viaggio in più); cambiala sull'headliner o togli aperturaDi`, { campo: `${prefisso}from` });
    }
  }
}

/** I campi della serata che un'apertura prende sempre dal suo headliner. */
export const serataDi = (h: Doc<"entries">) => ({ date: h.date, sortKey: h.sortKey, y: h.y, venueId: h.venueId, departureId: h.departureId });

/**
 * I campi DB (senza profilo, km e updatedAt) da un input esterno già validato.
 * Con `autore` una venue fuori catalogo nasce (venueOCrea); senza, è un errore.
 * Un'apertura (`aperturaDi`) prende data, venue e partenza dal suo headliner.
 */
export async function campiDaInput(ctx: MutationCtx, refs: Refs, input: EntryInput, autore?: AutoreLotto) {
  const h = input.kind === "concert" && input.aperturaDi
    ? await headlinerDa(ctx, refs.profileId, input.aperturaDi, { date: input.date, venue: input.venue, city: input.city })
    : undefined;
  if (h) await controllaSerata(ctx, refs, h, { venue: input.venue, city: input.city, ...(input.from !== undefined ? { from: input.from } : {}) });
  const venueId = h ? h.venueId : autore ? await venueOCrea(ctx, autore, input.venue, input.city) : await venueDa(ctx, refs.profileId, input.venue, input.city);
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
    ...(h ? serataDi(h) : {}),
  };
  if (input.kind === "concert") {
    return {
      ...base,
      kind: "concert" as const,
      artist: input.artist,
      tour: input.tour,
      with: personeDa(refs, input.with, "with"),
      voto: input.voto,
      vicinanza: input.vicinanza,
      canzoniNote: input.canzoniNote,
      aperturaDiId: h?._id,
    };
  }
  return {
    ...base,
    kind: "festival" as const,
    name: input.name,
    concerts: input.concerts.map((c, i) => ({
      cid: nuovoCid(),
      artist: c.artist,
      tour: c.tour,
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
  n: { people: Map<string, string>; venues: Map<string, Doc<"venues">>; departures: Map<string, string>; gifters: Map<string, string>; headliner?: Map<string, string> },
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
    ? { ...base, name: e.name, concerts: (e.concerts ?? []).map(c => ({ artist: c.artist, tour: c.tour, with: nomi(c.with), voto: c.voto, vicinanza: c.vicinanza, canzoniNote: c.canzoniNote, date: c.date })) }
    : {
        ...base,
        artist: e.artist,
        tour: e.tour,
        with: nomi(e.with),
        voto: e.voto,
        vicinanza: e.vicinanza,
        canzoniNote: e.canzoniNote,
        // un'apertura: l'artista dell'headliner (come negli input) e il suo id
        ...(e.aperturaDiId ? { aperturaDi: n.headliner?.get(e.aperturaDiId) ?? "?", aperturaDiId: e.aperturaDiId as string } : {}),
      };
}

export async function nomiPerEsterno(ctx: Ctx, profileId: Id<"profiles">, entries: Doc<"entries">[]) {
  const [people, deps, gifts] = await Promise.all([peopleOf(ctx, profileId), departuresOf(ctx, profileId), giftersOf(ctx, profileId)]);
  const venues = new Map<string, Doc<"venues">>();
  for (const id of new Set(entries.map(e => e.venueId))) {
    const v = await ctx.db.get(id);
    if (v) venues.set(id, v);
  }
  // l'artista dell'headliner di ogni apertura (di solito già tra le righe)
  const headliner = new Map<string, string>();
  const righe = new Map(entries.map(e => [e._id as string, e]));
  for (const id of new Set(entries.flatMap(e => (e.aperturaDiId ? [e.aperturaDiId] : [])))) {
    const h = righe.get(id) ?? (await ctx.db.get(id));
    if (h?.artist) headliner.set(id, h.artist);
  }
  return {
    people: new Map(people.map(p => [p._id as string, p.name])),
    departures: new Map(deps.map(d => [d._id as string, d.name])),
    gifters: new Map(gifts.map(g => [g._id as string, g.label])),
    venues,
    headliner,
  };
}
