/* I modelli scaricabili dell'import (CSV e JSON, shared/modelloImport.ts)
   con accanto la regola dei soprannomi (PIANO §1.42) e la guida delle
   colonne (solo in #agenti: il passo 3 di /benvenuto la toglie con
   `colonne={false}`). Lo usano il passo 3 di /benvenuto e #agenti (corsia 7). */

import { GUIDA_COLONNE, modelloCsv, modelloJson, NOTA_MODELLI } from "../../shared/modelloImport.ts";

const dataUrl = (tipo: string, testo: string) => `data:${tipo};charset=utf-8,${encodeURIComponent(testo)}`;

export function ModelliImport({ colonne = true }: { colonne?: boolean }) {
  return (
    <div className="acc-modelli">
      <p className="acc-riga">
        <a className="acc-link" href={dataUrl("text/csv", modelloCsv())} download="concerti-modello.csv">
          Scarica il modello CSV
        </a>
        <a className="acc-link" href={dataUrl("application/json", modelloJson())} download="concerti-modello.json">
          Scarica il modello JSON
        </a>
      </p>
      <p className="acc-suggerimento">{NOTA_MODELLI}</p>
      {colonne && (
        <details className="acc-colonne">
          <summary>Le colonne del modello</summary>
          <dl>
            {GUIDA_COLONNE.map(({ colonna, descrizione }) => (
              <div key={colonna}>
                <dt>{colonna}</dt>
                <dd>{descrizione}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
