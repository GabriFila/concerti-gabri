/* ──────────────────────────────────────────────────────────────
   Le schede aperte nella chat dell'Oracolo in scrittura (spec ux-agente
   §9.3): uno store a livello di modulo, per id della chiamata
   (toolCallId), letto con useSyncExternalStore. Sta fuori da React così
   la bozza sopravvive a un pannello chiuso e riaperto, e il contenitore
   può contare le schede aperte (useSchedeAperte).

   - Ogni scheda tiene i valori della bozza (gli stessi tipi del form dei
     concerti), l'evento di partenza per una modifica, cosa ha toccato il
     proprietario, le sue scelte sui nomi, e a che punto è (inviata,
     scartata, corretta, annullata).
   - Con più schede nel run ognuna dice se è «Da salvare» (`inclusa`) e
     se è pronta (`bloccata`, scritto dalla scheda): la barra del lotto
     (BarraSchede.tsx) le salva o le scarta tutte insieme.
   - Solo memoria: niente localStorage (una bozza ha nomi di persone).
   - «Nuova chat» e il cambio di chat passano da `puoLasciareLaChat()`:
     con una scheda modificata e non salvata chiede prima.
   ────────────────────────────────────────────────────────────── */

import { useMemo, useSyncExternalStore } from "react";
import { dopoDi, type Bozza, type CampoScheda, type Fratello } from "./bozza.ts";
import type { ValoriConcerto, ValoriFestival } from "../sezioni/forme.ts";

type Candidato = { ref: string; name: string; city: string; featureType: "poi" | "city"; label: string };

/** La ricerca della venue di una scheda (una volta sola: geo.searchVenue ha un limite). */
export interface RicercaVenue {
  /** "venue città" cercata. */
  query: string;
  stato: "in_corso" | "fatta" | "errore";
  candidati: Candidato[];
  attribuzione: string;
  /** Trovata nel catalogo del server (con il suo nome e la sua città). */
  trovata?: boolean;
  /** Senza città, più venue del catalogo con quel nome (in città diverse): si sceglie, mai a caso. */
  omonime?: { id: string; name: string; city: string }[];
}

export interface VoceScheda extends Bozza {
  /** Il proprietario l'ha cambiata (i suoi valori vanno anche nella `bozza` di una correzione). */
  modificata: boolean;
  /** I campi cambiati a mano (✎ «modificato da te»). */
  toccati: CampoScheda[];
  /** La riga aperta (una alla volta). */
  editorAperto: CampoScheda | null;
  /** Com'era prima di aprire la riga: «Esc» ci torna. */
  primaDellEditor?: Pick<VoceScheda, "valori" | "toccati" | "modificata">;
  /** Chiavi dei nomi nuovi confermati così come sono («È una persona nuova», «Va bene così»). */
  nomiOk: string[];
  /** Le chiavi dei doppioni lasciati così («È un altro concerto»). */
  doppioniOk: string[];
  /** Il concerto del festival aperto nella lineup (uno alla volta). */
  setAperto: number | null;
  /** In un lotto (più schede nel run): la casella «Da salvare». */
  inclusa: boolean;
  /** La scheda non si può ancora salvare (Da sistemare, o nomi e venue ancora da controllare): la scrive la scheda. */
  bloccata?: boolean;
  /** Quante cose ha da sistemare. */
  nProblemi?: number;
  ricercaVenue?: RicercaVenue;
  /** Una venue appena aggiunta al catalogo: si usa quando arriva nell'elenco. */
  venueInArrivo?: string;
  /** Salva premuto: la risposta sta arrivando. */
  inviata: boolean;
  /** Scarta premuto. */
  scartata: boolean;
  /** Le parole scritte nella chat mentre la scheda era aperta (la correzione). */
  notaInviata?: string;
  /** Annullata da qui (activity.undo). */
  annullata: boolean;
  /** Già annunciata agli screen reader («Nuova scheda: …»). */
  annunciata?: boolean;
  /** Salvata da qui e la conferma ha già preso il focus. */
  confermata?: boolean;
}

const schede = new Map<string, VoceScheda>();
const ascolta = new Set<() => void>();
/** Le schede che aspettano una decisione nel run (le dice la chat). */
let aperte: readonly string[] = [];
let chiedi: ((azione: string) => Promise<boolean>) | null = null;
/** Cresce a ogni cambiamento di una scheda qualsiasi. */
let versione = 0;

const avvisa = () => {
  versione++;
  ascolta.forEach(f => f());
};
const iscrivi = (f: () => void) => {
  ascolta.add(f);
  return () => {
    ascolta.delete(f);
  };
};

/** La scheda di una chiamata (o undefined se non è ancora iniziata). */
export const leggi = (id: string): VoceScheda | undefined => schede.get(id);

/**
 * La crea dalla bozza se non c'è già (la proposta arriva una volta, le
 * modifiche restano). Si chiama durante il render della scheda: non avvisa
 * nessuno, la scheda la legge subito dopo.
 */
