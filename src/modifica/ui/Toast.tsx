/* ──────────────────────────────────────────────────────────────
   Le notifiche di /<handle>/modifica (spec ux-modifica §5.4): l'esito di
   ogni scrittura in basso a sinistra (sul telefono sopra la barra in
   basso), con «Annulla» quando si può.

   - La regione «Notifiche» sta fuori da ogni sezione e non è role=status:
     lo è ogni notifica, così `getByRole("status").filter({ hasText })`
     ne trova una sola. Al massimo tre; restano 6 s, 10 s se hanno
     un'azione, ferme finché il puntatore o il focus ci sono sopra. Non
     prendono mai il focus. Un aggiornamento che toglie il pulsante col
     focus («Annulla» → «Annullato.») non manda blur: il tempo riparte lo
     stesso, e il focus va al titolo della vista invece di restare sul
     <body>.
   - `useScrittura()` sostituisce useOperazione per le scritture: gli
     errori restano nella sezione (in linea, mai qui); a buon fine la
     notifica, e con `annullabile` la voce del registro da annullare
     (annulla.ts: il registro prima e dopo). «Annulla» chiama
     activity.undo; se la voce non si trova, «Apri Attività».
   - Mai «Annulla» per i loghi, l'indirizzo di una partenza, l'handle (la
     pagina si ricarica) e l'import (che ha il suo «Annulla l'import»).
   - Il testo è quello dell'esito, mai un valore privato (gli indirizzi
     non entrano mai in una notifica).
   - Con un pannello non modale aperto le notifiche non coprono il suo
     piede («Annulla», «Salva»): stanno nella colonna dell'elenco se ci
     entrano, altrimenti sopra il piede (useRiparo).
   ────────────────────────────────────────────────────────────── */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../../convex/_generated/api";
import { Icon } from "../../ui/Icon.tsx";
import { voceDaAnnullare } from "../annulla.ts";
import { erroreDi, frase, useConvex, type ErroreUi } from "../sezioni/comuni.tsx";
import { useVista } from "../useVista.ts";

export interface AzioneToast {
  etichetta: string;
  onClick: () => void | Promise<void>;
}

export interface ContenutoToast {
  testo: string;
  azioni?: AzioneToast[];
}

interface Toast extends ContenutoToast {
  id: number;
  /** Cambia a ogni aggiornamento: il tempo riparte. */
  versione: number;
}

interface ApiToast {
  /** Mostra una notifica; restituisce il suo id (per aggiornarla). */
  mostra(t: ContenutoToast): number;
  aggiorna(id: number, t: ContenutoToast): void;
  chiudi(id: number): void;
}

interface ToastInterno extends ApiToast {
  toast: Toast[];
  /** Le voci del registro già legate a una notifica: una scrittura dopo non le riprende. */
  rivendicate: Set<string>;
}

const MASSIMO = 3;
const DURATA = 6000;
const DURATA_CON_AZIONE = 10_000;

/** La chiave della sottoscrizione dello scheletro al registro (useDistintivi, Attività). */
export const ARGOMENTI_REGISTRO = { input: { limite: 30 } } as const;

const Contesto = createContext<ToastInterno | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast[]>([]);
  const prossimo = useRef(1);
  const rivendicate = useRef(new Set<string>());

  const mostra = useCallback((t: ContenutoToast) => {
    const id = prossimo.current++;
    setToast(ts => [...ts, { ...t, id, versione: 0 }].slice(-MASSIMO));
    return id;
  }, []);
  const aggiorna = useCallback((id: number, t: ContenutoToast) => {
    setToast(ts => ts.map(x => (x.id === id ? { ...t, id, versione: x.versione + 1 } : x)));
  }, []);
  const chiudi = useCallback((id: number) => setToast(ts => ts.filter(x => x.id !== id)), []);

  const valore = useMemo<ToastInterno>(() => ({ toast, mostra, aggiorna, chiudi, rivendicate: rivendicate.current }), [toast, mostra, aggiorna, chiudi]);
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>;
}

