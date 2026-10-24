/* ──────────────────────────────────────────────────────────────
   Il ponte verso il form di un concerto (spec ux-modifica §6.3): chi sta
   dentro /<handle>/modifica (la chat dell'Oracolo, la wishlist, «Duplica»)
   apre il pannello del concerto con dei valori proposti e aspetta come
   finisce.

     const esito = await useEditorConcerti().apri({ tipo: "concert", bozza: { artist: "Verdena" }, origine: "oracolo" });
     // { esito: "salvato", id, kmPending } | { esito: "usato", valori } | { esito: "chiuso" }

   - Porta a #concerti e apre `?nuovo=concerto|festival` o `?apri=<id>`:
     l'URL ha solo l'id, la bozza resta in memoria (mai nell'URL, nella
     cronologia o nel localStorage).
   - La bozza si unisce ai valori del concerto (valoriConcerto/
     valoriFestival di forme.ts): date ISO, nomi per venue, città,
     compagni, partenza e "regalato da".
   - `modo: "scheda"` (il «Modulo completo» della scheda dell'Oracolo,
     riconciliazione §2): titolo «Scheda: nuovo concerto», piede «Torna
     alla scheda» / «Usa nella scheda», e all'invio la stessa validazione
     ma NESSUNA scrittura: l'esito è `{ esito: "usato", valori }`. Le
     persone nuove restano chip «nuova» (non si creano); le venue del
     catalogo si aggiungono come sempre.
   - Se c'è già un pannello con modifiche non salvate, passa dalla sua
     guardia («Modifiche non salvate»): anche quando è lo stesso pannello
     (un'altra bozza su «Nuovo concerto», il «Modulo completo» di
     un'altra scheda). Ogni apertura con qualcosa da portare (bozza,
     evidenza, origine, modo scheda) rifà il pannello da capo: il suo
     numero sta nello stato della cronologia (`mfApertura`, mai
     nell'URL) e nella key del pannello. Solo un `apri({ tipo, id })`
     nudo sul pannello già aperto nudo lo lascia com'è.
   - La promessa si risolve quando il pannello si chiude: «salvato» se il
     form ha scritto, «usato» se ha restituito i valori alla scheda,
     altrimenti «chiuso» (con `sostituito` se un'altra apertura ha preso
     il suo posto: chi aspettava non riprenda il focus). Anche quando
     resta lo stesso pannello ma cambia il numero nello stato (un
     «Aggiungi un concerto» a mano, che apre senza numero): quello del
     ponte non c'è più.
   ────────────────────────────────────────────────────────────── */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import type { ValoriConcerto, ValoriFestival } from "./sezioni/forme.ts";
import { useVista, type StatoModifica } from "./useVista.ts";
import { haPannello, type Parametri } from "./vista.ts";

export interface AperturaConcerto {
  tipo: "concert" | "festival";
  /** Un concerto o festival esistente da modificare; assente = nuovo. */
  id?: string;
  /** Valori proposti, sopra quelli del concerto (o del form vuoto). Solo in memoria. */
  bozza?: Partial<ValoriConcerto> | Partial<ValoriFestival>;
  /** Nomi dei campi di TanStack Form proposti dall'Oracolo (es. "artist", "concerts[1].voto"). */
  evidenzia?: string[];
  origine?: "oracolo" | "wishlist" | "duplica" | "dacompletare";
  /** "salva" (predefinito) scrive; "scheda" restituisce i valori alla scheda dell'Oracolo senza scrivere. */
  modo?: "salva" | "scheda";
}

export type EsitoConcerto =
  | { esito: "salvato"; id: string; kmPending: boolean }
  | { esito: "usato"; valori: ValoriConcerto | ValoriFestival }
  | { esito: "chiuso"; sostituito?: true };

interface Voce {
  apertura: AperturaConcerto;
  risolvi: (e: EsitoConcerto) => void;
  /** Il numero dell'apertura (`mfApertura` nello stato della cronologia, e la key del pannello); 0 = aperto a mano. */
  n: number;
}

interface ApiEditor {
  apri(a: AperturaConcerto): Promise<EsitoConcerto>;
  /** L'apertura del pannello di concerti aperto adesso, se è passata da `apri`. */
  aperto: AperturaConcerto | null;
}

interface EditorInterno extends ApiEditor {
  /** Il numero dell'apertura del pannello aperto (0 = aperto a mano): nella key di ConcertoPannello, così una bozza nuova lo rifà da capo. */
  numero: number;
  /** Il form ha salvato: risolve la promessa del pannello aperto. */
  salvato(id: string, kmPending: boolean): void;
  /** Il form in modo scheda ha restituito i valori (niente scritture). */
  usato(valori: ValoriConcerto | ValoriFestival): void;
  /** La guardia ha tenuto aperto il pannello di prima: l'apertura chiesta non arriva. */
  rinuncia(): void;
}

const Contesto = createContext<EditorInterno | null>(null);

/** La chiave del pannello di concerti nei parametri di #concerti (o null se non ce n'è uno). */
export const chiavePannello = (p: Parametri): string | null => (p.apri ? `apri:${p.apri}` : p.nuovo ? `nuovo:${p.nuovo}` : null);
const chiaveDi = (a: AperturaConcerto) => (a.id ? `apri:${a.id}` : `nuovo:${a.tipo === "festival" ? "festival" : "concerto"}`);
/** Un'apertura senza niente da portare (solo tipo e id): sul pannello già aperto non cambia niente. */
const nuda = (a: AperturaConcerto) => !a.bozza && !a.evidenzia?.length && !a.origine && (a.modo ?? "salva") === "salva";
const CHIUSO: EsitoConcerto = { esito: "chiuso" };
const SOSTITUITO: EsitoConcerto = { esito: "chiuso", sostituito: true };

