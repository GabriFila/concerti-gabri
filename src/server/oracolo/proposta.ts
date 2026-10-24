/* ──────────────────────────────────────────────────────────────
   propose_concert: la scheda di un concerto o festival nell'Oracolo in
   scrittura (src/server/oracolo/scrittura.ts). Solo dell'Oracolo: NON è
   nel catalogo (shared/agent/catalog.ts), quindi MCP e API non la vedono;
   nell'Oracolo prende il posto di add_concert e update_concert.

   - `needsApproval`: la chiamata del modello ferma il run e non scrive
     niente. La chat la mostra come scheda modificabile; «Salva» risolve
     l'approvazione con `{approved: true, editedArgs: <la scheda>}` (TanStack
     AI la valida con `propostaConcertoInput` alla ripresa), «Scarta» o una
     correzione scritta nella chat con il rifiuto tipizzato
     `rifiutoProposta` ({motivo, nota?, bozza?}), che diventa il risultato
     visto dal modello.
   - `execute` gira solo dopo il sì: entries.salvaScheda come "oracolo",
     un lotto con i nomi nuovi e i km subito; il risultato (`esitoDa`) ha
     solo nomi, km e il nome della partenza, mai un indirizzo.
   - Log: solo metadati (esito, azione, tipo, quanti nomi nuovi), mai
     artista, persone, venue, partenza o commento: come `inputPerLog` in
     scrittura (tools.ts).
   Lo schema è statico: cambiarlo (anche le descrizioni) rende "stale" le
   schede rimaste aperte durante un deploy.
   ────────────────────────────────────────────────────────────── */

import { toolDefinition } from "@tanstack/ai";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { REGOLA_SOPRANNOMI } from "../../../shared/schema/campi.ts";
import { esitoDa, propostaConcertoInput, rifiutoProposta, type EsitoProposta } from "../../../shared/schema/proposta.ts";
import { erroreLeggibile } from "./errori.ts";

export const DESCRIZIONE_PROPOSTA =
  "Prepara la scheda di un concerto o festival nuovo, o le modifiche a uno esistente (con id). Il proprietario la vede nella chat, la corregge e la salva lui: " +
  "niente è scritto finché non preme Salva. Tutto per nome: persone, venue e città, partenza (from) e \"regalato da\", anche se non esistono ancora " +
  "(la scheda mostra cosa è nuovo e lo crea al salvataggio). Una chiamata per serata; più serate = più chiamate nello stesso turno. " +
  "Festival = name + concerts (almeno 2): biglietto, viaggio e commento sono del festival. Per modificare: id e solo i campi che cambiano; " +
  "remove per toglierne; per un festival concerts solo con i concerti da cambiare o aggiungere e remove_concerts per toglierne. " +
  `Non inventare voto, vicinanza, canzoni note o prezzo. ${REGOLA_SOPRANNOMI}`;

export const proponiConcertoDef = toolDefinition({
  name: "propose_concert",
  description: DESCRIZIONE_PROPOSTA,
  inputSchema: propostaConcertoInput,
  needsApproval: true,
  // l'approvazione è `{approved: true, editedArgs}`; il rifiuto porta sempre il suo perché
  approvalSchema: { reject: rifiutoProposta },
});

/** Il client Convex con la sessione del proprietario (scrittura.ts). */
type ClientSessione = Pick<ConvexHttpClient, "mutation">;

/** Solo metadati: mai nomi, venue, partenze o commenti. */
const logMeta = (meta: Record<string, string | number | boolean>) => console.log("propose_concert", JSON.stringify(meta));

/** Lo strumento eseguito sul server dopo il Salva del proprietario. */
export function strumentoProposta(client: ClientSessione, { today, handle }: { today: number; handle: string }) {
  return proponiConcertoDef.server(async (proposta): Promise<EsitoProposta> => {
    try {
      const r = await client.mutation(api.entries.salvaScheda, { as: "oracolo", input: { proposta } });
      const esito = esitoDa(r, { today, handle });
      logMeta({ ok: true, azione: r.azione, tipo: esito.tipo, persone: r.creati.persone.length, partenza: !!r.creati.partenza, regalo: !!r.creati.regalatoDa });
      return esito;
    } catch (e) {
      const errore = erroreLeggibile(e);
      logMeta({ ok: false, code: errore.code });
      // la scheda torna al modello così com'era: la ripropone corretta
      return { ok: false, errore, bozza: proposta };
    }
  });
}
