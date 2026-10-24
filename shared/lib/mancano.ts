/* ──────────────────────────────────────────────────────────────
   Cosa manca a un concerto o festival, in italiano: lo stesso elenco per il
   riquadro "da completare" della dashboard, la scheda dell'Oracolo e il
   risultato di propose_concert (che il modello legge per fare UNA domanda).

   - Passato: voto, posizione, canzoni note (per concerto: in un festival
     contati, «voto (2 concerti)»), partenza se manca `from`.
   - In programma: solo partenza (e prezzo).
   - «prezzo» solo con `{prezzo: true}` (scheda e Oracolo): senza costo,
     regalo o accredito. Il riquadro della dashboard non lo chiede.
   Puro e isomorfo.
   ────────────────────────────────────────────────────────────── */

import { isPlanned } from "./dates.ts";

/** I fatti di un concerto (singolo o set di un festival) che servono qui. */
interface FattiPerMancano {
  voto?: unknown;
  vicinanza?: unknown;
  canzoniNote?: unknown;
}

/** Un evento nella forma esterna (nomi), o una riga di entries.list. */
export interface EventoPerMancano extends FattiPerMancano {
  date: string;
  cost?: unknown;
  gift?: boolean;
  accredito?: boolean;
  from?: string;
  concerts?: readonly FattiPerMancano[];
}

/** Cosa manca, già in italiano: "voto", "posizione", "canzoni note", "partenza", "prezzo". */
export function mancanoDi(evento: EventoPerMancano, oggi: number, { prezzo }: { prezzo: boolean }): string[] {
  const festival = Array.isArray(evento.concerts);
  const concerti: readonly FattiPerMancano[] = festival ? evento.concerts! : [evento];
  const mancano: string[] = [];
  if (!isPlanned(evento, oggi)) {
    const conta = (nome: string, manca: (c: FattiPerMancano) => boolean) => {
      const n = concerti.filter(manca).length;
      if (n) mancano.push(festival ? `${nome} (${n} ${n === 1 ? "concerto" : "concerti"})` : nome);
    };
    conta("voto", c => c.voto === undefined);
    conta("posizione", c => c.vicinanza === undefined);
    conta("canzoni note", c => c.canzoniNote === undefined);
  }
  if (!evento.from) mancano.push("partenza");
  if (prezzo && evento.cost === undefined && !evento.gift && !evento.accredito) mancano.push("prezzo");
  return mancano;
}
