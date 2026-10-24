/* ──────────────────────────────────────────────────────────────
   La vista corrente di /<handle>/modifica e come cambiarla (spec
   ux-modifica §2.1). Tutto passa dal router, mai da un <a href="#x">
   nudo: il suo popstate non ha __TSR_index e la guardia delle modifiche
   non salvate (useBlocker) si confonderebbe.

   - Prima dell'idratazione `pronta` è false e `vista` null: il server non
     vede mai l'hash, e un render che ne dipendesse non coinciderebbe con
     l'HTML (zero errori di idratazione, e2e/onboarding.spec.ts).
   - Hash vuoto o sconosciuto = Concerti (lo Scheletro toglie quello
     sconosciuto).
   - I pannelli (form a destra, fogli sul telefono) stanno nell'hash
     (`?nuovo=`, `?apri=`, `?indirizzo=`) con `mfPannello` nello stato
     della cronologia: «indietro» li chiude, e si possono linkare.
   - Lo scroll lo gestisce lo Scheletro (src/router.tsx lo toglie al
     router su /modifica): qui niente resetScroll né scrollIntoView.
   ────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHydrated, useLocation, useParams, useRouter, type HistoryState } from "@tanstack/react-router";
import { haPannello, leggiHash, scriviHash, type IdVista, type Parametri } from "./vista.ts";

/** Le voci di /modifica nello stato della cronologia (oltre a quelle del router). */
export interface StatoModifica {
  /** Questa voce ha aperto un pannello: chiuderlo è «indietro». */
  mfPannello?: boolean;
  /** Il foglio dell'Oracolo (telefono e tablet). */
  mfOracolo?: boolean;
  /** Il foglio «Tutte le sezioni» del telefono. */
  mfFoglio?: boolean;
  /** Il numero dell'apertura del ponte dell'editor (editor.tsx) che ha aperto questo pannello: solo un numero, mai la bozza. */
  mfApertura?: number;
}

const VUOTI: Parametri = {};

/** Aggiorna lo stato della cronologia tenendo le voci che ci sono già. */
export const conStato = (agg: StatoModifica) => ((s: HistoryState) => ({ ...s, ...agg })) as unknown as (s: HistoryState) => HistoryState;

