/* ──────────────────────────────────────────────────────────────
   Il contesto della pagina di un profilo: chi è (profile), i suoi dati con
   tutto ciò che se ne deriva (dataset, da buildDataset) e l'istante "adesso"
   catturato una volta sola nel loader di root (now). `today` è il giorno di
   `now` a Roma (AAAAMMGG), quello che decide passato/in programma.

   Nessun componente legge più dati o orologio a livello di modulo: passa
   tutto da qui, così SSR e idratazione vedono la stessa pagina e due profili
   non si mescolano mai.
   ────────────────────────────────────────────────────────────── */

import React, { useCallback, useContext } from "react";
import type { Dataset } from "../../shared/lib/dataset.ts";
import { isPlanned } from "../../shared/lib/dates.ts";
import { formaDi, type Forma } from "../../shared/labels.ts";
import type { LayoutSezioni } from "../../shared/sections.ts";

export interface Profile {
  handle: string;
  displayName: string;
  /** Forma grammaticale delle etichette (traguardo 4); assente = neutra. */
  forma?: Forma;
  /** Ordine, visibilità e titoli delle sezioni de "I dati" (traguardo 4). */
  layout?: LayoutSezioni;
  /** Contenuti personali facoltativi: credito nel footer, link dei tappi (traguardo 4). */
  extra?: { creditoFooter?: string; linkTappi?: string };
}

export interface ProfileCtx {
  profile: Profile;
  dataset: Dataset;
  /** Istante catturato nel loader di root (ms). */
  now: number;
  /** Il giorno di `now` a Roma, AAAAMMGG. */
  today: number;
}

const Ctx = React.createContext<ProfileCtx | null>(null);

export function ProfileProvider({ value, children }: { value: ProfileCtx; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProfile fuori da ProfileProvider");
  return v;
}

export const useDataset = (): Dataset => useProfile().dataset;
/** La forma grammaticale del profilo della pagina. */
export const useForma = (): Forma => formaDi(useProfile().profile.forma);
export const useToday = (): number => useProfile().today;

/** `isPlanned` legato al giorno della pagina: `rows.filter(planned)`. */
export function usePlanned(): (d: { date: string }) => boolean {
  const today = useToday();
  return useCallback((d: { date: string }) => isPlanned(d, today), [today]);
}
