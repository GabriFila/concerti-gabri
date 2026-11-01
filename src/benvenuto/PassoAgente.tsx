/* Passo 3 di /benvenuto, "collega il tuo agente" (SPEC §2, consigliato),
   in due parti perché stia in uno schermo, con Avanti sempre in vista
   (barra fissa in fondo):
   1. il connettore: l'URL MCP e le istruzioni per Claude, ChatGPT e
      Claude Code;
   2. il prompt pronto (shared/agentPrompt.ts) e, senza MCP, il modello
      CSV/JSON da far compilare all'agente e da caricare qui (ImportUpload,
      corsia 7).
   La parte vive solo qui: un reload riparte dalla prima, il passo salvato
   sul server resta "agente" finché l'ultimo Avanti non chiude l'onboarding. */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
import { agentPrompt } from "../../shared/agentPrompt.ts";
import { ImportUpload } from "../import/ImportUpload.tsx";
import { ModelliImport } from "../ui/ModelliImport.tsx";
import { Copia, Navigazione, Passo, useOrigine } from "./comuni.tsx";

export function PassoAgente({ handle }: { handle: string }) {
  const origine = useOrigine();
  const { data: profilo } = useQuery(convexQuery(api.profiles.get, {}));
  const { data: partenze } = useQuery(convexQuery(api.departures.list, {}));
  const [parte, setParte] = useState<1 | 2>(1);
  const mcp = origine ? `${origine}/mcp` : "";
  const prompt =
    origine && profilo
      ? agentPrompt({
          origin: origine,
          handle,
          forma: profilo.forma ?? "n",
          displayName: profilo.displayName,
          partenze: (partenze?.departures ?? []).map(d => d.name),
        })
      : "";
  const vaiAllaParte = (p: 1 | 2) => {
    setParte(p);
    // la parte nuova parte dall'inizio, non da dove si era scorso
    document.getElementById("acc-passo-titolo")?.scrollIntoView({ block: "start" });
  };

  if (parte === 1) {
    return (
      <Passo titolo="Collega il tuo agente">
        <p className="acc-sottopasso">1 di 2 · Il connettore</p>
        <p className="acc-nota">
          Collega il tuo agente AI preferito con un connettore MCP: aggiungi questo indirizzo nelle sue impostazioni e
          potrai modificare la tua pagina dalla sua chat.
        </p>

        <div className="acc-blocco">
          <p className="acc-etichetta">Indirizzo del server MCP</p>
          <div className="acc-riga">
            <code className="acc-codice">{mcp || "…/mcp"}</code>
            <Copia testo={mcp} />
          </div>
        </div>

        <ul className="acc-istruzioni">
          <li>
            <b>Claude</b> (sito o app): Impostazioni → Connettori → Aggiungi connettore personalizzato, incolla
            l'indirizzo, poi entra e autorizza.
          </li>
          <li>
            <b>ChatGPT</b>: Impostazioni → App e connettori → modalità sviluppatore → nuovo connettore con l'indirizzo
            (serve un piano che lo permetta).
          </li>
          <li>
            <b>Claude Code</b>: <code className="acc-codice">claude mcp add --transport http concerti {mcp || "…/mcp"}</code>,
            poi <code className="acc-codice">/mcp</code> per autorizzare.
          </li>
        </ul>

        <Navigazione indietro="partenze" avanti={() => vaiAllaParte(2)} fissa />
      </Passo>
    );
  }

  return (
    <Passo titolo="Collega il tuo agente">
      <p className="acc-sottopasso">2 di 2 · Il prompt</p>
      <div className="acc-blocco">
        <div className="acc-riga acc-riga--spazio">
          <p className="acc-etichetta">Il prompt da dare all'agente</p>
          <Copia testo={prompt} etichetta="Copia il prompt" />
        </div>
        <p className="acc-nota">Incollalo nella chat dell'agente: gli spiega la tua pagina e come aggiornarla.</p>
        <textarea className="acc-prompt" readOnly rows={6} value={prompt} aria-label="Prompt per l'agente" />
      </div>

      <div className="acc-blocco">
        <p className="acc-etichetta">Senza MCP</p>
        <p className="acc-nota">
          Puoi anche caricare un file CSV o JSON: se usi il prompt senza il connettore, l'agente ti preparerà un CSV da
          caricare qui sotto.
        </p>
        <ModelliImport colonne={false} />
        <ImportUpload contesto="onboarding" />
      </div>

      <Navigazione indietro={() => vaiAllaParte(1)} avanti="fatto" fissa />
    </Passo>
  );
}
