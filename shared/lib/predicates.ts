/* Predicati e accessori sui concerti e sugli eventi. Puri: niente stato
   globale, "oggi" arriva sempre come parametro. */

import { isFestival, type Entry, type GifterInfo } from "../model/concert.ts";
import { isPlanned } from "./dates.ts";

/* Vista strutturale comune alle righe (Entry) e ai concerti appiattiti
   (FlatConcert): i campi che leggono i predicati trasversali. */
export type Datum = {
  y: number; date: string; venue: string; city: string;
  cost?: number | "na"; gift?: boolean; giftFrom?: string; accredito?: boolean; from?: string; km?: number;
  artist?: string; with?: string[];
  voto?: number; vicinanza?: number; canzoniNote?: number | "na";
};

/* I fatti per concerto che legge un filtro: li ha un Concert, un
   FestivalConcert o un FlatConcert (nessun campo dell'evento). */
export type PerConcert = { with?: string[]; voto?: number; vicinanza?: number; canzoniNote?: number | string };

// costo: il prezzo tutto compreso di un posto, in euro. Senza prezzo noto il
// concerto resta fuori da ogni statistica sui soldi.
export const hasCost = <T extends { cost?: number | "na" }>(d: T): d is T & { cost: number } => typeof d.cost === "number";
// `cost:"na"` = biglietto pagato, prezzo dimenticato: resta fuori dai soldi
// come uno sconosciuto, cambia solo cosa mostra la tabella.
export const isCostNa = <T extends { cost?: number | "na" }>(d: T): boolean => d.cost === "na";
// regali, accrediti e sconosciuti non entrano mai nelle statistiche sui soldi
export const isGift = <T extends { gift?: boolean }>(d: T): d is T & { gift: true } => d.gift === true;
export const isAccredito = <T extends { accredito?: boolean }>(d: T): d is T & { accredito: true } => d.accredito === true;

// voto 1..5, solo dopo il concerto
export const hasVoto = <T extends { voto?: number }>(d: T): d is T & { voto: number } => typeof d.voto === "number";
// vicinanza 1..6 (più alto = più vicino): valore vero, entra nel recap
export const hasVic = <T extends { vicinanza?: number }>(d: T): d is T & { vicinanza: number } => typeof d.vicinanza === "number";
// canzoni note 1..5 ("na" e assenti restano fuori)
export const hasCN = <T extends { canzoniNote?: number | string }>(d: T): d is T & { canzoniNote: number } => typeof d.canzoniNote === "number";

/* Partenza del viaggio: come voto e vicinanza si può impostare anche dopo
   l'evento (assente = non ancora definita). I km sono precalcolati e salvati
   per concerto: nessuna coordinata di partenza né formula di distanza vive
   nel codice dell'app. */
export const hasFrom = <T extends { from?: string }>(d: T): d is T & { from: string } => typeof d.from === "string" && d.from.length > 0;
// km di sola andata da casa; null se la partenza non è nota o i km mancano
export const distKm = (d: Datum): number | null => hasFrom(d) && typeof d.km === "number" ? d.km : null;

// segnalazioni di manutenzione: concerti GIÀ passati senza un valore
export const fromMissing = (d: Datum, today: number) => !isPlanned(d, today) && !hasFrom(d);
export const vicMissing = (c: Datum, today: number) => !isPlanned(c, today) && !hasVic(c);
export const votoMissing = (c: Datum, today: number) => !isPlanned(c, today) && !hasVoto(c);

// commenti: testo libero sulla SERATA, vive sull'evento. Vuoto = assente.
export const commentOf = (e: Entry): string => (e.comments || "").trim();
export const hasComment = (e: Entry): boolean => commentOf(e).length > 0;
// come archivio e card dei commenti intitolano un evento: artista o nome del festival
export const eventTitle = (e: Entry): string => isFestival(e) ? e.name : e.artist;
// etichetta di una riga: un concerto singolo mostra l'artista, un festival il nome
export const labelOf = (e: Entry): string => isFestival(e) ? e.name : e.artist;
// nome del festival di un concerto (vuoto per un concerto singolo)
export const festName = (e: Entry): string => isFestival(e) ? e.name : "";

// tooltip del regalo: nomina chi l'ha fatto, se noto
export const giftTitle = <T extends { giftFrom?: string }>(d: T, gifters: Record<string, GifterInfo>): string => {
  const g = d.giftFrom ? gifters[d.giftFrom] : undefined;
  return g ? "Regalo da " + g.label : "Regalo";
};
