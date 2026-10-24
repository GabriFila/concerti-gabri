/* ──────────────────────────────────────────────────────────────
   I segni sulla navigazione di /<handle>/modifica (spec ux-modifica
   §4.4): quanto c'è da fare e cosa è cambiato, accanto alle voci.

   - Concerti: quanti passati sono da completare (lo stesso conto del
     riquadro «Da completare», daCompletare di forme.ts), in ambra.
   - Wishlist, Persone, Regalato da: quanti sono, in grigio.
   - Partenze: un punto ambra se una partenza senza indirizzo tiene dei
     concerti coi km in attesa (solo nomi e stato: mai indirizzi).
   - Attività: un punto teal se l'Oracolo o un agente hanno scritto dopo
     l'ultima visita ad «Attività» (l'id della voce più nuova vista, nel
     localStorage del browser).

   Puro (distintivi.test.ts); i dati arrivano dalle sottoscrizioni dello
   scheletro (useDistintivi.ts).
   ────────────────────────────────────────────────────────────── */

import { chiaveNome, daCompletare, type EventoUi } from "../sezioni/forme.ts";
import type { IdVista } from "../vista.ts";

export interface Distintivo {
  /** ambra: c'è da fare; teal: novità degli agenti; muto: solo un conteggio. */
  tono: "ambra" | "teal" | "muto";
  /** Il numero accanto alla voce; assente = un punto. */
  conta?: number;
  /** Il testo per lo screen reader (i conteggi muti non ne hanno: sono solo un promemoria). */
  sr?: string;
}

export type Distintivi = Partial<Record<IdVista, Distintivo>>;

/** Chi conta come «agente» nel registro. */
const AGENTI = new Set(["oracolo", "mcp", "apikey"]);

/** Quanti concerti passati aspettano voto, posizione, canzoni note o partenza. */
export const quantiDaCompletare = (eventi: EventoUi[], oggi: number): number => daCompletare(eventi, oggi).length;

/** Una partenza senza indirizzo tiene dei concerti coi km in attesa. */
export function partenzaDaImpostare(partenze: readonly { name: string; stato: string }[], eventi: readonly EventoUi[]): boolean {
  const mancanti = new Set(partenze.filter(p => p.stato === "mancante").map(p => chiaveNome(p.name)));
  if (!mancanti.size) return false;
  return eventi.some(e => !!e.kmPending && !!e.from && mancanti.has(chiaveNome(e.from)));
}

/** Una voce scritta dall'Oracolo o da un agente (MCP, API key). */
export const dagliAgenti = (via: string): boolean => AGENTI.has(via);

/**
 * Gli id delle voci dell'Oracolo e degli agenti più nuove dell'ultima
 * vista (le voci arrivano dalla più nuova). `vistoId` null: «Attività» mai
 * aperta qui (valgono tutte); un id che non è più nella finestra è più
 * vecchio di tutte. Le usano il punto teal e i segni «nuova» del registro.
 */
export function nuoveDagliAgenti(voci: readonly { id: string; via: string }[], vistoId: string | null): string[] {
  const i = vistoId === null ? -1 : voci.findIndex(v => v.id === vistoId);
  const nuove = i === -1 ? voci : voci.slice(0, i);
  return nuove.filter(v => dagliAgenti(v.via)).map(v => v.id);
}

/** Quante sono (il punto teal su «Attività»). */
export const novitaAgenti = (voci: readonly { id: string; via: string }[], vistoId: string | null): number => nuoveDagliAgenti(voci, vistoId).length;

export interface DatiDistintivi {
  eventi?: EventoUi[];
  wishlist?: readonly unknown[];
  persone?: readonly unknown[];
  regali?: readonly unknown[];
  partenze?: readonly { name: string; stato: string }[];
  voci?: readonly { id: string; via: string }[];
  /** undefined finché non si è letto il localStorage. */
  vistoId?: string | null;
  /** «oggi» a Roma (todayKey). */
  oggi: number;
}

/** I segni di tutte le voci, con i dati che ci sono già (gli altri arrivano dopo). */
export function calcolaDistintivi(d: DatiDistintivi): Distintivi {
  const out: Distintivi = {};
  if (d.eventi) {
    const n = quantiDaCompletare(d.eventi, d.oggi);
    if (n) out.concerti = { tono: "ambra", conta: n, sr: `${n} da completare` };
  }
  const muto = (id: IdVista, l: readonly unknown[] | undefined) => {
    if (l?.length) out[id] = { tono: "muto", conta: l.length };
  };
  muto("wishlist", d.wishlist);
  muto("persone", d.persone);
  muto("regali", d.regali);
  if (d.partenze && d.eventi && partenzaDaImpostare(d.partenze, d.eventi)) out.partenze = { tono: "ambra", sr: "indirizzo da impostare" };
  if (d.voci && d.vistoId !== undefined && novitaAgenti(d.voci, d.vistoId) > 0) out.attivita = { tono: "teal", sr: "modifiche nuove dagli agenti" };
  return out;
}
