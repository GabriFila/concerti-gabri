/* ──────────────────────────────────────────────────────────────
   «Annulla» nelle notifiche di /<handle>/modifica (spec ux-modifica
   §5.4): quale voce del registro ha appena scritto la dashboard.

   Le funzioni di Convex non restituiscono l'id della voce (il catalogo è
   congelato), quindi si confronta il registro (activity.list) prima e
   dopo la scrittura: la voce giusta è tra quelle arrivate dopo, scritta
   dalla dashboard, sulle tabelle che la scrittura tocca. Le voci
   dell'Oracolo, degli agenti e del sistema che arrivano nello stesso
   momento si saltano. Un'altra scheda della dashboard che scrive la
   stessa tabella nello stesso istante può confonderlo (raro): al
   peggio l'annullamento fallisce e la notifica rimanda ad «Attività».

   Puro (annulla.test.ts).
   ────────────────────────────────────────────────────────────── */

/** I campi di una voce di activity.list che servono qui. */
export interface VoceRegistro {
  id: string;
  via: string;
  tabella: string;
  annullabile: boolean;
  annullata: boolean;
}

/**
 * La voce da annullare dopo una scrittura della dashboard.
 *
 * - `voci`: il registro dopo la scrittura, dalla più nuova (activity.list).
 * - `primaId`: la voce più nuova prima della scrittura; null se il
 *   registro era vuoto (allora valgono tutte).
 * - `tabelle`: le tabelle che la scrittura tocca (assenti: tutte).
 *
 * Tra le voci più nuove di `primaId`, dalla più vecchia, la prima della
 * dashboard annullabile e non ancora annullata. null se non c'è, o se
 * `primaId` è già uscita dalla finestra (troppe scritture nel frattempo).
 */
export function voceDaAnnullare<V extends VoceRegistro>(voci: readonly V[], primaId: string | null, tabelle?: readonly string[]): V | null {
  let nuove: readonly V[] = voci;
  if (primaId !== null) {
    const i = voci.findIndex(v => v.id === primaId);
    if (i === -1) return null;
    nuove = voci.slice(0, i);
  }
  for (let j = nuove.length - 1; j >= 0; j--) {
    const v = nuove[j];
    if (v.via === "dashboard" && v.annullabile && !v.annullata && (!tabelle || tabelle.includes(v.tabella))) return v;
  }
  return null;
}
