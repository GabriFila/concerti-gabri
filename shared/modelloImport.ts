/* ──────────────────────────────────────────────────────────────
   Il modello scaricabile dell'import (PIANO §5.10, traguardo 3): un CSV
   e un JSON d'esempio generati da shared/schema/importFormat.ts, che resta
   l'unica fonte del formato. Un concerto e un festival di due concerti,
   con i soprannomi e le scale giuste; il test li rilegge con gli schemi.

   La regola dei soprannomi (§1.42) e la guida delle colonne stanno
   ACCANTO ai file (src/ui/ModelliImport.tsx), non dentro: né il CSV né il
   JSON del formato congelato hanno un posto per i commenti, e un modello
   caricato così com'è deve passare l'import.
   ────────────────────────────────────────────────────────────── */

import type { z } from "zod";
import { REGOLA_SOPRANNOMI } from "./schema/campi.ts";
import type { importJson } from "./schema/importFormat.ts";
import { COLONNE_CSV, DESCRIZIONE_COLONNE, type ColonnaCsv, type RigaCsv } from "./schema/importFormat.ts";

/** La regola dei soprannomi da mostrare accanto ai modelli. */
export const NOTA_MODELLI = `Compagni e "regalato da" (colonne con e regalato_da): ${REGOLA_SOPRANNOMI}.`;

/** Le colonne del CSV, in ordine, con la descrizione di importFormat.ts. */
export const GUIDA_COLONNE = COLONNE_CSV.map(colonna => ({ colonna, descrizione: DESCRIZIONE_COLONNE[colonna] }));

/** Le righe d'esempio, già nel formato del CSV (vuoto = assente). */
export const RIGHE_ESEMPIO: RigaCsv[] = [
  {
    tipo: "concerto", data: "2025-11-14", artista: "Nome dell'artista", venue: "Fabrique", citta: "Milano",
    con: "Marco R.;Giuli", voto: "4", vicinanza: "5", canzoni_note: "3", costo: "35", partenza: "Casa", commento: "Bis lunghissimo",
  },
  {
    tipo: "festival", data: "2026-07-03", data_concerto: "2026-07-03", artista: "Primo artista", festival: "Nome del festival 2026",
    venue: "Ippodromo SNAI San Siro", citta: "Milano", con: "Marco R.", costo: "70", regalo: "si", regalato_da: "Anna B.",
  },
  {
    tipo: "festival", data: "2026-07-03", data_concerto: "2026-07-03", artista: "Secondo artista", festival: "Nome del festival 2026",
    venue: "Ippodromo SNAI San Siro", citta: "Milano", con: "Marco R.", costo: "70", regalo: "si", regalato_da: "Anna B.",
  },
];

/** Un campo CSV con le virgolette solo quando servono (RFC 4180). */
const campo = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Il CSV d'esempio: intestazione di COLONNE_CSV, poi le righe. */
export function modelloCsv(righe: readonly RigaCsv[] = RIGHE_ESEMPIO): string {
  const riga = (r: RigaCsv) => COLONNE_CSV.map((c: ColonnaCsv) => campo(r[c] ?? "")).join(",");
  return [COLONNE_CSV.join(","), ...righe.map(riga)].join("\n") + "\n";
}

/** Lo stesso esempio nella forma JSON (`importJson`). */
export const ESEMPIO_JSON: z.input<typeof importJson> = [
  {
    kind: "concert", date: "2025-11-14", artist: "Nome dell'artista", venue: "Fabrique", city: "Milano",
    with: ["Marco R.", "Giuli"], voto: 4, vicinanza: 5, canzoniNote: 3, cost: 35, from: "Casa", comments: "Bis lunghissimo",
  },
  {
    kind: "festival", name: "Nome del festival 2026", date: "2026-07-03", venue: "Ippodromo SNAI San Siro", city: "Milano",
    cost: 70, gift: true, giftFrom: "Anna B.",
    concerts: [
      { artist: "Primo artista", with: ["Marco R."], date: "2026-07-03" },
      { artist: "Secondo artista", with: ["Marco R."], date: "2026-07-03" },
    ],
  },
];

export const modelloJson = (): string => JSON.stringify(ESEMPIO_JSON, null, 2) + "\n";
