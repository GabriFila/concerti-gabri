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
     ripetono mai i valori, PIANO §5.3).
   - Modali con la cornice di CommentModal; ogni cancellazione passa da
     `Conferma`.
   - Il foglio di stile della pagina (modifica.css) è nel <head> di ogni
     pagina (links di __root.tsx), non con un <link precedence> nel
     contenuto: React 19.2 metterebbe la pagina SSR in un confine nascosto
     rivelato fino a ~2 s dopo, e un aggiornamento prima della rivelazione
     la farebbe rendere di nuovo dal client lasciando la copia nascosta.
   ────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

/** Caricamento ed errore di una query; i figli solo quando i dati ci sono. */
export function Caricamento<T>({ q, children }: { q: UseQueryResult<T, Error>; children: (dati: T) => ReactNode }) {
  if (q.error) return <Errore errore={erroreDi(q.error)} />;
  if (q.data === undefined) return <p className="mod-attesa" aria-busy="true">Carico…</p>;
  return <>{children(q.data)}</>;
}

/** Un messaggio che sparisce da solo dopo qualche secondo. */
export function useAvviso(ms = 5000) {
  const [testo, setTesto] = useState<string | null>(null);
  useEffect(() => {
    if (!testo) return;
    const t = setTimeout(() => setTesto(null), ms);
    return () => clearTimeout(t);
  }, [testo, ms]);
  const nodo = testo ? <p className="mod-ok" role="status">{testo}</p> : null;
  return [nodo, setTesto] as const;
}

/* ── testi ricorrenti ─────────────────────────────────────────── */

/** La regola dei soprannomi (PIANO §1.42), ovunque si inseriscono nomi. */
export function Soprannomi() {
  return <span className="mod-hint mod-soprannomi">{REGOLA_SOPRANNOMI}.</span>;
}

/* ── modali ───────────────────────────────────────────────────── */

const Chiudi = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/**
 * Una finestra modale (la cornice di CommentModal). Esc chiude; un clic
 * fuori chiude solo con `chiudiFuori` (i form non perdono i dati per sbaglio).
 */
export function Modale({ titolo, onChiudi, children, piedi, largo, chiudiFuori }: {
  titolo: string;
  onChiudi: () => void;
  children: ReactNode;
  piedi?: ReactNode;
  largo?: boolean;
  chiudiFuori?: boolean;
}) {
  const chiudi = useRef(onChiudi);
  chiudi.current = onChiudi;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") chiudi.current();
    };
    document.addEventListener("keydown", onKey);
    const prima = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prima;
    };
  }, []);
  return createPortal(
    <div className="commentmodal mod-modale" onMouseDown={e => { if (chiudiFuori && e.target === e.currentTarget) onChiudi(); }}>
      <div className={`commentpop mod-pop${largo ? " mod-pop-largo" : ""}`} role="dialog" aria-modal="true" aria-label={titolo}>
        <div className="fp-head">
          <span className="fp-title">{titolo}</span>
          <button type="button" className="fp-close" onClick={onChiudi} aria-label="Chiudi">
            <Chiudi />
          </button>
        </div>
        <div className="mod-pop-corpo">{children}</div>
        {piedi && <div className="mod-pop-piedi">{piedi}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** La conferma di ogni cancellazione (PIANO §5.7). `bloccato`: spiega perché non si può e basta. */
export function Conferma({ titolo, children, etichetta = "Cancella", onConferma, onChiudi, inCorso, errore, bloccato }: {
  titolo: string;
  children: ReactNode;
  etichetta?: string;
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
          <button type="button" className="mod-btn" onClick={onChiudi}>Ho capito</button>
        ) : (
          <>
            <button type="button" className="mod-btn" onClick={onChiudi}>Annulla</button>
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

/** Gli errori di un campo, dopo che è stato toccato o dopo un invio. */
export function ErroriCampo({ f }: { f: AnyFieldApi }) {
  const visibili = f.state.meta.isTouched || f.form.state.submissionAttempts > 0;
  const errori = visibili ? f.state.meta.errors.filter(Boolean).map(String) : [];
  if (!errori.length) return null;
  return <span className="mod-campo-errore" role="alert">{maiuscola(errori[0])}</span>;
}

/** Un campo di testo collegato a TanStack Form. */
export function CampoTesto({ f, etichetta, aiuto, tipo = "text", ...resto }: {
  f: AnyFieldApi;
  etichetta: string;
  aiuto?: ReactNode;
  tipo?: string;
  placeholder?: string;
  autoFocus?: boolean;
  maxLength?: number;
  autoComplete?: string;
}) {
  return (
    <label className="mod-campo">
      <span className="mod-etichetta">{etichetta}</span>
      <input
        type={tipo}
        name={f.name}
        value={(f.state.value as string | undefined) ?? ""}
        onChange={e => f.handleChange(e.target.value)}
        onBlur={f.handleBlur}
        aria-invalid={f.state.meta.errors.length > 0 || undefined}
        {...resto}
      />
      {aiuto && <span className="mod-hint">{aiuto}</span>}
      <ErroriCampo f={f} />
    </label>
  );
}