function useInterno(): ToastInterno {
  const c = useContext(Contesto);
  if (!c) throw new Error("useToast fuori da /<handle>/modifica (ToastProvider)");
  return c;
}

/** Mostrare una notifica (testo ed eventuali azioni). */
export function useToast(): ApiToast {
  const { mostra, aggiorna, chiudi } = useInterno();
  return useMemo(() => ({ mostra, aggiorna, chiudi }), [mostra, aggiorna, chiudi]);
}

/** La regione delle notifiche (la mette lo scheletro, fuori dalle sezioni). */
export function RegioneToast() {
  const { toast, chiudi } = useInterno();
  const riparo = useRiparo(toast.length > 0);
  return (
    <div className="mf-toasts" role="region" aria-label="Notifiche" style={riparo}>
      {toast.map(t => <VoceToast key={t.id} t={t} onChiudi={() => chiudi(t.id)} />)}
    </div>
  );
}

/** Lo stesso margine e la stessa larghezza massima di .mf-toasts (modifica.css). */
const MARGINE = 24;
const LARGHEZZA = 460;
/** Sotto questa larghezza la colonna dell'elenco non basta: la notifica va sopra il piede del pannello. */
const COLONNA_MINIMA = 280;

/**
 * Con un pannello non modale aperto (da 1024 px; il CSS non conosce la sua
 * larghezza) la regione non va sul piede del pannello: in coda «Salva e
 * vai al prossimo» la notifica del concerto di prima cadrebbe proprio su
 * «Annulla» e «Salva» del prossimo, e un clic su «Salva» annullerebbe il
 * salvataggio di prima. Nella colonna dell'elenco a sinistra se ci sta,
 * altrimenti (il pannello prende tutta la colonna) sopra il piede. Le
 * misure si prendono solo mentre c'è una notifica.
 */
function useRiparo(attiva: boolean): CSSProperties | undefined {
  const [stile, setStile] = useState<CSSProperties>();
  useLayoutEffect(() => {
    const cont = document.getElementById("mf-pannelli");
    if (!attiva || !cont) {
      setStile(undefined);
      return;
    }
    const ro = new ResizeObserver(() => misura());
    function misura() {
      const d = cont!.querySelector<HTMLElement>(':scope > dialog.mf-pannello[data-modo="laterale"][open]');
      if (!d) return setStile(undefined);
      const r = cont!.getBoundingClientRect();
      // il bordo sinistro del pannello, che sta a destra in #mf-pannelli (offsetWidth: senza la sua animazione d'entrata)
      const bordo = r.right - d.offsetWidth;
      const libero = bordo - MARGINE - (r.left + MARGINE);
      if (libero >= COLONNA_MINIMA) return setStile({ width: Math.min(LARGHEZZA, libero) });
      const piede = d.querySelector<HTMLElement>(".mf-pannello-piedi");
      if (piede) ro.observe(piede);
      setStile({ left: bordo + 16, width: Math.min(LARGHEZZA, d.offsetWidth - 32), bottom: window.innerHeight - r.bottom + (piede?.offsetHeight ?? 0) + 12 });
    }
    misura();
    ro.observe(cont);
    // un pannello che si apre o si chiude (i pannelli e le finestre stanno direttamente in #mf-pannelli)
    const figli = new MutationObserver(misura);
    figli.observe(cont, { childList: true });
    const aperti = new MutationObserver(misura);
    aperti.observe(cont, { subtree: true, attributes: true, attributeFilter: ["open"] });
    window.addEventListener("resize", misura);
    return () => {
      ro.disconnect();
      figli.disconnect();
      aperti.disconnect();
      window.removeEventListener("resize", misura);
    };
  }, [attiva]);
  return stile;
}

