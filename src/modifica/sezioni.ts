/* ──────────────────────────────────────────────────────────────
   Le 9 sezioni di /<handle>/modifica, in ordine (SPEC, contratto di
   ondata). Lo scheletro della rotta (corsia 3) le rende tutte come
   <section id={id}>; ogni componente lo scrive la sua corsia
   (Agenti: corsia 7, le altre: corsia 5). L'elenco non si tocca nelle
   corsie.
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

export interface SezioneModifica {
  /** Ancora (#id) e id della <section>. */
  id: string;
  titolo: string;
  Componente: ComponentType<SezioneProps>;
}

export const SEZIONI_MODIFICA: readonly SezioneModifica[] = [
  { id: "concerti", titolo: "Concerti", Componente: SezioneConcerti },
  { id: "wishlist", titolo: "Wishlist", Componente: SezioneWishlist },
  { id: "persone", titolo: "Persone", Componente: SezionePersone },
  { id: "partenze", titolo: "Partenze", Componente: SezionePartenze },
  { id: "regali", titolo: "Regalato da", Componente: SezioneRegali },
  { id: "stile", titolo: "Stile", Componente: SezioneStile },
  { id: "agenti", titolo: "Agenti", Componente: SezioneAgenti },
  { id: "attivita", titolo: "Attività", Componente: SezioneAttivita },
  { id: "account", titolo: "Account", Componente: SezioneAccount },
];
