/* ──────────────────────────────────────────────────────────────
   I segni della navigazione di /<handle>/modifica (distintivi.ts) dai
   dati del proprietario. Le sottoscrizioni sono quelle delle viste, con
   gli stessi argomenti (TanStack Query le condivide), e partono solo dopo
   l'idratazione (useDati): nell'HTML del server la navigazione è senza
   numeri. Delle partenze arrivano solo nomi e stato, mai indirizzi
   (departures.list).

   L'ultima visita ad «Attività» è l'id della voce più nuova vista lì, nel
   localStorage del browser: si scrive aprendo la vista (e mentre ci si
   resta), e il punto teal riguarda solo le voci arrivate dopo.
   ────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { todayKey } from "../../../shared/lib/dates.ts";
import { useDati } from "../sezioni/comuni.tsx";
import type { IdVista } from "../vista.ts";
import { calcolaDistintivi, type Distintivi } from "./distintivi.ts";

/** L'id della voce più nuova vista in «Attività» (lo legge anche il registro, per i segni «nuova»). */
export const CHIAVE_ATTIVITA = "concerti:modifica:attivita-vista";

export function useDistintivi(vista: IdVista | null): Distintivi {
  const eventi = useDati(api.entries.list, {});
  const wishlist = useDati(api.wishlist.list);
  const persone = useDati(api.people.list);
  const regali = useDati(api.gifters.list);
  const partenze = useDati(api.departures.list);
  const registro = useDati(api.activity.list, { limite: 30 });

  const [vistoId, setVistoId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    try {
      setVistoId(localStorage.getItem(CHIAVE_ATTIVITA));
    } catch {
      setVistoId(null);
    }
  }, []);

  // in «Attività»: tutto quello che c'è è visto
  const piuNuova = registro.data?.voci[0]?.id;
  useEffect(() => {
    if (vista !== "attivita" || vistoId === undefined || !piuNuova || piuNuova === vistoId) return;
    try {
      localStorage.setItem(CHIAVE_ATTIVITA, piuNuova);
    } catch {
      // resta per questa visita
    }
    setVistoId(piuNuova);
  }, [vista, piuNuova, vistoId]);

  const concerti = eventi.data?.concerts;
  return useMemo(
    () =>
      calcolaDistintivi({
        eventi: concerti,
        wishlist: wishlist.data?.artists,
        persone: persone.data?.people,
        regali: regali.data?.gifters,
        partenze: partenze.data?.departures,
        voci: registro.data?.voci,
        vistoId,
        // "oggi" a Roma: cambia solo con i dati, basta per un conteggio
        oggi: todayKey(Date.now()),
      }),
    [concerti, wishlist.data, persone.data, regali.data, partenze.data, registro.data, vistoId],
  );
}
