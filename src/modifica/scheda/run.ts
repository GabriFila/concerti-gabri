/* ──────────────────────────────────────────────────────────────
   Il run della chat in scrittura visto dalle schede: le interruzioni da
   risolvere (useChat di TanStack AI), se sta rispondendo, gli errori di
   una ripresa e come mandare un messaggio («Chiedi di rifarla»). Lo
   fornisce ChatScrittura; le schede lo leggono con useRun().
   ────────────────────────────────────────────────────────────── */

import { createContext, useContext } from "react";
import type { BoundInterrupts } from "@tanstack/ai-client";
import type { ParteScheda } from "./bozza.ts";

/** Un errore della ripresa del run (interruptErrors di useChat). */
export interface ErroreRipresa {
  code: string;
  retryable: boolean;
  interruptIds: readonly string[];
}

export interface RunChat {
  interruzioni: BoundInterrupts;
  /** Sta rispondendo, o sta partendo una ripresa (il salvataggio di una scheda). */
  caricando: boolean;
  erroriRipresa: readonly ErroreRipresa[];
  /** Rimanda la ripresa fallita (retryInterrupts). */
  riprova(): void;
  /** La route ha rifiutato la conversazione perché troppo lunga (413): riprovare non serve. */
  troppoLunga: boolean;
  /** «Nuova chat», con la stessa domanda se c'è una scheda modificata. */
  nuovaChat(): void;
  /** Manda un messaggio come dalla casella (con l'instradamento delle schede). */
  invia(testo: string): void;
  /** Le schede ancora da decidere nel run: con più di una i pulsanti dicono di quale si parla. */
  schedeNelRun: number;
  /** Le schede da decidere, nell'ordine della chat: id della chiamata → la sua interruzione. */
  schede: ReadonlyMap<string, Risolvibile>;
  /** Le altre approvazioni del run ancora da decidere (una cancellazione, un annullamento…). */
  altre: readonly Risolvibile[];
  /** Le schede (propose_concert) del run in corso, nell'ordine della chat: per la barra del lotto dopo il Salva. */
  partiDelRun: readonly ParteScheda[];
  /** Le approvazioni lasciate cadere scrivendo un altro messaggio (stop()). */
  abbandonate: ReadonlySet<string>;
  /** Un annuncio cortese per gli screen reader (una scheda nuova non prende il focus). */
  annuncia(testo: string): void;
  /** Le chiamate del run in corso (dopo l'ultimo messaggio dell'utente): solo loro possono essere «in arrivo». */
  delRun: ReadonlySet<string>;
}

const VUOTO: RunChat = {
  interruzioni: [],
  caricando: false,
  erroriRipresa: [],
  riprova: () => {},
  troppoLunga: false,
  nuovaChat: () => {},
  invia: () => {},
  schedeNelRun: 0,
  schede: new Map(),
  altre: [],
  partiDelRun: [],
  abbandonate: new Set(),
  annuncia: () => {},
  delRun: new Set(),
};

export const RunContesto = createContext<RunChat>(VUOTO);
export const useRun = () => useContext(RunContesto);

/** Un'interruzione generica (gli strumenti stanno sul server): si risolve con la busta così com'è. */
export type Risolvibile = { interruptId: string; status: string; canResolve: boolean; resolveInterrupt(p: unknown): void; clearResolution(): void };
export const risolvibile = (i: unknown) => i as Risolvibile;
