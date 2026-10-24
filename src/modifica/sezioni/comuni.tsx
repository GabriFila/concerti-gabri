/* ──────────────────────────────────────────────────────────────
   I pezzi comuni delle sezioni di /<handle>/modifica (T5).

   - Dati: solo funzioni owner di Convex (il proprietario lo ricava la
     sessione), lette con TanStack Query e SOLO dopo l'idratazione
     (`useHydrated`): i dati del proprietario non entrano mai nello stato
     SSR, e gli indirizzi di #partenze nemmeno nell'HTML (PIANO §6). Dopo
     l'idratazione la query resta sottoscritta: ogni scrittura (anche di un
     agente) arriva da sola. Anche bottoni e form compaiono solo nel browser
     (`CorniceSezione`): prima dell'idratazione non farebbero niente.
   - Scritture: il client Convex del router, lo stesso che il provider di
     auth (T3) autentica.
   - Errori: i `{code, messaggio}` dei ConvexError così come sono (non
     ripetono mai i valori, PIANO §5.3), sempre in linea nella sezione;
     gli esiti delle scritture sono notifiche (ui/Toast.tsx, useScrittura).
   - Finestre modali su <dialog> nativo (`showModal()`: focus contenuto,
     sfondo inerte, Esc), dentro #mf-pannelli; ogni cancellazione passa
     da `Conferma`.
   - Il foglio di stile della pagina (modifica.css) è nel <head> di ogni
     pagina (links di __root.tsx), non con un <link precedence> nel
     contenuto: React 19.2 metterebbe la pagina SSR in un confine nascosto
     rivelato fino a ~2 s dopo, e un aggiornamento prima della rivelazione
     la farebbe rendere di nuovo dal client lasciando la copia nascosta.
   ────────────────────────────────────────────────────────────── */

import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useHydrated, useRouteContext } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import type { AnyFieldApi } from "@tanstack/react-form";
import { REGOLA_SOPRANNOMI } from "../../../shared/schema/campi.ts";

/* ── dati ─────────────────────────────────────────────────────── */

type Input<F extends FunctionReference<"query" | "mutation" | "action">> = FunctionArgs<F> extends { input?: infer I } ? I : never;

/**
 * Una query del proprietario, accesa solo nel browser dopo l'idratazione.
 * `tieni`: mentre arrivano i dati con un input nuovo, restano quelli di prima.
 */
export function useDati<Q extends FunctionReference<"query">>(fn: Q, input?: Input<Q>, opz: { tieni?: boolean } = {}): UseQueryResult<FunctionReturnType<Q>, Error> {
  const idratata = useHydrated();
  const opzioni = convexQuery(fn as FunctionReference<"query">, { input: input ?? {} } as never);
  return useQuery({ ...opzioni, enabled: idratata, ...(opz.tieni ? { placeholderData: keepPreviousData } : {}) }) as UseQueryResult<FunctionReturnType<Q>, Error>;
}

/** Mutation, action e letture una tantum del proprietario. */
export function useConvex() {
  const client = useRouteContext({ from: "__root__" }).convexQueryClient.convexClient;
  return useMemo(
    () => ({
      mutation: <M extends FunctionReference<"mutation">>(fn: M, input: Input<M>) =>
        client.mutation(fn as FunctionReference<"mutation">, { input } as never) as Promise<FunctionReturnType<M>>,
      action: <A extends FunctionReference<"action">>(fn: A, input: Input<A>) =>
        client.action(fn as FunctionReference<"action">, { input } as never) as Promise<FunctionReturnType<A>>,
      query: <Q extends FunctionReference<"query">>(fn: Q, input: Input<Q>) =>
        client.query(fn as FunctionReference<"query">, { input } as never) as Promise<FunctionReturnType<Q>>,
    }),
    [client],
  );
}

/* ── errori ───────────────────────────────────────────────────── */