export function inizia(id: string, b: Bozza): VoceScheda {
  const c = schede.get(id);
  if (c) return c;
  const v: VoceScheda = {
    ...b, modificata: false, toccati: [], editorAperto: null, nomiOk: [], doppioniOk: [], setAperto: null, inclusa: true, inviata: false, scartata: false, annullata: false,
  };
  schede.set(id, v);
  return v;
}

/** Aggiorna una scheda (sempre un oggetto nuovo: è quello che vede React). */
export function aggiorna(id: string, f: (v: VoceScheda) => Partial<VoceScheda>) {
  const c = schede.get(id);
  if (!c) return;
  schede.set(id, { ...c, ...f(c) });
  avvisa();
}

/** Un valore cambiato a mano: la scheda diventa «modificata» e il campo prende la ✎. */
export function cambia(id: string, campo: CampoScheda, f: (v: VoceScheda) => Partial<Bozza["valori"]>) {
  aggiorna(id, v => ({
    valori: { ...v.valori, ...f(v) } as Bozza["valori"],
    modificata: true,
    toccati: v.toccati.includes(campo) ? v.toccati : [...v.toccati, campo],
  }));
}

/** Apre una riga (e chiude le altre), ricordando i valori per «Esc»; null chiude. Nella lineup, `set` è il concerto aperto. */
export function apriEditor(id: string, campo: CampoScheda | null, set: number | null = null) {
  aggiorna(id, v => ({
    editorAperto: campo,
    setAperto: campo === "concerts" ? set : null,
    primaDellEditor: campo ? { valori: v.valori, toccati: v.toccati, modificata: v.modificata } : undefined,
  }));
}

/** «Esc»: la riga si chiude e torna com'era quando si è aperta. */
export function annullaEditor(id: string) {
  aggiorna(id, v => ({ ...(v.primaDellEditor ?? {}), editorAperto: null, setAperto: null, primaDellEditor: undefined }));
}

/** Cambia la scheda intera (festival ↔ concerto, «Aggiorna quello», «Usa nella scheda»): modificata, editor chiusi. */
export function rimpiazza(id: string, b: Partial<Bozza>, toccati: readonly CampoScheda[] = []) {
  aggiorna(id, v => ({
    ...b,
    modificata: true,
    toccati: [...new Set([...v.toccati, ...toccati])],
    editorAperto: null,
    setAperto: null,
    primaDellEditor: undefined,
  }));
}

/** La scheda di una chiamata, dal vivo. */
export function useScheda(id: string): VoceScheda | undefined {
  return useSyncExternalStore(iscrivi, () => schede.get(id), () => undefined);
}

/** Quante schede aspettano una decisione (per il distintivo del contenitore). */
export function useSchedeAperte(): number {
  return useSyncExternalStore(iscrivi, () => aperte.length, () => 0);
}

/** Chi guarda più schede insieme (la barra del lotto) si aggiorna a ogni cambiamento. */
export function useVersioneSchede(): number {
  return useSyncExternalStore(iscrivi, () => versione, () => 0);
}

/** Il titolo e il giorno di una scheda nuova (per i doppioni tra schede dello stesso run). */
function fratelloDi(id: string): Fratello | null {
  const v = schede.get(id);
  if (!v || v.id) return null;
  const titolo = (v.tipo === "festival" ? (v.valori as ValoriFestival).name : (v.valori as ValoriConcerto).artist).trim();
  return titolo ? { id, tipo: v.tipo, titolo, data: dopoDi(v).date } : null;
}

/** Le schede nuove `ids` (quelle aperte prima di questa), dal vivo: cambiano solo se cambiano titolo, tipo o giorno. */
export function useFratelli(ids: readonly string[]): Fratello[] {
  const chiave = useSyncExternalStore(
    iscrivi,
    () => JSON.stringify(ids.map(fratelloDi).filter(Boolean)),
    () => "[]",
  );
  return useMemo(() => JSON.parse(chiave) as Fratello[], [chiave]);
}

/** La chat dice quali schede (id delle chiamate) aspettano una decisione nel run. */
export function impostaAperte(ids: readonly string[]) {
  if (ids.length === aperte.length && ids.every((x, i) => x === aperte[i])) return;
  aperte = ids;
  avvisa();
}

/** C'è una scheda ancora da decidere e modificata a mano? */
export const haModificate = () => aperte.some(id => schede.get(id)?.modificata);

/** La chat registra come chiedere conferma («Hai una scheda non salvata: la scarti?»). */
export function registraDomanda(f: ((azione: string) => Promise<boolean>) | null) {
  chiedi = f;
}

/**
 * Prima di «Nuova chat» o di un'altra chat: true se si può andare (nessuna
 * bozza modificata, o scartarla va bene). `azione` completa il pulsante
 * «Scarta e …».
 */
export function puoLasciareLaChat(azione = "apri una nuova chat"): Promise<boolean> {
  if (!haModificate() || !chiedi) return Promise.resolve(true);
  return chiedi(azione);
}

/** Tutte via (nuova chat, altra chat). */
export function svuota() {
  schede.clear();
  aperte = [];
  avvisa();
}
