/* Passo 3 di /benvenuto, "collega il tuo agente" (SPEC §2, consigliato):
   l'URL MCP, le istruzioni per Claude, ChatGPT e Claude Code, il prompt
   pronto (shared/agentPrompt.ts) e, senza MCP, il modello CSV/JSON da far
   compilare all'agente e da caricare qui (ImportUpload, corsia 7). */

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

  return (
    <Passo titolo="Collega il tuo agente">
      <p className="acc-nota">
        Consigliato: con il server MCP collegato, il tuo agente AI (Claude, ChatGPT…) legge le email dei biglietti e il
        calendario e scrive i concerti direttamente qui. La pagina si riempie mentre lavora.
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
          <b>Claude</b> (sito o app): Impostazioni → Connettori → Aggiungi connettore personalizzato, incolla l'indirizzo,
          poi entra e autorizza.
        </li>
        <li>
          <b>ChatGPT</b>: Impostazioni → App e connettori → modalità sviluppatore → nuovo connettore con l'indirizzo (serve
          un piano che lo permetta).
        </li>
        <li>
          <b>Claude Code</b>: <code className="acc-codice">claude mcp add --transport http concerti {mcp || "…/mcp"}</code>,
          poi <code className="acc-codice">/mcp</code> per autorizzare.
        </li>
      </ul>

      <div className="acc-blocco">
        <div className="acc-riga acc-riga--spazio">
          <p className="acc-etichetta">Il prompt da dare all'agente</p>
          <Copia testo={prompt} etichetta="Copia il prompt" />
        </div>
        <textarea className="acc-prompt" readOnly rows={12} value={prompt} aria-label="Prompt per l'agente" />
      </div>

      <div className="acc-blocco">
        <p className="acc-etichetta">Senza MCP</p>
        <p className="acc-nota">
          Lo stesso prompt fa preparare all'agente un file CSV: caricalo qui sotto. I modelli mostrano le colonne e un
          esempio di concerto e di festival.
        </p>
        <ModelliImport />
        <ImportUpload contesto="onboarding" />
      </div>

      <Navigazione indietro="partenze" avanti="regali" />
    </Passo>
  );
}