function VoceToast({ t, onChiudi }: { t: Toast; onChiudi: () => void }) {
  const [ferma, setFerma] = useState({ sopra: false, focus: false });
  const [inCorso, setInCorso] = useState(false);
  // il testo entra un attimo dopo l'elemento: gli screen reader annunciano meglio un cambio che una regione nuova già piena
  const [pronta, setPronta] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setPronta(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const chiudiRef = useRef(onChiudi);
  chiudiRef.current = onChiudi;
  const ref = useRef<HTMLDivElement>(null);
  const conFocus = useRef(false);
  conFocus.current = ferma.focus;
  // finita un'azione, il pulsante col focus può essere sparito («Annulla» → «Annullato.») o spento senza blur (Chrome non lo manda):
  // il tempo riparte, e il focus non resta sul <body> ma va al titolo della vista, come quando si chiude un pannello
  useEffect(() => {
    if (inCorso || !conFocus.current) return;
    const att = document.activeElement;
    if (ref.current?.contains(att)) return;
    setFerma(f => ({ ...f, focus: false }));
    if (!att || att === document.body) document.querySelector<HTMLElement>("section.mf-vista:not([hidden]) h1")?.focus({ preventScroll: true });
  }, [t.versione, inCorso]);
  const durata = t.azioni?.length ? DURATA_CON_AZIONE : DURATA;
  // il tempo che resta: si ferma col puntatore o il focus sopra, riparte da capo a ogni aggiornamento
  const resta = useRef(durata);
  useEffect(() => {
    resta.current = durata;
  }, [t.versione, durata]);
  useEffect(() => {
    if (ferma.sopra || ferma.focus || inCorso) return;
    const inizio = Date.now();
    const timer = setTimeout(() => chiudiRef.current(), resta.current);
    return () => {
      clearTimeout(timer);
      resta.current = Math.max(1500, resta.current - (Date.now() - inizio));
    };
  }, [ferma.sopra, ferma.focus, inCorso, t.versione]);

  const esegui = async (a: AzioneToast) => {
    setInCorso(true);
    try {
      await a.onClick();
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div
      ref={ref}
      className="mf-toast"
      role="status"
      onMouseEnter={() => setFerma(f => ({ ...f, sopra: true }))}
      onMouseLeave={() => setFerma(f => ({ ...f, sopra: false }))}
      onFocus={() => setFerma(f => ({ ...f, focus: true }))}
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFerma(f => ({ ...f, focus: false }));
      }}
    >
      <p className="mf-toast-testo">{pronta ? t.testo : ""}</p>
      {pronta && t.azioni?.map(a => (
        <button key={a.etichetta} type="button" className="mf-toast-azione" disabled={inCorso} onClick={() => void esegui(a)}>
          {a.etichetta}
        </button>
      ))}
      <button type="button" className="mf-toast-chiudi" aria-label="Chiudi la notifica" title="Chiudi la notifica" onClick={onChiudi}>
        <Icon name="close" size={15} stroke={2} />
      </button>
    </div>
  );
}

/* ── scritture ────────────────────────────────────────────────── */

export interface OpzioniScrittura<T> {
  /** Il testo della notifica a buon fine; assente = nessuna notifica (la pagina si ricarica, per esempio). */
  successo?: string | ((r: T) => string);
  /** Si annulla dal registro (activity.undo): «Annulla» nella notifica. */
  annullabile?: boolean;
  /** Le tabelle del registro che la scrittura tocca (annulla.ts). */
  tabelle?: string[];
  /** Azioni in più nella notifica, prima di «Annulla» (es. «Imposta l'indirizzo»). */
  azioni?: AzioneToast[] | ((r: T) => AzioneToast[]);
}

/**
 * Una scrittura con lo stato «in corso», l'ultimo errore (da mostrare in
 * linea con <Errore>) e la notifica dell'esito. `esegui` restituisce il
 * risultato appena la scrittura è fatta (undefined se è fallita): la
 * notifica arriva da sola subito dopo, anche se chi l'ha chiamata si è
 * già smontato (un pannello che si chiude).
 */
