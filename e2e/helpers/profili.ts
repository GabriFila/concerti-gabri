/* ──────────────────────────────────────────────────────────────
   Profili di prova del traguardo 4 (forme, stati vuoti, layout, km in
   attesa), sul deployment Convex LOCALE del worktree attraverso
   helpers/convex.ts. Gli handle iniziano sempre con `e2e-`
   (devtools:preparaProfiloDiProva rifiuta gli altri).

   prepara() è idempotente: crea o aggiorna il profilo e ne sostituisce i
   concerti (quelli di una run precedente spariscono), in una sola chiamata.
   ────────────────────────────────────────────────────────────── */

import { convexRun } from "./convex.ts";

export type Forma = "f" | "m" | "n";

export interface ConcertoDiProva {
  kind?: "concert";
  /** "AAAA-MM-GG" oppure "gg/mm/aaaa". */
  date: string;
  artist: string;
  venue?: string;
  city?: string;
  with?: string[];
  voto?: number;
  vicinanza?: number;
  canzoniNote?: number | "na";
  cost?: number | "na";
  from?: string;
  comments?: string;
}

export interface ProfiloDiProva {
  handle: `e2e-${string}`;
  displayName?: string;
  forma?: Forma;
  layout?: { ordine: string[]; nascoste: string[]; titoli: Record<string, string> };
  theme?: { preset: string; accent?: string; fontTitoli?: string; raggi?: string; densita?: string };
  extra?: { creditoFooter?: string; linkTappi?: string };
  persone?: string[];
  partenze?: string[];
  concerti?: ConcertoDiProva[];
  /** Vecchi handle che portano qui con un 301. */
  alias?: `e2e-${string}`[];
}

/** Crea o aggiorna il profilo e ne sostituisce i concerti con quelli chiesti (venue del catalogo del seed), in una chiamata. */
export function prepara({ concerti = [], ...profilo }: ProfiloDiProva): void {
  convexRun("devtools:preparaProfiloDiProva", {
    ...profilo,
    concerti: concerti.map(c => ({ kind: "concert", venue: "Fabrique", city: "Milano", with: [], ...c })),
  });
}