export function EditorProvider({ children }: { children: ReactNode }) {
  const { vista, parametri, vai, apriPannello } = useVista();
  const numeroUrl = useLocation({ select: l => (l.state as StatoModifica).mfApertura });
  // chiesta e non ancora arrivata nell'URL; e quella del pannello aperto
  const [attesa, setAttesa] = useState<Voce | null>(null);
  const [corrente, setCorrente] = useState<Voce | null>(null);
  const correnteRef = useRef(corrente);
  correnteRef.current = corrente;
  const attesaRef = useRef(attesa);
  attesaRef.current = attesa;
  // i numeri delle aperture: partono dall'ora, così una voce della cronologia di prima di un ricaricamento non coincide
  const contatore = useRef(Date.now());

  const chiave = vista === "concerti" ? chiavePannello(parametri) : null;
  const arrivata = (v: Voce | null) => !!v && chiave === chiaveDi(v.apertura) && numeroUrl === v.n;
  // il pannello aperto è ancora quello della voce: stessa chiave e stesso numero (0 = aperto a mano, senza numero nello stato)
  const ancora = (v: Voce | null) => !!v && chiave === chiaveDi(v.apertura) && (numeroUrl ?? 0) === v.n;

  // l'URL è arrivato (pannello e numero): l'attesa diventa il pannello aperto; un pannello che sparisce si risolve «chiuso»
  useEffect(() => {
    const a = attesaRef.current;
    const c = correnteRef.current;
    if (a && chiave === chiaveDi(a.apertura) && numeroUrl === a.n) {
      if (c && c !== a) c.risolvi(SOSTITUITO);
      correnteRef.current = a;
      attesaRef.current = null;
      setCorrente(a);
      setAttesa(null);
    } else if (c && !ancora(c)) {
      c.risolvi(CHIUSO);
      correnteRef.current = null;
      setCorrente(null);
    }
  }, [chiave, numeroUrl]);

  const apri = useCallback(
    (a: AperturaConcerto) =>
      new Promise<EsitoConcerto>(risolvi => {
        attesaRef.current?.risolvi(SOSTITUITO);
        attesaRef.current = null;
        const c = correnteRef.current;
        const cAperta = c && chiaveDi(c.apertura) === chiave ? c : null;
        const stesso = chiaveDi(a) === chiave;
        if (stesso && nuda(a) && (!cAperta || nuda(cAperta.apertura))) {
          // è già aperto e non c'è niente da portare: questa promessa prende il posto di quella di prima (il form resta com'è)
          c?.risolvi(SOSTITUITO);
          const voce = { apertura: a, risolvi, n: cAperta?.n ?? numeroUrl ?? 0 };
          correnteRef.current = voce;
          setAttesa(null);
          setCorrente(voce);
          return;
        }
        const voce = { apertura: a, risolvi, n: ++contatore.current };
        attesaRef.current = voce;
        setAttesa(voce);
        const p: Parametri = a.id ? { apri: a.id } : { nuovo: a.tipo === "festival" ? "festival" : "concerto" };
        void (async () => {
          // da un'altra vista senza pannelli: prima #concerti (al posto della voce corrente), poi il pannello sopra
          if (vista !== "concerti" && !haPannello(parametri)) await vai("concerti", {}, { sostituisci: true, tieniStato: true });
          // lo stesso pannello con altri valori: cambia solo il numero nello stato, al posto della voce, e la guardia decide lo stesso
          await apriPannello(p, "concerti", { apertura: voce.n, sostituisci: stesso });
        })();
      }),
    [vista, parametri, chiave, numeroUrl, vai, apriPannello],
  );

  const salvato = useCallback((id: string, kmPending: boolean) => {
    const c = correnteRef.current;
    c?.risolvi({ esito: "salvato", id, kmPending });
  }, []);

  const usato = useCallback((valori: ValoriConcerto | ValoriFestival) => {
    correnteRef.current?.risolvi({ esito: "usato", valori });
  }, []);

  const rinuncia = useCallback(() => {
    const a = attesaRef.current;
    if (!a) return;
    a.risolvi(CHIUSO);
    attesaRef.current = null;
    setAttesa(null);
  }, []);

  // il pannello aperto: l'attesa appena arrivata, o quella di prima finché l'URL non cambia (una bozza nuova non lo cambia sotto il form)
  const voce = arrivata(attesa) ? attesa : ancora(corrente) ? corrente : null;
  const aperto = voce?.apertura ?? null;
  const numero = voce?.n ?? 0;

  const valore = useMemo<EditorInterno>(() => ({ apri, aperto, numero, salvato, usato, rinuncia }), [apri, aperto, numero, salvato, usato, rinuncia]);
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>;
}

function useInterno(): EditorInterno {
  const c = useContext(Contesto);
  if (!c) throw new Error("useEditorConcerti fuori da /<handle>/modifica (EditorProvider)");
  return c;
}

/** Il pannello dei concerti (ConcertoPannello): salvataggi, valori restituiti alla scheda e rinunce. */
export const useEditorInterno = useInterno;

const nulla = () => {};

/**
 * Per la guardia di ogni pannello (ui/Pannello.tsx): «Continua a
 * modificare» vuol dire che l'apertura chiesta dal ponte non arriva, e
 * la sua promessa si risolve «chiuso» (anche dal pannello di una persona
 * o di un "regalato da").
 */
export function useRinunciaEditor(): () => void {
  return useContext(Contesto)?.rinuncia ?? nulla;
}

/** Aprire il form di un concerto con una bozza e aspettare l'esito. */
export function useEditorConcerti(): ApiEditor {
  const { apri, aperto } = useInterno();
  return { apri, aperto };
}
