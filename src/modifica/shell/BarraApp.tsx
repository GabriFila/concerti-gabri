/* ──────────────────────────────────────────────────────────────
   La barra in alto di /<handle>/modifica (spec ux-modifica §4.3): fissa,
   sotto lo switch Sul palco · I dati · Modifica e il pulsante del tema
   dello Shell (che restano dove sono: il centro e l'angolo destro sono
   liberi). A sinistra «Modifica /handle», a destra «Vedi la pagina» (in
   un'altra scheda: le modifiche arrivano dal vivo) e l'Oracolo. Sul
   telefono è solo lo sfondo dello switch.
   ────────────────────────────────────────────────────────────── */

import { Icon } from "../../ui/Icon.tsx";
import { InterruttoreOracolo } from "../oracolo/Contenitore.tsx";

export function BarraApp({ handle }: { handle: string }) {
  return (
    <header className="mf-barra-app">
      <div className="mf-marchio">
        <p className="mf-marchio-titolo">Modifica</p>
        <p className="mf-marchio-handle">/{handle}</p>
      </div>
      <div className="mf-barra-azioni">
        <a className="mf-barra-link" href={`/${handle}`} target="_blank" rel="noopener" title="Vedi la pagina (si apre in una nuova scheda)">
          <Icon name="external" size={17} stroke={1.8} />
          <span className="mf-barra-testo">Vedi la pagina</span>
          <span className="mf-sr"> (si apre in una nuova scheda)</span>
        </a>
        <InterruttoreOracolo variante="barra" />
      </div>
    </header>
  );
}
