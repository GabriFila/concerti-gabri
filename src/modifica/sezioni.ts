/* ──────────────────────────────────────────────────────────────
   Le 9 sezioni di /<handle>/modifica, in ordine (SPEC, contratto di
   ondata): id, ordine e titolo non si toccano (gli e2e, i link `fix` di
   Convex e il prompt degli agenti li usano). Ognuna è una vista
   dell'app di modifica (`#<id>`, vista.ts): lo Scheletro le rende tutte
   come <section id={id}> e mostra quella attiva.

   I campi in più servono solo alla navigazione (spec ux-modifica §4.2):
   il gruppo della barra laterale, l'icona (src/ui/Icon.tsx), l'etichetta
   corta del binario (≤ 9 caratteri) e `scheda` per le tre viste che
   stanno nella barra in basso del telefono (le altre in «Altro»).
   ────────────────────────────────────────────────────────────── */

import type { ComponentType } from "react";
import { SezioneAccount } from "./sezioni/Account.tsx";
import { SezioneAgenti } from "./sezioni/Agenti.tsx";
import { SezioneAttivita } from "./sezioni/Attivita.tsx";
import { SezioneConcerti } from "./sezioni/Concerti.tsx";
import { SezionePartenze } from "./sezioni/Partenze.tsx";
import { SezionePersone } from "./sezioni/Persone.tsx";
import { SezioneRegali } from "./sezioni/Regali.tsx";
import { SezioneStile } from "./sezioni/Stile.tsx";
import { SezioneWishlist } from "./sezioni/Wishlist.tsx";
import type { SezioneProps } from "./tipi.ts";
import type { IdVista } from "./vista.ts";

export type IdGruppo = "archivio" | "elenchi" | "pagina" | "sistema";

export interface SezioneModifica {
  /** Vista (#id) e id della <section>. */
  id: IdVista;
  titolo: string;
  Componente: ComponentType<SezioneProps>;
  gruppo: IdGruppo;
  /** Nome di un glifo di src/ui/Icon.tsx. */
  icona: string;
  /** Etichetta sotto l'icona nel binario (≤ 9 caratteri). */
  breve: string;
  /** Una delle schede della barra in basso del telefono. */
  scheda?: true;
}

export const SEZIONI_MODIFICA: readonly SezioneModifica[] = [
  { id: "concerti", titolo: "Concerti", Componente: SezioneConcerti, gruppo: "archivio", icona: "ticket", breve: "Concerti", scheda: true },
  { id: "wishlist", titolo: "Wishlist", Componente: SezioneWishlist, gruppo: "archivio", icona: "heart", breve: "Wishlist", scheda: true },
  { id: "persone", titolo: "Persone", Componente: SezionePersone, gruppo: "elenchi", icona: "users", breve: "Persone" },
  { id: "partenze", titolo: "Partenze", Componente: SezionePartenze, gruppo: "elenchi", icona: "pin", breve: "Partenze" },
  { id: "regali", titolo: "Regalato da", Componente: SezioneRegali, gruppo: "elenchi", icona: "gift", breve: "Regali" },
  { id: "stile", titolo: "Stile", Componente: SezioneStile, gruppo: "pagina", icona: "palette", breve: "Stile" },
  { id: "agenti", titolo: "Agenti", Componente: SezioneAgenti, gruppo: "pagina", icona: "plug", breve: "Agenti" },
  { id: "attivita", titolo: "Attività", Componente: SezioneAttivita, gruppo: "sistema", icona: "history", breve: "Attività", scheda: true },
  { id: "account", titolo: "Account", Componente: SezioneAccount, gruppo: "sistema", icona: "user", breve: "Account" },
];

/** I gruppi della barra laterale; «sistema» (Attività, Account) sta in fondo, senza titolo. */
export const GRUPPI: readonly { id: IdGruppo; titolo: string }[] = [
  { id: "archivio", titolo: "Archivio" },
  { id: "elenchi", titolo: "Elenchi" },
  { id: "pagina", titolo: "Pagina e agenti" },
  { id: "sistema", titolo: "" },
];

export const sezioneDi = (id: IdVista): SezioneModifica => SEZIONI_MODIFICA.find(s => s.id === id)!;
