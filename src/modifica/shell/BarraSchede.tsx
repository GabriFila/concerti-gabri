/* ──────────────────────────────────────────────────────────────
   Il telefono (sotto 768 px, spec ux-modifica §4.5): la barra in basso
   «Sezioni principali» con Concerti, Wishlist, l'Oracolo al centro,
   Attività e «Altro», che apre il foglio «Tutte le sezioni» con le altre
   sei viste e «Vedi la pagina». Il foglio è un <dialog> modale; aprirlo
   aggiunge una voce alla cronologia, quindi «indietro» lo chiude.
   I segni di distintivi.ts: il numero dei concerti da completare, il
   punto teal di Attività, e su «Altro» il punto ambra delle Partenze (lì
   come descrizione: il nome resta «Altro»).
   ────────────────────────────────────────────────────────────── */

import { useEffect, useRef, type MouseEvent } from "react";
import { useHydrated } from "@tanstack/react-router";
import { Icon } from "../../ui/Icon.tsx";
import { InterruttoreOracolo } from "../oracolo/Contenitore.tsx";
import { GRUPPI, SEZIONI_MODIFICA } from "../sezioni.ts";
import { useVista } from "../useVista.ts";
import type { Distintivi } from "./distintivi.ts";
import { LinkVista } from "./LinkVista.tsx";
import { IconaConSegno, Segno } from "./Navigazione.tsx";

const SCHEDE = SEZIONI_MODIFICA.filter(s => s.scheda);
const ALTRE = SEZIONI_MODIFICA.filter(s => !s.scheda);

export function BarraSchede({ altroAperto, onAltro, distintivi }: { altroAperto: boolean; onAltro: () => void; distintivi: Distintivi }) {
  const { vista } = useVista();
  // il foglio arriva con l'idratazione: prima il pulsante non risponderebbe
  const pronto = useHydrated();
  const scheda = (i: number) => {
    const s = SCHEDE[i];
    const d = distintivi[s.id];
    return (
      <LinkVista id={s.id} className="mf-scheda">
        <span className="mf-icona-segno">
          <Icon name={s.icona} size={22} stroke={1.6} />
          {d && d.tono !== "muto" && (d.conta !== undefined ? <span className={`mf-scheda-conta mf-segno-${d.tono}`} aria-hidden="true">{d.conta}</span> : <span className={`mf-punto mf-punto-${d.tono} mf-segno-icona`} aria-hidden="true" />)}
        </span>
        <span>{s.breve}</span>
        {d?.sr && <span className="mf-sr"> · {d.sr}</span>}
      </LinkVista>
    );
  };
  // il punto delle partenze: tra le viste di «Altro»
  const altro = ALTRE.map(s => distintivi[s.id]).find(d => d && d.tono !== "muto");
  return (
    <nav className="mf-schede" aria-label="Sezioni principali">
      {scheda(0)}
      {scheda(1)}
      <InterruttoreOracolo variante="scheda" />
      {scheda(2)}
      <button
        type="button"
        className="mf-scheda"
        aria-haspopup="dialog"
        aria-expanded={altroAperto}
        aria-current={vista && !SCHEDE.some(s => s.id === vista) ? "page" : undefined}
        aria-describedby={altro?.sr ? "mf-altro-segno" : undefined}
        disabled={!pronto}
        onClick={onAltro}
      >
        <IconaConSegno nome="menu" d={altro} size={22} />
        <span>Altro</span>
      </button>
      {altro?.sr && <span id="mf-altro-segno" hidden>{altro.sr}</span>}
    </nav>
  );
}

export function FoglioAltro({ handle, onChiudi, distintivi }: { handle: string; onChiudi: () => void; distintivi: Distintivi }) {
  const ref = useRef<HTMLDialogElement>(null);
  const chiudi = useRef(onChiudi);
  chiudi.current = onChiudi;
  // scelta una vista: il foglio si chiude subito (la sua voce nella cronologia la sostituisce la vista)
  const scelto = useRef(false);
  const scegli = () => {
    scelto.current = true;
    ref.current?.close();
  };

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const apritore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let nostro = false;
    d.showModal();
    d.querySelector<HTMLElement>("[aria-current=page]")?.focus({ preventScroll: true });
    const onCancel = (e: Event) => {
      e.preventDefault();
      chiudi.current();
    };
    const onClose = () => {
      if (!nostro && !scelto.current) chiudi.current();
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("close", onClose);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("close", onClose);
      nostro = true;
      if (d.open) d.close();
      // chiuso senza scegliere: il focus torna ad «Altro» (scegliendo, va al titolo della vista)
      const att = document.activeElement;
      if (!scelto.current && apritore?.isConnected && (!att || att === document.body || d.contains(att))) apritore.focus({ preventScroll: true });
    };
  }, []);

  // un tocco sullo sfondo, sopra il foglio, lo chiude
  const onClick = (e: MouseEvent<HTMLDialogElement>) => {
    const d = ref.current;
    if (!d || e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientY < r.top) chiudi.current();
  };

  return (
    <dialog ref={ref} className="mf-foglio" aria-labelledby="mf-foglio-titolo" onClick={onClick}>
      <div className="mf-foglio-testa">
        <h2 id="mf-foglio-titolo">Tutte le sezioni</h2>
        <button type="button" className="mf-icona" onClick={() => chiudi.current()} aria-label="Chiudi" title="Chiudi">
          <Icon name="close" size={18} stroke={2} />
        </button>
      </div>
      <a className="mf-foglio-voce" href={`/${handle}`} target="_blank" rel="noopener">
        <Icon name="external" size={20} stroke={1.6} />
        <span>Vedi la pagina</span>
        <span className="mf-sr"> (si apre in una nuova scheda)</span>
      </a>
      <nav aria-label="Altre sezioni">
        {GRUPPI.map(g => {
          const voci = ALTRE.filter(s => s.gruppo === g.id);
          if (!voci.length) return null;
          return (
            <div key={g.id} className="mf-foglio-gruppo">
              {g.titolo && <p className="mf-nav-titolo">{g.titolo}</p>}
              <ul>
                {voci.map(s => (
                  <li key={s.id}>
                    <LinkVista id={s.id} className="mf-foglio-voce" sostituisci onScelta={scegli}>
                      <Icon name={s.icona} size={20} stroke={1.6} />
                      <span className="mf-foglio-testo">{s.titolo}</span>
                      <Segno d={distintivi[s.id]} />
                    </LinkVista>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </dialog>
  );
}
