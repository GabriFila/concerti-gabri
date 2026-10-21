/* ──────────────────────────────────────────────────────────────
   Da `pages.byHandle` (proiezione pubblica di Convex) all'input di
   buildDataset(): gli id di persone, venue, partenze e "regalato da"
   tornano nomi, così le statistiche e l'Oracolo ragionano come sui dati
   statici. Puro e isomorfo (niente convex/* sotto shared/): i tipi qui
   sotto sono strutturali e combaciano con il `returns` di convex/pages.ts.
   ────────────────────────────────────────────────────────────── */

import type { CanzoniNote, Entry, FestivalConcert, GifterInfo, LngLat, Vicinanza, Voto } from "../model/concert.ts";
import type { DatasetInput } from "./dataset.ts";
import { soloHttps } from "./url.ts";

interface Fatti {
  artist: string;
  with: string[];
  voto?: Voto;
  vicinanza?: Vicinanza;
  canzoniNote?: CanzoniNote;
}

export interface PaginaEntry {
  _id: string;
  kind: "concert" | "festival";
  date: string;
  sortKey: number;
  y: number;
  venueId: string;
  cost?: number | "na";
  gift?: boolean;
  giftFromId?: string;
  accredito?: boolean;
  departureId?: string;
  km?: number;
  kmPending?: boolean;
  comments?: string;
  artist?: string;
  with?: string[];
  voto?: Voto;
  vicinanza?: Vicinanza;
  canzoniNote?: CanzoniNote;
  name?: string;
  concerts?: (Fatti & { cid: string; date?: string })[];
}

export interface PaginaPubblica {
  profile: { handle: string; displayName: string; forma: "f" | "m" | "n"; theme: unknown; layout: unknown; extra: unknown };
  entries: PaginaEntry[];
  people: { _id: string; name: string }[];
  gifters: { _id: string; label: string; url?: string; logoUrl?: string }[];
  departures: { _id: string; name: string }[];
  venues: { _id: string; name: string; city: string; lng: number; lat: number }[];
  cities: { name: string; lng: number; lat: number }[];
  wishlist: string[];
}

const def = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as T;

export function pageToDataset(page: PaginaPubblica): DatasetInput {
  const persone = new Map(page.people.map(p => [p._id, p.name]));
  const venues = new Map(page.venues.map(v => [v._id, v]));
  const nomi = (ids: string[] = []) => ids.map(id => persone.get(id) ?? "?");

  const entries: Entry[] = page.entries.map(e => {
    const v = venues.get(e.venueId);
    const evento = def({
      y: e.y,
      date: e.date,
      venue: v?.name ?? "?",
      city: v?.city ?? "?",
      cost: e.cost,
      gift: e.gift,
      giftFrom: e.giftFromId,
      accredito: e.accredito,
      from: e.departureId,
      km: e.km,
      comments: e.comments,
    });
    if (e.kind === "festival") {
      const concerts = (e.concerts ?? []).map(c => def({ artist: c.artist, date: c.date, with: nomi(c.with), voto: c.voto, vicinanza: c.vicinanza, canzoniNote: c.canzoniNote })) as FestivalConcert[];
      return { ...evento, name: e.name ?? "", concerts: concerts as [FestivalConcert, FestivalConcert, ...FestivalConcert[]] };
    }
    return { ...evento, ...def({ artist: e.artist ?? "", with: nomi(e.with), voto: e.voto, vicinanza: e.vicinanza, canzoniNote: e.canzoniNote }) } as Entry;
  });

  return {
    entries,
    // siti e loghi solo https: sono dati degli utenti e finiscono in href/src
    gifters: Object.fromEntries(page.gifters.map(g => [g._id, def({ label: g.label, url: soloHttps(g.url), logo: soloHttps(g.logoUrl) }) as GifterInfo])),
    departures: Object.fromEntries(page.departures.map(d => [d._id, d.name])),
    venueCoords: Object.fromEntries(page.venues.map(v => [v.name, [v.lng, v.lat] as LngLat])),
    cityCoords: Object.fromEntries(page.cities.map(c => [c.name, [c.lng, c.lat] as LngLat])),
    wishlist: page.wishlist,
  };
}
