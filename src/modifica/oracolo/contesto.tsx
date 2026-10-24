/* ──────────────────────────────────────────────────────────────
   Lo stato dell'Oracolo in scrittura dentro /<handle>/modifica (spec
   ux-modifica §7): aperto o chiuso, in che modo, e le richieste che il
   resto dell'app gli fa. Il contenitore (Contenitore.tsx) disegna il
   <dialog id="oracolo">; la chat (ChatScrittura.tsx, corsia ux-agente)
   ne usa solo l'API qui sotto.

   - Agganciato (≥ 1024 px): pannello non modale a destra. La scelta
     aperto/chiuso resta nel browser (localStorage); alla prima visita è
     aperto solo da 1440 px in su.
   - Foglio (sotto 1024 px): parte sempre chiuso; aprirlo aggiunge una
     voce alla cronologia, così «indietro» lo chiude.
   - `apri({ testo })` precompila la casella, non manda mai niente da solo.
   ────────────────────────────────────────────────────────────── */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { modoOracolo, SOGLIE, type ModoOracolo } from "../layout.ts";
import { useVista, useVoceStoria } from "../useVista.ts";
import type { IdVista, Parametri } from "../vista.ts";

export interface OracoloApi {
  aperto: boolean;
  modo: ModoOracolo;
  apri(o?: { testo?: string }): void;
  chiudi(): void;
  alterna(): void;
  /** Una risposta è arrivata: con l'Oracolo chiuso, un puntino sui pulsanti. */
  segnalaRisposta(): void;
}

export interface RichiestaOracolo {
  testo: string;
  nonce: number;
}

interface OracoloInterno extends OracoloApi {
  /** Una risposta arrivata mentre era chiuso. */
  nonLetta: boolean;
  richiesta: RichiestaOracolo | null;
  consumata(nonce: number): void;
  /** Chi l'ha aperto (per ridargli il focus alla chiusura) e se l'ha aperto una persona. */
  apritore: MutableRefObject<HTMLElement | null>;
  daUtente: MutableRefObject<boolean>;
}

const CHIAVE = "concerti:modifica:oracolo";

const leggi = (): "aperto" | "chiuso" | null => {
  try {
    const v = localStorage.getItem(CHIAVE);
    return v === "aperto" || v === "chiuso" ? v : null;
  } catch {
    return null;
  }
};
const scrivi = (v: "aperto" | "chiuso") => {
  try {
    localStorage.setItem(CHIAVE, v);
  } catch {
    // niente localStorage (modalità privata piena): resta per questa visita
  }
};

const Contesto = createContext<OracoloInterno | null>(null);

/** `w`: il gradino di larghezza (useMisura), null prima dell'idratazione. */
export function OracoloProvider({ w, children }: { w: number | null; children: ReactNode }) {
  const modo = modoOracolo(w ?? SOGLIE.ampio);
  const { aperto, apri: apriVoce, chiudi: chiudiVoce } = useVoceStoria("mfOracolo");
  const [nonLetta, setNonLetta] = useState(false);
  const [richiesta, setRichiesta] = useState<RichiestaOracolo | null>(null);
  const apritore = useRef<HTMLElement | null>(null);
  const daUtente = useRef(false);
  const apertoRef = useRef(aperto);
  apertoRef.current = aperto;

  // la prima volta che si conosce la larghezza: agganciato, la scelta salvata (o aperto da 1440 px)
  const iniziato = useRef(false);
  useEffect(() => {
    if (w === null || iniziato.current) return;
    iniziato.current = true;
    if (modoOracolo(w) !== "ancorato") return;
    const salvato = leggi();
    if (salvato === "aperto" || (salvato === null && w >= SOGLIE.enorme)) apriVoce(false);
  }, [w, apriVoce]);

  const apri = useCallback(
    (o?: { testo?: string }) => {
      apritore.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      daUtente.current = true;
      if (o?.testo) setRichiesta({ testo: o.testo, nonce: Date.now() });
      setNonLetta(false);
      if (modo === "ancorato") scrivi("aperto");
      if (!apertoRef.current) apriVoce(modo !== "ancorato");
    },
    [modo, apriVoce],
  );

  const chiudi = useCallback(() => {
    if (modo === "ancorato") scrivi("chiuso");
    chiudiVoce();
  }, [modo, chiudiVoce]);

  const valore = useMemo<OracoloInterno>(
    () => ({
      aperto,
      modo,
      apri,
      chiudi,
      alterna: () => (apertoRef.current ? chiudi() : apri()),
      segnalaRisposta: () => {
        if (!apertoRef.current) setNonLetta(true);
      },
      nonLetta,
      richiesta,
      consumata: (nonce: number) => setRichiesta(r => (r?.nonce === nonce ? null : r)),
      apritore,
      daUtente,
    }),
    [aperto, modo, apri, chiudi, nonLetta, richiesta],
  );
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>;
}

function useInterno(): OracoloInterno {
  const c = useContext(Contesto);
  if (!c) throw new Error("useOracolo fuori da /<handle>/modifica (OracoloProvider)");
  return c;
}

/** Il contenitore e i pulsanti (Contenitore.tsx, la barra in alto e in basso). */
export const useOracoloInterno = useInterno;

/** Aprire, chiudere e avvisare l'Oracolo in scrittura. */
export function useOracolo(): OracoloApi {
  const { aperto, modo, apri, chiudi, alterna, segnalaRisposta } = useInterno();
  return { aperto, modo, apri, chiudi, alterna, segnalaRisposta };
}

/** Un testo da mettere nella casella della chat (mai inviato da solo): la chat lo consuma. */
export function useRichiestaOracolo(): { richiesta: RichiestaOracolo | null; consumata(nonce: number): void } {
  const { richiesta, consumata } = useInterno();
  return { richiesta, consumata };
}

/** La vista di /modifica aperta adesso, in sola lettura (il contesto della chat). */
export function useVistaCorrente(): { vista: IdVista | null; parametri: Parametri } {
  const { vista, parametri } = useVista();
  return useMemo(() => ({ vista, parametri }), [vista, parametri]);
}
