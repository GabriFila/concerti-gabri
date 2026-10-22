/* I file degli e2e dell'import (traguardo 7): CSV nel formato congelato
   (shared/schema/importFormat.ts), con venue del catalogo del seed e
   nessuna partenza, così valgono per un proprietario appena creato. */

import type { Locator } from "@playwright/test";

/** Un file per setInputFiles. */
export const fileCsv = (name: string, righe: string[]) => ({ name, mimeType: "text/csv", buffer: Buffer.from(righe.join("\n") + "\n") });

const INTESTAZIONE = "tipo,data,artista,festival,venue,citta,con,voto";

/**
 * `concerti` concerti singoli (artisti "<prefisso> 1…n", al Fabrique o
 * all'Alcatraz) e, se `festival`, un festival di due concerti in più.
 * Compagni: "Lu" e "Cami" (soprannomi), nuovi per un proprietario vuoto.
 */
export function csvConcerti(prefisso: string, concerti: number, festival = false): string[] {
  const righe = [INTESTAZIONE];
  for (let i = 1; i <= concerti; i++) {
    const giorno = String(i).padStart(2, "0");
    righe.push(`concerto,${giorno}/03/2025,${prefisso} ${i},,${i % 2 ? "Fabrique" : "Alcatraz"},Milano,${i % 3 ? "Lu" : "Lu;Cami"},${(i % 5) + 1}`);
  }
  if (festival) {
    righe.push(`festival,14/06/2025,${prefisso} festival A,Festa e2e,Ippodromo Snai La Maura,Milano,Cami,4`);
    righe.push(`festival,14/06/2025,${prefisso} festival B,Festa e2e,Ippodromo Snai La Maura,Milano,Cami,5`);
  }
  return righe;
}

/** Il valore di una cella sbagliata: gli errori dicono riga e colonna, mai il valore. */
export const CELLA_CANARINO = "Canarino9z";

/**
 * Un CSV con un voto fuori scala alla riga 3 e un voto canarino
 * (CELLA_CANARINO) alla riga 4; la 1 è l'intestazione.
 */
export const csvConErrore = (prefisso: string) => [
  INTESTAZIONE,
  `concerto,01/02/2025,${prefisso} ok,,Fabrique,Milano,,4`,
  `concerto,02/02/2025,${prefisso} ko,,Fabrique,Milano,,9`,
  `concerto,03/02/2025,${prefisso} ko due,,Fabrique,Milano,,${CELLA_CANARINO}`,
];

/** L'input del file dell'upload dentro `dove` (#agenti o il passo 3 di /benvenuto). */
export const inputFile = (dove: Locator) => dove.locator('input[type="file"]');
