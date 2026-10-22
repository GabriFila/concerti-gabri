import React from "react";
import { sectionLabelFor, type SectionId } from "../../shared/sections.ts";
import { useForma, useProfile } from "../profile/ProfileContext.tsx";

/* ──────────────────────────────────────────────────────────────
   Il titolo di una card de "I dati" (PIANO §1.35). FullDashboard avvolge
   ogni sezione in <SezioneCorrente id=…>; dentro, la card chiede il suo
   titolo con useTitoloSezione(): quello scelto dal profilo nel layout,
   altrimenti il suo titolo di sempre (`proprio`), altrimenti l'etichetta
   della sezione nella forma del profilo. Fuori da una sezione (la mappa del
   Ritratto) vale il titolo di sempre.
   ────────────────────────────────────────────────────────────── */

const Ctx = React.createContext<SectionId | null>(null);

export function SezioneCorrente({ id, children }: { id: SectionId; children: React.ReactNode }) {
  return <Ctx.Provider value={id}>{children}</Ctx.Provider>;
}

/** Il titolo della card: personalizzato, oppure `proprio`, oppure quello della sezione nella forma del profilo. */
export function useTitoloSezione(proprio?: string): string {
  const id = React.useContext(Ctx);
  const forma = useForma();
  const { layout } = useProfile().profile;
  const scelto = id ? layout?.titoli?.[id]?.trim() : undefined;
  return scelto || proprio || (id ? sectionLabelFor(id, forma) : undefined) || "";
}
