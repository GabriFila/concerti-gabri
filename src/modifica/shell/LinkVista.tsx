/* ──────────────────────────────────────────────────────────────
   Un link a una vista di /<handle>/modifica. È un <a> vero, con
   l'indirizzo intero (`/<handle>/modifica#<vista>`): si apre in un'altra
   scheda, e prima dell'idratazione funziona come un'ancora. Il clic
   normale passa dal router (useVista().vai), così la guardia delle
   modifiche non salvate lo vede e la cronologia resta coerente; il <Link>
   del router non va bene qui perché segnerebbe «attive» tutte le viste
   (stesso percorso) e l'hash non lo vede il server. `aria-current` lo
   decide la vista, solo dopo l'idratazione.
   ────────────────────────────────────────────────────────────── */

import type { MouseEvent, ReactNode } from "react";
import { useVista } from "../useVista.ts";
import type { IdVista } from "../vista.ts";

export function LinkVista({ id, className, title, sostituisci, onScelta, children }: {
  id: IdVista;
  className?: string;
  title?: string;
  /** Al posto della voce corrente (il foglio «Altro», che così non resta nella cronologia). */
  sostituisci?: boolean;
  onScelta?: () => void;
  children: ReactNode;
}) {
  const { handle, vista, vai } = useVista();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onScelta?.();
    void vai(id, {}, { sostituisci });
  };
  return (
    <a href={`/${handle}/modifica#${id}`} className={className} title={title} aria-current={vista === id ? "page" : undefined} onClick={onClick}>
      {children}
    </a>
  );
}