export interface ErroreUi {
  code: string;
  messaggio: string;
  /** `in_uso`: i concerti che usano la persona, la partenza o il "regalato da". */
  concerti?: string[];
  /** Dove si risolve (un percorso dell'app). */
  fix?: string;
  /** `account.elimina`: false se serve un login più recente. */
  sessioneRecente?: boolean;
  /** Il campo dell'input che ha l'errore (`campo` del ConvexError). */
  campo?: string;
}

/** Il `{code, messaggio}` di un ConvexError; per tutto il resto un messaggio generico. */
export function erroreDi(e: unknown): ErroreUi {
  const data = (e as { data?: unknown } | null)?.data;
  if (data && typeof data === "object" && "messaggio" in data) {
    const d = data as Record<string, unknown>;
    return {
      code: String(d.code ?? "errore"),
      messaggio: String(d.messaggio),
      ...(Array.isArray(d.concerti) ? { concerti: d.concerti.map(String) } : {}),
      ...(typeof d.fix === "string" ? { fix: d.fix } : {}),
      ...(d.sessioneRecente === false ? { sessioneRecente: false } : {}),
      ...(typeof d.campo === "string" ? { campo: d.campo } : {}),
    };
  }
  return { code: "errore", messaggio: "qualcosa non è andato: riprova tra poco" };
}

export const maiuscola = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Un'operazione con lo stato "in corso" e l'ultimo errore; `esegui` restituisce undefined se fallisce. */
export function useOperazione() {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<ErroreUi | null>(null);
  const esegui = useCallback(async <T,>(f: () => Promise<T>): Promise<T | undefined> => {
    setInCorso(true);
    setErrore(null);
    try {
      return await f();
    } catch (e) {
      setErrore(erroreDi(e));
      return undefined;
    } finally {
      setInCorso(false);
    }
  }, []);
  return { esegui, inCorso, errore, setErrore };
}

/** Una frase: maiuscola all'inizio, punto alla fine. */
export const frase = (s: string) => {
  const m = maiuscola(s.trim());
  return /[.!?…]$/.test(m) ? m : `${m}.`;
};