export function useScrittura() {
  const convex = useConvex();
  const qc = useQueryClient();
  const interno = useInterno();
  const { vai } = useVista();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<ErroreUi | null>(null);

  // in un ref: la notifica parte dopo, con le funzioni di quel momento
  const ctx = useRef({ convex, interno, vai });
  ctx.current = { convex, interno, vai };

  const esegui = useCallback(
    async <T,>(f: () => Promise<T>, o: OpzioniScrittura<T>): Promise<T | undefined> => {
      // la voce più nuova del registro prima di scrivere (undefined: il registro non è ancora arrivato)
      const registro = qc.getQueryData<{ voci: { id: string }[] }>(convexQuery(api.activity.list, ARGOMENTI_REGISTRO as never).queryKey);
      const primaId = registro ? (registro.voci[0]?.id ?? null) : undefined;
      setInCorso(true);
      setErrore(null);
      let r: T;
      try {
        r = await f();
      } catch (e) {
        setErrore(erroreDi(e));
        return undefined;
      } finally {
        setInCorso(false);
      }
      void notifica(ctx.current, r, o, primaId);
      return r;
    },
    [qc],
  );

  return { esegui, inCorso, errore, setErrore };
}

async function notifica<T>(
  { convex, interno, vai }: { convex: ReturnType<typeof useConvex>; interno: ToastInterno; vai: ReturnType<typeof useVista>["vai"] },
  r: T,
  o: OpzioniScrittura<T>,
  primaId: string | null | undefined,
) {
  if (o.successo === undefined) return;
  const testo = typeof o.successo === "function" ? o.successo(r) : o.successo;
  const extra = typeof o.azioni === "function" ? o.azioni(r) : (o.azioni ?? []);
  if (!o.annullabile) {
    interno.mostra({ testo, azioni: extra });
    return;
  }
  const apriAttivita: AzioneToast = { etichetta: "Apri Attività", onClick: () => void vai("attivita") };
  let voce: { id: string; riassunto: string } | null = null;
  if (primaId !== undefined) {
    try {
      const { voci } = await convex.query(api.activity.list, { limite: 30 });
      // una voce già legata a una notifica di prima non si riprende
      const libere = voci.map(v => (interno.rivendicate.has(v.id) ? { ...v, annullabile: false } : v));
      voce = voceDaAnnullare(libere, primaId, o.tabelle);
    } catch {
      voce = null;
    }
  }
  if (!voce) {
    interno.mostra({ testo, azioni: [...extra, apriAttivita] });
    return;
  }
  const daAnnullare = voce;
  interno.rivendicate.add(daAnnullare.id);
  const id = interno.mostra({
    testo,
    azioni: [
      ...extra,
      {
        etichetta: "Annulla",
        onClick: async () => {
          try {
            await convex.mutation(api.activity.undo, { activityId: daAnnullare.id });
            interno.aggiorna(id, { testo: "Annullato." });
          } catch (e) {
            interno.aggiorna(id, { testo: `Non si può annullare: ${erroreDi(e).messaggio}.`.replace(/\.\.$/, "."), azioni: [apriAttivita] });
          }
        },
      },
    ],
  });
}

/**
 * Il ponte per i messaggi che non sono scritture (o non ancora passati a
 * useScrittura): `[null, mostra]`. Il nodo è sempre null, così chi lo
 * rendeva ancora in linea non mostra due volte lo stesso messaggio.
 */
export function useAvviso(): readonly [null, (testo: string | null) => void] {
  const { mostra } = useInterno();
  const avvisa = useCallback((testo: string | null) => {
    if (testo) mostra({ testo: frase(testo) });
  }, [mostra]);
  return [null, avvisa] as const;
}
