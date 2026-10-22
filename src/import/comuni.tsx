/* ──────────────────────────────────────────────────────────────
   Pezzi comuni di #agenti, dell'upload e di /autorizza (corsia 7).

   - Convex: il client della richiesta (contesto del router), lo stesso
     che il provider di auth (corsia 3) autentica; le funzioni del
     proprietario prendono `{ input }`. Si legge solo dopo l'idratazione:
     chiavi, client e anteprime non entrano mai nello stato SSR.
   - Errori: il `{code, messaggio}` dei ConvexError così com'è (non ripete
     mai i valori, PIANO §5.3); per il resto un messaggio generico.
   - Stile: agenti.css è nel <head> di ogni pagina (links di __root.tsx).
     Non con un <link precedence> nel contenuto: React 19.2 metterebbe
     tutta la pagina SSR in un confine nascosto, rivelato fino a ~2 s dopo,
     e un aggiornamento prima della rivelazione la fa rendere di nuovo dal
     client lasciando la copia nascosta (testi doppi nel DOM).
   ────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useHydrated, useRouteContext } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

type Input<F extends FunctionReference<"query" | "mutation" | "action">> = FunctionArgs<F> extends { input?: infer I } ? I : never;

/** Una query del proprietario, sottoscritta, accesa solo nel browser dopo l'idratazione. */
export function useDatiProprietario<Q extends FunctionReference<"query">>(fn: Q, input?: Input<Q>, attiva = true): UseQueryResult<FunctionReturnType<Q>, Error> {
  const idratata = useHydrated();
  const opzioni = convexQuery(fn as FunctionReference<"query">, { input: input ?? {} } as never);
  return useQuery({ ...opzioni, enabled: idratata && attiva, retry: false }) as UseQueryResult<FunctionReturnType<Q>, Error>;
}

/** Mutation, action e letture una tantum del proprietario. */
export function useConvexProprietario() {
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

export interface ErroreUi {
  code: string;
  messaggio: string;
  fix?: string;
  /** importer: le righe sbagliate ("riga 3: …"), già senza valori. */
  righe?: string[];
}

/** Il `{code, messaggio}` di un ConvexError; per tutto il resto un messaggio generico. */
export function erroreDi(e: unknown): ErroreUi {
  const data = (e as { data?: unknown } | null)?.data;
  if (data && typeof data === "object" && "messaggio" in data) {
    const d = data as Record<string, unknown>;
    return {
      code: String(d.code ?? "errore"),
      messaggio: String(d.messaggio),
      ...(typeof d.fix === "string" ? { fix: d.fix } : {}),
      ...(Array.isArray(d.righe) ? { righe: d.righe.map(String) } : {}),
    };
  }
  return { code: "errore", messaggio: "qualcosa non è andato: riprova tra poco" };
}

/** Una frase: maiuscola all'inizio, punto alla fine. */
export function frase(s: string): string {
  const t = s.trim();
  const m = t ? t[0].toUpperCase() + t.slice(1) : t;
  return /[.!?…:]$/.test(m) ? m : `${m}.`;
}

export function Errore({ errore }: { errore: ErroreUi | null | undefined }) {
  if (!errore) return null;
  return (
    <div className="ag-errore" role="alert">
      <p>{frase(errore.messaggio)}</p>
      {errore.righe?.length ? (
        <ul className="ag-elenco">
          {errore.righe.map(r => <li key={r}>{r}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

/** Copia `testo` negli appunti; per un attimo dice "Copiato". */
export function Copia({ testo, etichetta = "Copia", nome }: { testo: string; etichetta?: string; nome?: string }) {
  const [fatto, setFatto] = useState<"si" | "no" | null>(null);
  useEffect(() => {
    if (!fatto) return;
    const t = setTimeout(() => setFatto(null), 2000);
    return () => clearTimeout(t);
  }, [fatto]);
  const copia = async () => {
    try {
      await navigator.clipboard.writeText(testo);
      setFatto("si");
    } catch {
      setFatto("no");
    }
  };
  return (
    <button type="button" className="ag-btn" onClick={copia} disabled={!testo} aria-label={nome ? `${etichetta}: ${nome}` : etichetta}>
      {fatto === "si" ? "Copiato" : fatto === "no" ? "Copia a mano" : etichetta}
    </button>
  );
}

/** L'origine del sito, solo nel browser (l'SSR non la conosce dall'header Host). */
export function useOrigine(): string {
  const idratata = useHydrated();
  return idratata ? window.location.origin : "";
}
