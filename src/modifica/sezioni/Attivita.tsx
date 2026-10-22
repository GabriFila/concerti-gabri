/* ──────────────────────────────────────────────────────────────
   #attivita (T5; PIANO §1.30, §5.7): ogni scrittura sulla pagina, con chi
   l'ha fatta (dashboard, Oracolo, MCP, API key, sistema) e «Annulla».

   Annulla riesce solo se il documento non è cambiato dopo (i km non
   contano); unioni di persone e import si annullano in blocco; i ricalcoli
   del sistema, i cambi di logo e le venue del catalogo non si annullano.
   Annullare è a sua volta una voce: annullarla rifà l'operazione.
   ────────────────────────────────────────────────────────────── */

import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { SezioneProps } from "../tipi.ts";
import { Caricamento, CorniceSezione, Errore, useConvex, useDati, useOperazione } from "./comuni.tsx";

type Voce = FunctionReturnType<typeof api.activity.list>["voci"][number];

const PASSO = 30;
const MASSIMO = 100;

const ora = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function SezioneAttivita(_props: SezioneProps) {
  const [limite, setLimite] = useState(PASSO);
  const q = useDati(api.activity.list, { limite }, { tieni: true });
  return (
    <CorniceSezione>
      <p className="mod-hint">Le ultime modifiche alla tua pagina, da qualunque parte arrivino. Si conservano per 180 giorni.</p>
      <Caricamento q={q}>
        {({ voci }) => (
          <>
            {voci.length === 0 ? (
              <p className="mod-vuoto">Ancora niente.</p>
            ) : (
              <ul className="mod-lista mod-registro" aria-label="Registro delle attività">
                {voci.map(v => <RigaVoce key={v.id} v={v} />)}
              </ul>
            )}
            {voci.length >= limite && limite < MASSIMO && (
              <button type="button" className="mod-link" onClick={() => setLimite(l => Math.min(MASSIMO, l + PASSO))}>Mostra altre</button>
            )}
          </>
        )}
      </Caricamento>
    </CorniceSezione>
  );
}

function RigaVoce({ v }: { v: Voce }) {
  const convex = useConvex();
  const op = useOperazione();
  return (
    <li className={`mod-voce${v.annullata ? " mod-voce-annullata" : ""}`}>
      <time className="mod-voce-ora" dateTime={new Date(v.at).toISOString()}>{ora.format(v.at)}</time>
      <span className={`mod-autore mod-autore-${v.via}`}>{v.autore}</span>
      <span className="mod-voce-testo">
        {v.riassunto}
        {v.lotto && <span className="mod-tag">in blocco</span>}
        {v.annullata && <span className="mod-tag">annullata</span>}
      </span>
      <span className="mod-evento-azioni">
        {v.annullabile && !v.annullata && (
          <button type="button" className="mod-btn" disabled={op.inCorso} aria-label={`Annulla: ${v.riassunto}`} onClick={() => void op.esegui(() => convex.mutation(api.activity.undo, { activityId: v.id }))}>
            {op.inCorso ? "Annullo…" : "Annulla"}
          </button>
        )}
      </span>
      <Errore errore={op.errore} />
    </li>
  );
}
