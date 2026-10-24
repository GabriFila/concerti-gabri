/* ──────────────────────────────────────────────────────────────
   La navigazione di /<handle>/modifica da tablet in su (spec ux-modifica
   §4.4): barra laterale da 232 px con i gruppi, o binario da 72 px con
   icona ed etichetta corta (sotto i 1280 px, quando l'Oracolo agganciato
   ruba lo spazio, o se il proprietario la riduce). Attività e Account
   stanno in fondo. La classe `modifica-indice` e i 9 link
   `…/modifica#<id>` sono il contratto degli e2e (guard-modifica.spec.ts).
   Il modo lo decide .mf-app[data-nav] (prima dell'idratazione le media
   query di modifica.css).

   Accanto alle voci i segni di distintivi.ts (solo dopo l'idratazione):
   nella barra larga il numero o il punto a destra, nel binario un punto
   sull'icona (i conteggi grigi lì non ci stanno). Ambra e teal hanno un
   testo per lo screen reader; i conteggi grigi no.
   ────────────────────────────────────────────────────────────── */

import { Icon } from "../../ui/Icon.tsx";
import { GRUPPI, SEZIONI_MODIFICA, type SezioneModifica } from "../sezioni.ts";
import type { Distintivi, Distintivo } from "./distintivi.ts";
import { LinkVista } from "./LinkVista.tsx";

/** L'icona di una voce con il punto del binario (ambra o teal). */
export function IconaConSegno({ nome, d, size }: { nome: string; d?: Distintivo; size: number }) {
  return (
    <span className="mf-icona-segno">
      <Icon name={nome} size={size} stroke={1.6} />
      {d && d.tono !== "muto" && <span className={`mf-punto mf-punto-${d.tono} mf-segno-icona`} aria-hidden="true" />}
    </span>
  );
}

/** Il numero o il punto a destra di una voce, e il testo per lo screen reader. */
export function Segno({ d }: { d?: Distintivo }) {
  if (!d) return null;
  return (
    <>
      {d.conta !== undefined ? (
        <span className={`mf-segno-conta mf-segno-${d.tono}`} aria-hidden="true">{d.conta}</span>
      ) : (
        <span className={`mf-segno-punto mf-punto-${d.tono}`} aria-hidden="true" />
      )}
      {d.sr && <span className="mf-sr"> · {d.sr}</span>}
    </>
  );
}

function Voce({ s, d }: { s: SezioneModifica; d?: Distintivo }) {
  return (
    <li>
      <LinkVista id={s.id} className="mf-nav-voce" title={s.titolo}>
        <IconaConSegno nome={s.icona} d={d} size={18} />
        <span className="mf-nav-testo">{s.titolo}</span>
        <span className="mf-nav-breve" aria-hidden="true">{s.breve}</span>
        <Segno d={d} />
      </LinkVista>
    </li>
  );
}

export function Navigazione({ comprimi, distintivi }: {
  /** Il pulsante «Comprimi/Espandi il menu» (da 1280 px, quando l'Oracolo non decide già lui). */
  comprimi: { compresso: boolean; alterna: () => void } | null;
  distintivi: Distintivi;
}) {
  const fondo = SEZIONI_MODIFICA.filter(s => s.gruppo === "sistema");
  return (
    <nav className="modifica-indice mf-nav" aria-label="Sezioni di Modifica">
      <div className="mf-nav-gruppi">
        {GRUPPI.filter(g => g.id !== "sistema").map(g => (
          <div key={g.id} className="mf-nav-gruppo">
            <p className="mf-nav-titolo" id={`mf-nav-${g.id}`}>{g.titolo}</p>
            <ul aria-labelledby={`mf-nav-${g.id}`}>
              {SEZIONI_MODIFICA.filter(s => s.gruppo === g.id).map(s => <Voce key={s.id} s={s} d={distintivi[s.id]} />)}
            </ul>
          </div>
        ))}
      </div>
      <div className="mf-nav-fondo">
        <ul>
          {fondo.map(s => <Voce key={s.id} s={s} d={distintivi[s.id]} />)}
        </ul>
        {comprimi && (
          <button type="button" className="mf-nav-comprimi" onClick={comprimi.alterna} title={comprimi.compresso ? "Espandi il menu" : "Comprimi il menu"}>
            <Icon name="sidebar" size={18} stroke={1.6} />
            <span className="mf-nav-testo">{comprimi.compresso ? "Espandi il menu" : "Comprimi il menu"}</span>
            {comprimi.compresso && <span className="mf-sr">Espandi il menu</span>}
          </button>
        )}
      </div>
    </nav>
  );
}
