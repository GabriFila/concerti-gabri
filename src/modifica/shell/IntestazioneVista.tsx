/* ──────────────────────────────────────────────────────────────
   La testata di ogni vista di /<handle>/modifica (spec ux-modifica
   §4.6): il titolo (h1 `#<id>-titolo`, dove va il focus cambiando
   vista), una riga di numeri, una frase che spiega, e le azioni.

   - Una sola azione primaria per vista (ambra piena); le secondarie sono
     pulsanti chiari; il resto sta nel menu «Altre azioni» (⋯).
   - Sul telefono le secondarie entrano nel menu ⋯ e, se la vista ha un
     pulsante flottante (`fab`, solo Concerti), la primaria diventa quello.
   - L'aiuto lungo sta chiuso sotto la descrizione («Come funziona», o la
     domanda a cui risponde).
   ────────────────────────────────────────────────────────────── */

import type { ReactNode } from "react";
import { Icon } from "../../ui/Icon.tsx";
import { Menu, type VoceMenu } from "../ui/Menu.tsx";
import type { IdVista } from "../vista.ts";

/** Un'azione secondaria: un pulsante (onClick) o un link (href, anche in un'altra scheda). */
export interface AzioneVista {
  etichetta: string;
  onClick?: () => void;
  href?: string;
  /** Il link si apre in un'altra scheda. */
  esterna?: boolean;
  icona?: string;
}

export function IntestazioneVista({ id, titolo, meta, descrizione, primaria, secondarie = [], altro = [], fab, aiuto, titoloAiuto = "Come funziona" }: {
  id: IdVista;
  titolo: string;
  /** Numeri brevi sotto il titolo («84 eventi · 11 in programma»). */
  meta?: ReactNode;
  descrizione?: ReactNode;
  /** L'unica azione primaria della vista (un pulsante .mod-btn.mod-primario). */
  primaria?: ReactNode;
  secondarie?: AzioneVista[];
  altro?: VoceMenu[];
  /** Il pulsante flottante del telefono (<Fab>): lì prende il posto della primaria. */
  fab?: ReactNode;
  /** Il testo dell'aiuto, chiuso sotto la descrizione. */
  aiuto?: ReactNode;
  /** La domanda che lo apre («Come funziona», «Hai cambiato casa?»). */
  titoloAiuto?: string;
}) {
  // sul telefono le secondarie stanno nel menu, prima delle altre voci
  const voci: VoceMenu[] = [
    ...secondarie.map(a => ({
      etichetta: a.etichetta,
      icona: a.icona,
      soloCompatto: true as const,
      onClick: () => {
        if (a.onClick) a.onClick();
        else if (a.href) {
          if (a.esterna) window.open(a.href, "_blank", "noopener");
          else window.location.assign(a.href);
        }
      },
    })),
    ...altro,
  ];
  return (
    <header className="mf-intestazione" data-fab={fab ? "" : undefined}>
      <div className="mf-intestazione-riga">
        <div className="mf-intestazione-testi">
          <h1 id={`${id}-titolo`} tabIndex={-1}>{titolo}</h1>
          {meta && <p className="mf-intestazione-meta">{meta}</p>}
        </div>
        <div className="mf-intestazione-azioni">
          {voci.length > 0 && <Menu etichetta="Altre azioni" voci={voci} />}
          {secondarie.map(a => <Secondaria key={a.etichetta} a={a} />)}
          {primaria && <span className="mf-intestazione-primaria">{primaria}</span>}
        </div>
      </div>
      {descrizione && <p className="mf-intestazione-descrizione">{descrizione}</p>}
      {aiuto && (
        <details className="mf-aiuto">
          <summary>{titoloAiuto}</summary>
          <div className="mf-aiuto-testo">{aiuto}</div>
        </details>
      )}
      {fab}
    </header>
  );
}

function Secondaria({ a }: { a: AzioneVista }) {
  const contenuto = (
    <>
      {a.icona && <Icon name={a.icona} size={15} stroke={1.8} />}
      {a.etichetta}
      {a.esterna && <span className="mf-sr"> (si apre in una nuova scheda)</span>}
    </>
  );
  if (a.href) {
    return (
      <a className="mod-btn mf-btn-fantasma mf-intestazione-secondaria" href={a.href} {...(a.esterna ? { target: "_blank", rel: "noopener" } : {})}>
        {contenuto}
      </a>
    );
  }
  return (
    <button type="button" className="mod-btn mf-btn-fantasma mf-intestazione-secondaria" onClick={a.onClick}>
      {contenuto}
    </button>
  );
}

/** Il pulsante flottante del telefono (56 px, ambra): solo sotto i 768 px. */
export function Fab({ etichetta, testo, onClick }: { etichetta: string; testo: string; onClick: () => void }) {
  return (
    <button type="button" className="mf-fab" aria-label={etichetta} onClick={onClick}>
      <Icon name="plus" size={20} stroke={2.2} />
      <span aria-hidden="true">{testo}</span>
    </button>
  );
}