export function Errore({ errore }: { errore: ErroreUi | null | undefined }) {
  if (!errore) return null;
  return (
    <div className="mod-errore" role="alert">
      <p>{frase(errore.messaggio)}</p>
      {errore.concerti?.length ? (
        <ul className="mod-elenco-breve">
          {errore.concerti.map(c => <li key={c}>{c}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Il contenuto di una sezione solo dopo l'idratazione: prima un bottone o
 * un form non farebbero niente (o un form manderebbe i campi nell'URL).
 */
export function SoloNelBrowser({ children }: { children: ReactNode }) {
  return useHydrated() ? <>{children}</> : <p className="mod-attesa" aria-busy="true">Carico…</p>;
}

/** La cornice di ogni sezione: il contenuto solo nel browser. */
export function CorniceSezione({ children }: { children: ReactNode }) {
  return (
    <div className="mod-sezione">
      <SoloNelBrowser>{children}</SoloNelBrowser>
    </div>
  );
}

/** L'errore di una query, con «Riprova». */
export function ErroreVista({ errore, onRiprova }: { errore: ErroreUi; onRiprova: () => void }) {
  return (
    <div className="mf-errore-vista">
      <Errore errore={errore} />
      <button type="button" className="mod-btn" onClick={onRiprova}>Riprova</button>
    </div>
  );
}

/** Sei righe finte mentre arriva un elenco (ferme con prefers-reduced-motion). */
export function RigheSegnaposto({ righe = 6 }: { righe?: number }) {
  return (
    <div className="mf-segnaposto" aria-busy="true">
      <p className="mf-sr">Carico…</p>
      {Array.from({ length: righe }, (_, i) => (
        <div key={i} className="mf-segnaposto-riga" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

/**
 * Caricamento ed errore di una query; i figli solo quando i dati ci sono.
 * `righe`: un elenco, che mentre arriva mostra RigheSegnaposto.
 */
export function Caricamento<T>({ q, children, righe }: { q: UseQueryResult<T, Error>; children: (dati: T) => ReactNode; righe?: boolean }) {
  if (q.error) return <ErroreVista errore={erroreDi(q.error)} onRiprova={() => void q.refetch()} />;
  if (q.data === undefined) return righe ? <RigheSegnaposto /> : <p className="mod-attesa" aria-busy="true">Carico…</p>;
  return <>{children(q.data)}</>;
}

/* ── testi ricorrenti ─────────────────────────────────────────── */

/** La regola dei soprannomi (PIANO §1.42), ovunque si inseriscono nomi. */
export function Soprannomi() {
  return <span className="mod-hint mod-soprannomi">{REGOLA_SOPRANNOMI}.</span>;
}

/* ── finestre modali ─────────────────────────────────────────── */

const Chiudi = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const CAMPI = "input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled)";

/**
 * Una finestra modale su <dialog> nativo (`showModal()`): sta sopra a
 * tutto, anche all'Oracolo e ai pannelli, e il resto della pagina è
 * inerte. Esc chiude (il `cancel` del dialog); un clic fuori chiude solo
 * con `chiudiFuori` (i form non perdono i dati per sbaglio). Il focus va
 * su `[data-autofocus]` o sul primo campo, e alla chiusura torna a chi
 * l'ha aperta. Sul telefono è un foglio dal basso (CSS).
 */
export function Modale({ titolo, onChiudi, children, piedi, largo, chiudiFuori }: {
  titolo: string;
  onChiudi: () => void;
  children: ReactNode;
  piedi?: ReactNode;
  largo?: boolean;
  chiudiFuori?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitolo = useId();
  const chiudi = useRef(onChiudi);
  chiudi.current = onChiudi;
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    const apritore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let nostro = false;
    d.showModal();
    const primo =
      d.querySelector<HTMLElement>("[data-autofocus]") ??
      d.querySelector<HTMLElement>(`.mod-pop-corpo :is(${CAMPI})`) ??
      d.querySelector<HTMLElement>(".mod-pop-piedi button");
    primo?.focus({ preventScroll: true });
    const onCancel = (e: Event) => {
      e.preventDefault();
      chiudi.current();
    };
    // chiusa dal browser senza `cancel` (Chrome, Esc ripetuto): lo stato segue
    const onClose = () => {
      if (!nostro) chiudi.current();
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("close", onClose);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("close", onClose);
      nostro = true;
      if (d.open) d.close();
      const att = document.activeElement;
      if (apritore?.isConnected && (!att || att === document.body || d.contains(att))) apritore.focus({ preventScroll: true });
    };
  }, []);
  // un clic sullo sfondo (fuori dal riquadro) arriva al <dialog> stesso
  const onMouseDown = (e: MouseEvent<HTMLDialogElement>) => {
    const d = ref.current;
    if (!chiudiFuori || !d || e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onChiudi();
  };
  return createPortal(
    <dialog ref={ref} className={`mod-modale mod-pop${largo ? " mod-pop-largo" : ""}`} aria-labelledby={idTitolo} onMouseDown={onMouseDown}>
      <div className="fp-head">
        <span className="fp-title" id={idTitolo}>{titolo}</span>
        <button type="button" className="fp-close" onClick={onChiudi} aria-label="Chiudi">
          <Chiudi />
        </button>
      </div>
      <div className="mod-pop-corpo">{children}</div>
      {piedi && <div className="mod-pop-piedi">{piedi}</div>}
    </dialog>,
    document.getElementById("mf-pannelli") ?? document.body,
  );
}

/**
 * La conferma di ogni cancellazione (PIANO §5.7). `bloccato`: spiega
 * perché non si può e basta. Il focus parte dal pulsante sicuro
 * (`annulla`, «Annulla» se non detto, o «Ho capito»).
 */
export function Conferma({ titolo, children, etichetta = "Cancella", annulla = "Annulla", onConferma, onChiudi, inCorso, errore, bloccato }: {
  titolo: string;
  children: ReactNode;
  etichetta?: string;
  annulla?: string;
  onConferma: () => void;
  onChiudi: () => void;
  inCorso?: boolean;
  errore?: ErroreUi | null;
  bloccato?: boolean;
}) {
  return (
    <Modale
      titolo={titolo}
      onChiudi={onChiudi}
      chiudiFuori
      piedi={
        bloccato ? (
          <button type="button" className="mod-btn" onClick={onChiudi} data-autofocus>Ho capito</button>
        ) : (
          <>
            <button type="button" className="mod-btn" onClick={onChiudi} data-autofocus>{annulla}</button>
            <button type="button" className="mod-btn mod-pericolo" onClick={onConferma} disabled={inCorso}>
              {inCorso ? "Un momento…" : etichetta}
            </button>
          </>
        )
      }
    >
      {children}
      <Errore errore={errore} />
    </Modale>
  );
}

/* ── campi dei form (TanStack Form) ───────────────────────────── */

/**
 * L'errore di un campo da mostrare: solo dopo che è stato toccato o dopo
 * un invio (un form appena aperto non è già rosso), o null.
 */
export function erroreVisibile(f: AnyFieldApi): string | null {
  const visibili = f.state.meta.isTouched || f.form.state.submissionAttempts > 0;
  const e = visibili ? f.state.meta.errors.filter(Boolean).map(String)[0] : undefined;
  return e ? maiuscola(e) : null;
}

/** Gli errori di un campo, dopo che è stato toccato o dopo un invio. `id`: per l'aria-describedby del campo. */
export function ErroriCampo({ f, id }: { f: AnyFieldApi; id?: string }) {
  const e = erroreVisibile(f);
  if (!e) return null;
  return <span id={id} className="mod-campo-errore" role="alert">{e}</span>;
}

/**
 * Gli id di un campo: il suo, quello del suggerimento e quello
 * dell'errore. Suggerimento ed errore stanno fuori dall'etichetta (il
 * nome del campo resta l'etichetta e basta) e il campo li indica con
 * aria-describedby; aria-invalid quando l'errore si vede.
 */
export function useDescrizione(f: AnyFieldApi, aiuto: boolean) {
  const id = useId();
  const errore = erroreVisibile(f) !== null;
  return {
    id,
    idAiuto: `${id}-aiuto`,
    idErrore: `${id}-errore`,
    invalido: errore || undefined,
    descritto: [aiuto ? `${id}-aiuto` : "", errore ? `${id}-errore` : ""].filter(Boolean).join(" ") || undefined,
  };
}

/**
 * Un campo di testo collegato a TanStack Form. `segno`: accanto
 * all'etichetta (es. «proposto dall'Oracolo»). `azione`: un pulsante sulla
 * stessa riga del campo (l'«Aggiungi» delle aggiunte rapide), con
 * suggerimento ed errore sotto a tutti e due.
 */
export function CampoTesto({ f, etichetta, aiuto, tipo = "text", segno, azione, ...resto }: {
  f: AnyFieldApi;
  etichetta: ReactNode;
  aiuto?: ReactNode;
  tipo?: string;
  segno?: ReactNode;
  azione?: ReactNode;
  placeholder?: string;
  autoFocus?: boolean;
  maxLength?: number;
  autoComplete?: string;
}) {
  const d = useDescrizione(f, !!aiuto);
  const campo = (
    <input
      id={d.id}
      type={tipo}
      name={f.name}
      value={(f.state.value as string | undefined) ?? ""}
      onChange={e => f.handleChange(e.target.value)}
      onBlur={f.handleBlur}
      aria-invalid={d.invalido}
      aria-describedby={d.descritto}
      data-autofocus={resto.autoFocus || undefined}
      {...resto}
    />
  );
  return (
    <div className="mod-campo" data-campo={f.name}>
      <label className="mod-etichetta" htmlFor={d.id}>
        {etichetta}
        {segno}
      </label>
      {azione ? (
        <div className="mf-campo-azione">
          {campo}
          {azione}
        </div>
      ) : (
        campo
      )}
      {aiuto && <span id={d.idAiuto} className="mod-hint">{aiuto}</span>}
      <ErroriCampo f={f} id={d.idErrore} />
    </div>
  );
}
