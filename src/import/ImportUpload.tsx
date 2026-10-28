/* ──────────────────────────────────────────────────────────────
   Import CSV/JSON (contratto di ondata): file → anteprima con righe ed
   errori → conferma sopra CONFIRM_IMPORT_ROWS → un lotto annullabile.
   Lo implementa la corsia 7; lo usano #agenti e il passo 3 di
   /benvenuto (corsia 3).

   - L'anteprima è `importer.preview` (dashboardOnly): valida TUTTE le
     righe, formato e riferimenti (venue e partenze devono esistere),
     senza scrivere niente. Con un errore non si importa nessuna riga.
   - L'import è `importer.apply` (import_concerts), che rifà la stessa
     validazione e scrive con un solo batchId: "Annulla l'import" annulla
     il lotto intero dal registro, anche se parziale.
   - I messaggi d'errore arrivano dal server già senza valori.
   ────────────────────────────────────────────────────────────── */

import { useId, useRef, useState } from "react";
import { useHydrated } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { REGOLA_SOPRANNOMI } from "../../shared/schema/campi.ts";
import { COLONNE_CSV, CONFIRM_IMPORT_ROWS, DESCRIZIONE_COLONNE, SEPARATORE_CON } from "../../shared/schema/importFormat.ts";
import { Errore, erroreDi, frase, useConvexProprietario, type ErroreUi } from "./comuni.tsx";
import { formatoDi, messaggioRiga, problemaFile, riassuntoAnteprima, riassuntoEsito, type Formato } from "./file.ts";

export interface ImportUploadProps {
  contesto: "agenti" | "onboarding";
  /** Dopo un import riuscito (anche parziale). */
  onImportato?: (esito: { importate: number; totale: number; batchId: string }) => void;
}

type Anteprima = FunctionReturnType<typeof api.importer.preview>;
type Esito = FunctionReturnType<typeof api.importer.apply>;
interface FileLetto {
  nome: string;
  formato: Formato;
  contenuto: string;
}

type Stato =
  | { fase: "vuoto"; errore?: ErroreUi }
  | { fase: "leggo"; nome: string }
  | { fase: "anteprima"; file: FileLetto; anteprima: Anteprima; conferma: boolean; errore?: ErroreUi }
  | { fase: "importo"; file: FileLetto; anteprima: Anteprima }
  | { fase: "fatto"; esito: Esito; annullato?: boolean; inCorso?: boolean; errore?: ErroreUi };

/** Errori mostrati per esteso; gli altri si contano. */
const ERRORI_VISIBILI = 20;

const MODELLO_VUOTO = `data:text/csv;charset=utf-8,${encodeURIComponent(COLONNE_CSV.join(",") + "\n")}`;

const righe = (n: number) => (n === 1 ? "1 riga" : `${n} righe`);

