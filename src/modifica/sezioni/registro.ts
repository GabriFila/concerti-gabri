/* ──────────────────────────────────────────────────────────────
   Il registro di #attivita (spec ux-modifica §6.10), puro: chi ha fatto
   la modifica (le pastiglie), «Solo annullabili», la ricerca nel testo e
   i separatori per giorno («Oggi», «Ieri», «22 ottobre 2026», a Roma).
   Tutto nel browser, sulle voci che activity.list ha già dato.
   ────────────────────────────────────────────────────────────── */

import { todayKey } from "../../../shared/lib/dates.ts";
import { dagliAgenti } from "../shell/distintivi.ts";

/** Il minimo di una voce di activity.list che serve qui. */
export interface VoceRegistro {
  id: string;
  at: number;
  via: string;
  autore: string;
  riassunto: string;
  annullabile: boolean;
  annullata: boolean;
}

export type Chi = "tutte" | "dashboard" | "oracolo" | "agenti" | "sistema";

/** Le pastiglie «Chi ha fatto la modifica», in ordine. */
export const CHI: readonly { valore: Chi; testo: string }[] = [
  { valore: "tutte", testo: "Tutte" },
  { valore: "dashboard", testo: "Dashboard" },
  { valore: "oracolo", testo: "Oracolo" },
  { valore: "agenti", testo: "Agenti" },
  { valore: "sistema", testo: "Sistema" },
];

/** La pastiglia di una voce: MCP e API key sono «Agenti». */
export function chiDi(via: string): Exclude<Chi, "tutte"> {
  if (via === "dashboard" || via === "oracolo") return via;
  if (dagliAgenti(via)) return "agenti";
  return "sistema";
}

/** Si può ancora annullare (il pulsante «Annulla» della riga). */
export const daAnnullare = (v: VoceRegistro): boolean => v.annullabile && !v.annullata;

/** Minuscole e senza accenti: «citta» trova «Città». */
const piana = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export interface FiltriRegistro {
  chi: Chi;
  soloAnnullabili: boolean;
  testo: string;
}

export const FILTRI_VUOTI: FiltriRegistro = { chi: "tutte", soloAnnullabili: false, testo: "" };

export function filtraVoci<V extends VoceRegistro>(voci: readonly V[], f: FiltriRegistro): V[] {
  const cerca = piana(f.testo.trim());
  return voci.filter(
    v =>
      (f.chi === "tutte" || chiDi(v.via) === f.chi) &&
      (!f.soloAnnullabili || daAnnullare(v)) &&
      (!cerca || piana(`${v.riassunto} ${v.autore}`).includes(cerca)),
  );
}

/** Quante voci per pastiglia, con gli altri filtri (annullabili, testo) già applicati. */
export function contaPerChi(voci: readonly VoceRegistro[], f: Omit<FiltriRegistro, "chi">): Record<Chi, number> {
  const out: Record<Chi, number> = { tutte: 0, dashboard: 0, oracolo: 0, agenti: 0, sistema: 0 };
  for (const v of filtraVoci(voci, { ...f, chi: "tutte" })) {
    out.tutte++;
    out[chiDi(v.via)]++;
  }
  return out;
}

/* ── giorni ───────────────────────────────────────────────────── */

const MESE_LUNGO = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Il giorno prima di un AAAAMMGG. */
function ieriDi(k: number): number {
  const d = new Date(Date.UTC(Math.floor(k / 10000), (Math.floor(k / 100) % 100) - 1, k % 100) - 86_400_000);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/** «Oggi», «Ieri» o «22 ottobre 2026» per un giorno AAAAMMGG di Roma. */
export function etichettaGiorno(giorno: number, oggi: number): string {
  if (giorno === oggi) return "Oggi";
  if (giorno === ieriDi(oggi)) return "Ieri";
  return MESE_LUNGO.format(Date.UTC(Math.floor(giorno / 10000), (Math.floor(giorno / 100) % 100) - 1, giorno % 100));
}

export type RigaRegistro<V> = { tipo: "giorno"; chiave: number; etichetta: string } | { tipo: "voce"; voce: V };

/** Le voci (dalla più nuova) con un separatore a ogni cambio di giorno, a Roma. */
export function conGiorni<V extends { at: number }>(voci: readonly V[], adesso: number): RigaRegistro<V>[] {
  const oggi = todayKey(adesso);
  const out: RigaRegistro<V>[] = [];
  let ultimo: number | null = null;
  for (const v of voci) {
    const g = todayKey(v.at);
    if (g !== ultimo) {
      out.push({ tipo: "giorno", chiave: g, etichetta: etichettaGiorno(g, oggi) });
      ultimo = g;
    }
    out.push({ tipo: "voce", voce: v });
  }
  return out;
}