export function useVista() {
  const { handle } = useParams({ from: "/$handle/modifica" });
  const pronta = useHydrated();
  const hash = useLocation({ select: l => l.hash });
  const router = useRouter();
  const posizione = useMemo(() => leggiHash(hash), [hash]);
  const vista: IdVista | null = pronta ? (posizione.vista ?? "concerti") : null;
  const parametri = pronta ? posizione.parametri : VUOTI;

  const stato = useCallback(() => router.latestLocation.state as StatoModifica, [router]);

  const vai = useCallback(
    (v: IdVista, p?: Parametri, o: { sostituisci?: boolean; tieniStato?: boolean; ignoraGuardia?: boolean } = {}) =>
      router.navigate({
        to: "/$handle/modifica",
        params: { handle },
        hash: scriviHash(v, p),
        replace: !!o.sostituisci,
        ...(o.tieniStato ? { state: true } : {}),
        ...(o.ignoraGuardia ? { ignoreBlocker: true } : {}),
        resetScroll: false,
        hashScrollIntoView: false,
      }),
    [router, handle],
  );

  /**
   * Apre un pannello nella vista corrente (o in `v`): una voce nuova nella
   * cronologia, così «indietro» lo chiude. Se un pannello è già aperto lo
   * sostituisce al suo posto (aprire un'altra riga non accumula voci).
   * `sostituisci` prende comunque il posto della voce corrente (il
   * prossimo della coda «da completare», il cambio di tipo del form nuovo);
   * `ignoraGuardia` salta la conferma delle modifiche non salvate (il form
   * ha appena salvato, o porta con sé i suoi valori). `apertura` è il
   * numero del ponte dell'editor: con lo stesso hash cambia solo lo stato,
   * e il pannello si rifà (passando comunque dalla guardia).
   */
  const apriPannello = useCallback(
    (p: Parametri, v?: IdVista, o: { sostituisci?: boolean; ignoraGuardia?: boolean; apertura?: number } = {}) => {
      const corrente = leggiHash(router.latestLocation.hash);
      const gia = !!stato().mfPannello && haPannello(corrente.parametri);
      // al posto di una voce che non abbiamo aperto noi (un link diretto) mfPannello non si aggiunge: chiudere non deve tornare indietro fuori da qui
      const agg: StatoModifica = {
        ...(gia || !o.sostituisci ? { mfPannello: true } : {}),
        ...(o.apertura !== undefined ? { mfApertura: o.apertura } : {}),
      };
      return router.navigate({
        to: "/$handle/modifica",
        params: { handle },
        hash: scriviHash(v ?? corrente.vista ?? "concerti", p),
        replace: gia || !!o.sostituisci,
        state: Object.keys(agg).length ? conStato(agg) : true,
        ...(o.ignoraGuardia ? { ignoreBlocker: true } : {}),
        resetScroll: false,
        hashScrollIntoView: false,
      });
    },
    [router, handle, stato],
  );

  /** Chiude il pannello: «indietro» se l'ha aperto questa pagina, altrimenti toglie i parametri. Dopo un salvataggio la guardia non chiede niente. */
  const chiudiPannello = useCallback(
    (o: { dopoSalvataggio?: boolean } = {}) => {
      const ignoreBlocker = !!o.dopoSalvataggio;
      if (stato().mfPannello) {
        router.history.back({ ignoreBlocker });
        return;
      }
      const v = leggiHash(router.latestLocation.hash).vista ?? "concerti";
      void router.navigate({
        to: "/$handle/modifica",
        params: { handle },
        hash: scriviHash(v),
        replace: true,
        state: conStato({ mfPannello: undefined }),
        ignoreBlocker,
        resetScroll: false,
        hashScrollIntoView: false,
      });
    },
    [router, handle, stato],
  );

  return { pronta, vista, parametri, handle, vai, apriPannello, chiudiPannello, stato };
}

/**
 * Un foglio a tutto schermo (l'Oracolo sul telefono, «Tutte le sezioni»)
 * che il gesto «indietro» chiude: aprirlo aggiunge una voce alla
 * cronologia con `chiave` nello stato, chiuderlo dall'interfaccia torna
 * indietro, e una voce che perde la chiave lo chiude.
 */
export function useVoceStoria(chiave: "mfOracolo" | "mfFoglio") {
  const { handle } = useParams({ from: "/$handle/modifica" });
  const router = useRouter();
  const presente = useLocation({ select: l => !!(l.state as StatoModifica)[chiave] });
  const [aperto, setAperto] = useState(false);
  // la voce è arrivata nella cronologia (la navigazione è asincrona)
  const spinta = useRef(false);

  useEffect(() => {
    if (!aperto) {
      spinta.current = false;
      return;
    }
    if (presente) spinta.current = true;
    else if (spinta.current) {
      spinta.current = false;
      setAperto(false);
    }
  }, [aperto, presente]);

  /** `conVoce: false` apre senza toccare la cronologia (l'Oracolo agganciato). */
  const apri = useCallback(
    (conVoce = true) => {
      setAperto(true);
      if (!conVoce) return;
      void router.navigate({
        to: "/$handle/modifica",
        params: { handle },
        hash: true,
        state: conStato({ [chiave]: true }),
        resetScroll: false,
        hashScrollIntoView: false,
      });
    },
    [router, handle, chiave],
  );

  const chiudi = useCallback(() => {
    if (spinta.current && (router.latestLocation.state as StatoModifica)[chiave]) router.history.back();
    else setAperto(false);
  }, [router, chiave]);

  return { aperto, apri, chiudi };
}