export function ImportUpload({ contesto, onImportato }: ImportUploadProps) {
  const idratata = useHydrated();
  const convex = useConvexProprietario();
  const [stato, setStato] = useState<Stato>({ fase: "vuoto" });
  const input = useRef<HTMLInputElement>(null);
  const idInput = useId();

  const ricomincia = () => {
    setStato({ fase: "vuoto" });
    if (input.current) input.current.value = "";
  };

  async function scegli(f: File | undefined) {
    if (!f) return;
    const problema = problemaFile(f.size);
    if (problema) return setStato({ fase: "vuoto", errore: { code: "file", messaggio: problema } });
    setStato({ fase: "leggo", nome: f.name });
    try {
      const contenuto = await f.text();
      const dopo = problemaFile(f.size, contenuto);
      if (dopo) return setStato({ fase: "vuoto", errore: { code: "file", messaggio: dopo } });
      const file = { nome: f.name, formato: formatoDi(f.name, contenuto), contenuto };
      const anteprima = await convex.query(api.importer.preview, { formato: file.formato, contenuto });
      setStato({ fase: "anteprima", file, anteprima, conferma: false });
    } catch (e) {
      setStato({ fase: "vuoto", errore: erroreDi(e) });
    }
  }

  async function importa(file: FileLetto, anteprima: Anteprima) {
    setStato({ fase: "importo", file, anteprima });
    try {
      const esito = await convex.action(api.importer.apply, {
        formato: file.formato,
        contenuto: file.contenuto,
        ...(anteprima.serveConferma ? { confirm: true } : {}),
      });
      setStato({ fase: "fatto", esito });
      onImportato?.({ importate: esito.importate, totale: esito.totale, batchId: esito.batchId });
    } catch (e) {
      setStato({ fase: "anteprima", file, anteprima, conferma: false, errore: erroreDi(e) });
    }
  }

  async function annulla(esito: Esito) {
    setStato({ fase: "fatto", esito, inCorso: true });
    try {
      // il lotto si annulla da una qualunque delle sue voci di registro
      const { voci } = await convex.query(api.activity.list, { limite: 100 });
      const voce = voci.find(v => v.lotto === esito.batchId && !v.annullata);
      if (!voce) {
        return setStato({ fase: "fatto", esito, errore: { code: "not_found", messaggio: "non trovo l'import nel registro: annullalo da #attivita" } });
      }
      await convex.mutation(api.activity.undo, { activityId: voce.id });
      setStato({ fase: "fatto", esito, annullato: true });
    } catch (e) {
      setStato({ fase: "fatto", esito, errore: erroreDi(e) });
    }
  }

  function avanti(s: Extract<Stato, { fase: "anteprima" }>) {
    // sopra la soglia il primo clic chiede conferma, il secondo importa
    if (s.anteprima.serveConferma && !s.conferma) setStato({ ...s, conferma: true, errore: undefined });
    else importa(s.file, s.anteprima);
  }

  let corpo;
  if (!idratata) corpo = <p className="ag-attesa" aria-busy="true">Carico…</p>;
  else if (stato.fase === "fatto") corpo = <EsitoImport stato={stato} onAnnulla={() => annulla(stato.esito)} onAltro={ricomincia} />;
  else {
    corpo = (
      <>
        <div className="ag-riga">
          <input
            ref={input}
            id={idInput}
            className="ag-file-input"
            type="file"
            accept=".csv,.json,.tsv,.txt,text/csv,application/json"
            disabled={stato.fase === "leggo" || stato.fase === "importo"}
            onChange={e => scegli(e.currentTarget.files?.[0])}
            aria-label="File da importare (CSV o JSON)"
          />
          <label className="ag-btn ag-primario ag-file" htmlFor={idInput}>
            {stato.fase === "vuoto" ? "Scegli un file CSV o JSON" : "Scegli un altro file"}
          </label>
          {stato.fase === "leggo" && <span className="ag-attesa" aria-busy="true">Controllo {stato.nome}…</span>}
        </div>
        <p className="ag-hint">
          Le venue devono essere già nel catalogo (si cercano da #concerti) e le partenze già create; compagni e "regalato da"
          nuovi nascono con l'import. {REGOLA_SOPRANNOMI}.
        </p>
        {contesto === "agenti" && <FormatoFile />}
        {stato.fase === "vuoto" && <Errore errore={stato.errore} />}
        {(stato.fase === "anteprima" || stato.fase === "importo") && (
          <RiquadroAnteprima
            stato={stato}
            onImporta={() => stato.fase === "anteprima" && avanti(stato)}
            onNo={() => stato.fase === "anteprima" && setStato({ ...stato, conferma: false })}
            onLascia={ricomincia}
          />
        )}
      </>
    );
  }

  return (
    <div className="ag-import" data-contesto={contesto}>
      {corpo}
    </div>
  );
}

function RiquadroAnteprima({ stato, onImporta, onNo, onLascia }: {
  stato: Extract<Stato, { fase: "anteprima" | "importo" }>;
  onImporta: () => void;
  onNo: () => void;
  onLascia: () => void;
}) {
  const { anteprima: a, file } = stato;
  const importo = stato.fase === "importo";
  const conferma = stato.fase === "anteprima" && stato.conferma;
  return (
    <section className="ag-anteprima" aria-label="Anteprima dell'import">
      <p className="ag-anteprima-titolo">
        <b>{file.nome}</b> · {file.formato.toUpperCase()}
      </p>
      <p className="ag-anteprima-conta" data-testid="import-conteggio">
        {riassuntoAnteprima(a)}
      </p>
      {a.errori.length ? (
        <div className="ag-errore" role="alert">
          <p>
            {a.errori.length === 1 ? "C'è un errore" : `Ci sono ${a.errori.length} errori`}: nessuna riga verrà importata finché
            non {a.errori.length === 1 ? "lo correggi" : "li correggi"} nel file.
          </p>
          <ul className="ag-elenco">
            {a.errori.slice(0, ERRORI_VISIBILI).map((e, i) => (
              <li key={i}>
                <b>{e.riga ? `Riga ${e.riga}` : "File"}</b>
                {e.campo ? ` · ${e.campo}` : ""}: {messaggioRiga(e)}
              </li>
            ))}
            {a.errori.length > ERRORI_VISIBILI && <li>…e altri {a.errori.length - ERRORI_VISIBILI}.</li>}
          </ul>
        </div>
      ) : (
        <>
          {a.nuovePersone.length > 0 && <p className="ag-hint">Persone nuove ({a.nuovePersone.length}): {a.nuovePersone.join(", ")}.</p>}
          {a.nuoviRegali.length > 0 && <p className="ag-hint">"Regalato da" nuovi ({a.nuoviRegali.length}): {a.nuoviRegali.join(", ")}.</p>}
          {a.nuoveVenue.length > 0 && (
            <p className="ag-hint">
              Venue nuove ({a.nuoveVenue.length}): {a.nuoveVenue.join(", ")}. Si aggiungono al catalogo condiviso; la posizione la cerchiamo su OpenStreetMap.
            </p>
          )}
          {conferma ? (
            <div className="ag-conferma" role="group" aria-label="Conferma l'import">
              <p>
                Sono {righe(a.righe)}, più di {CONFIRM_IMPORT_ROWS}: confermi l'import? Si annulla in blocco, da qui o da #attivita.
              </p>
              <div className="ag-riga">
                <button type="button" className="ag-btn ag-primario" onClick={onImporta}>
                  Sì, importa {righe(a.righe)}
                </button>
                <button type="button" className="ag-btn" onClick={onNo}>
                  No
                </button>
              </div>
            </div>
          ) : (
            <div className="ag-riga">
              <button type="button" className="ag-btn ag-primario" onClick={onImporta} disabled={importo || a.voci === 0}>
                {importo ? "Importo…" : `Importa ${righe(a.righe)}`}
              </button>
              <button type="button" className="ag-btn" onClick={onLascia} disabled={importo}>
                Lascia stare
              </button>
            </div>
          )}
        </>
      )}
      {stato.fase === "anteprima" && <Errore errore={stato.errore} />}
    </section>
  );
}

function EsitoImport({ stato, onAnnulla, onAltro }: { stato: Extract<Stato, { fase: "fatto" }>; onAnnulla: () => void; onAltro: () => void }) {
  const { esito } = stato;
  return (
    <section className="ag-esito" aria-label="Esito dell'import">
      {stato.annullato ? (
        <p className="ag-ok" role="status">
          Import annullato: la pagina è tornata com'era.
        </p>
      ) : (
        <p className={esito.parziale ? "ag-attenzione" : "ag-ok"} role="status">
          {riassuntoEsito(esito)}
          {esito.parziale && esito.messaggio ? ` ${frase(esito.messaggio)}` : ""}
        </p>
      )}
      {!stato.annullato && esito.parziale && esito.errore && <Errore errore={esito.errore} />}
      <Errore errore={stato.errore} />
      <div className="ag-riga">
        {!stato.annullato && (
          <button type="button" className="ag-btn" onClick={onAnnulla} disabled={stato.inCorso}>
            {stato.inCorso ? "Annullo…" : "Annulla l'import"}
          </button>
        )}
        <button type="button" className="ag-btn" onClick={onAltro} disabled={stato.inCorso}>
          Importa un altro file
        </button>
      </div>
    </section>
  );
}

/** Le colonne del CSV e il modello vuoto (solo in #agenti: /benvenuto ha già i modelli d'esempio). */
function FormatoFile() {
  return (
    <details className="ag-dettagli">
      <summary>Formato del file</summary>
      <p className="ag-hint">
        CSV con l'intestazione (colonne in qualunque ordine, separate da virgola o punto e virgola) oppure JSON (un array di
        concerti e festival). Nella colonna "con" i nomi si separano con "{SEPARATORE_CON}".
      </p>
      <dl className="ag-colonne">
        {COLONNE_CSV.map(c => (
          <div key={c}>
            <dt>{c}</dt>
            <dd>{DESCRIZIONE_COLONNE[c]}</dd>
          </div>
        ))}
      </dl>
      <a className="ag-link" href={MODELLO_VUOTO} download="concerti-modello.csv">
        Scarica il modello CSV (solo intestazione)
      </a>
    </details>
  );
}
