/* ──────────────────────────────────────────────────────────────
   Il prompt da copiare per il proprio agente (PIANO traguardo 3, passo 3
   di /benvenuto; lo riusa #agenti). Puro e isomorfo.

   Contiene: handle e forma, la regola dei soprannomi con l'esempio
   (§1.42), le scale, i nomi delle partenze (MAI indirizzi) e "dopo la
   serata" (§1.38). Con l'MCP collegato l'agente scrive da solo; senza,
   lo stesso prompt produce un CSV nel formato di import (§5.10).
   ────────────────────────────────────────────────────────────── */

import { canzoniNoteScale, vicinanzaScale } from "./model/scale.ts";
import { REGOLA_SOPRANNOMI } from "./schema/campi.ts";
import { COLONNE_CSV, SEPARATORE_CON } from "./schema/importFormat.ts";

export type Forma = "f" | "m" | "n";

export interface DatiPrompt {
  /** L'origine del sito, es. https://concerti.gabrifila.me (senza / finale). */
  origin: string;
  handle: string;
  forma: Forma;
  displayName?: string | null;
  /** I nomi pubblici delle partenze (mai gli indirizzi). */
  partenze: readonly string[];
}

/** Come l'agente deve parlare del proprietario. */
export const FORMA_NEL_PROMPT: Record<Forma, string> = {
  f: 'al femminile ("sono andata", "l\'ho vista")',
  m: 'al maschile ("sono andato", "l\'ho visto")',
  n: 'in forma neutra, senza participi marcati ("ho visto", "c\'ero", mai "andato/a")',
};

export function agentPrompt(d: DatiPrompt): string {
  const origin = d.origin.replace(/\/+$/, "");
  const pagina = `${origin}/${d.handle}`;
  const modifica = `${pagina}/modifica`;
  const nome = d.displayName?.trim() || d.handle;
  const partenze = d.partenze.length
    ? d.partenze.map(p => `"${p}"`).join(", ")
    : "nessuna per ora (si aggiungono da " + modifica + "#partenze)";
  return [
    `Mi aiuti a tenere aggiornata la mia pagina di concerti (${pagina})?`,
    "",
    `Sono ${nome}. Quando parli di me usa la forma ${FORMA_NEL_PROMPT[d.forma]}.`,
    "",
    "Come scrivere i dati:",
    `- Se hai gli strumenti MCP del server ${origin}/mcp, usali per leggere e scrivere direttamente: list_concerts, add_concert, update_concert, add_person, add_gifter, search_venue, add_venue, import_concerts, undo. Le scritture valgono subito; per le cancellazioni chiedimi sempre conferma.`,
    `- Se non li hai, preparami un file CSV con queste colonne, in quest'ordine: ${COLONNE_CSV.join(",")}. Lo carico io da ${modifica}#agenti. Una riga per concerto; un festival sono più righe con tipo=festival e stessi festival, venue e data. Nella colonna "con" separa i nomi con "${SEPARATORE_CON}".`,
    "",
    "Dove cercare: le email dei biglietti (TicketOne, Vivaticket, DICE, Ticketmaster…), il calendario, le foto. Se un dato è incerto chiedimelo invece di inventarlo.",
    "",
    "Regole:",
    `- Compagni e "regalato da": ${REGOLA_SOPRANNOMI}. Se trovi un nome e cognome, trasformalo da solo.`,
    "- Voto da 1 a 5, più alto = meglio (5 = indimenticabile). Lascialo vuoto per i concerti non ancora visti.",
    `- Vicinanza al palco, più alto = più vicino: ${vicinanzaScale()}.`,
    `- Canzoni note della scaletta: ${canzoniNoteScale()}; "na" se non me lo ricordo.`,
    '- Costo in euro del biglietto (0 = gratis), "na" se l\'ho pagato ma non ricordo quanto. Regalo e accredito sono sì/no.',
    "- Un festival è un solo biglietto con almeno due concerti: prezzo, viaggio e commento stanno sul festival, non sui singoli concerti.",
    `- Partenze del viaggio: ${partenze}. Usa solo questi nomi e mai indirizzi: i km li calcola il sito. Se una partenza non ha ancora l'indirizzo, i km restano in attesa: dimmi di impostarlo da ${modifica}#partenze.`,
    "",
    `Dopo la serata: a inizio sessione chiama list_concerts({"da_completare": true}) e proponimi di completare voto, vicinanza, canzoni note e commento dei concerti appena passati.`,
  ].join("\n");
}
