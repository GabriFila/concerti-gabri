/* ──────────────────────────────────────────────────────────────
   Il menu «⋯» di /<handle>/modifica (spec ux-modifica §5.3): le azioni
   in più di una riga, di una vista o di un pannello, dietro un pulsante.

   - Il menu è un `popover="auto"` (top layer: sta sopra a pannelli e
     Oracolo; un clic fuori lo chiude) con role="menu" e voci
     role="menuitem". Sta accanto al suo pulsante nel DOM, così funziona
     anche dentro una finestra modale.
   - Tastiera: ↑ ↓ Home Fine tra le voci, Invio/Spazio sceglie, Esc e Tab
     chiudono e riportano il focus al pulsante. Esc viene consumato
     (preventDefault): non chiude anche il pannello sotto.
   - Le voci distruttive vanno in fondo, dopo un separatore, in rosso, con
     «…» se chiedono conferma.
   - Sul telefono (< 768 px) lo stesso menu è un foglio di azioni dal basso,
     con righe da 48 px e «Chiudi»; in cima il nome della riga («Altre
     azioni per Lu» → «Lu»), perché il foglio la copre.
   ────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../../ui/Icon.tsx";

export interface VoceMenu {
  etichetta: string;
  onClick: () => void;
  /** Un glifo di src/ui/Icon.tsx. */
  icona?: string;
  /** Distruttiva: in fondo, dopo un separatore, in rosso. */
  pericolo?: boolean;
  disabilitata?: boolean;
  /** Solo sul telefono: le azioni secondarie di una testata, che lì stanno nel menu. */
  soloCompatto?: boolean;
}

const COMPATTO = "(max-width:767px)";
const VOCI = '[role="menuitem"]:not(:disabled)';

/** Le voci che si vedono adesso (quelle «solo telefono» sul desktop no). */
const visibili = (m: HTMLElement) => [...m.querySelectorAll<HTMLElement>(VOCI)].filter(v => v.offsetParent !== null || v.getClientRects().length > 0);

export function Menu({ etichetta, voci, className, testo }: {
  /** Il nome del pulsante: «Altre azioni», «Altre azioni per {oggetto}». */
  etichetta: string;
  voci: VoceMenu[];
  className?: string;
  /** Un testo accanto ai puntini (di solito niente). */
  testo?: string;
}) {
  const id = useId();
  const pulsante = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [aperto, setAperto] = useState(false);
  const [foglio, setFoglio] = useState(false);

  const normali = voci.filter(v => !v.pericolo);
  const pericolose = voci.filter(v => v.pericolo);
  // «Altre azioni per Lu» → «Lu»: il titolo del foglio sul telefono
  const oggetto = /^Altre azioni per\s+/.test(etichetta) ? etichetta.replace(/^Altre azioni per\s+/, "") : null;

  // hidePopover() rimette il focus dov'era prima di aprire (il pulsante)
  const chiudi = useCallback(() => {
    try {
      menu.current?.hidePopover();
    } catch {
      // già chiuso
    }
  }, []);

  // accanto al pulsante, sotto (o sopra, se sotto non c'è posto), allineato a destra
  const posiziona = useCallback(() => {
    const m = menu.current;
    const p = pulsante.current;
    if (!m || !p || window.matchMedia(COMPATTO).matches) return;
    const r = p.getBoundingClientRect();
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    const sotto = r.bottom + 4 + h <= window.innerHeight - 8 || r.top - 4 - h < 8;
    m.style.top = `${Math.round(sotto ? r.bottom + 4 : r.top - 4 - h)}px`;
    m.style.left = `${Math.round(Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8))}px`;
  }, []);

  // da dove partire con il focus all'apertura (↑ sul pulsante: dall'ultima voce)
  const daUltima = useRef(false);

  useEffect(() => {
    const m = menu.current;
    if (!m) return;
    // prima di mostrarlo: foglio dal basso sul telefono, e invisibile finché non è al suo posto
    const onPrima = (e: Event) => {
      if ((e as Event & { newState?: string }).newState !== "open") return;
      const sheet = window.matchMedia(COMPATTO).matches;
      m.toggleAttribute("data-foglio", sheet);
      if (sheet) m.style.top = m.style.left = "";
      m.removeAttribute("data-pronto");
      setFoglio(sheet);
    };
    const onToggle = (e: Event) => {
      const aprendo = (e as Event & { newState?: string }).newState === "open";
      setAperto(aprendo);
      if (aprendo) {
        posiziona();
        m.setAttribute("data-pronto", "");
        const v = visibili(m);
        (daUltima.current ? v[v.length - 1] : v[0])?.focus({ preventScroll: true });
        daUltima.current = false;
        return;
      }
      // chiuso con il focus perso (Safari non lo dà ai pulsanti): torna al pulsante; se è andato altrove (un pannello aperto dalla voce) resta lì
      const att = document.activeElement;
      if (!att || att === document.body || m.contains(att)) pulsante.current?.focus({ preventScroll: true });
    };
    m.addEventListener("beforetoggle", onPrima);
    m.addEventListener("toggle", onToggle);
    return () => {
      m.removeEventListener("beforetoggle", onPrima);
      m.removeEventListener("toggle", onToggle);
    };
  }, [posiziona]);

  // mentre è aperto: la pagina che scorre o cambia misura lo chiude (la posizione non varrebbe più)
  useEffect(() => {
    if (!aperto || foglio) return;
    const via = () => chiudi();
    window.addEventListener("scroll", via, { capture: true, passive: true });
    window.addEventListener("resize", via);
    return () => {
      window.removeEventListener("scroll", via, { capture: true });
      window.removeEventListener("resize", via);
    };
  }, [aperto, foglio, chiudi]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const m = menu.current;
    if (!m) return;
    const v = visibili(m);
    const i = v.indexOf(document.activeElement as HTMLElement);
    const vai = (j: number) => v[(j + v.length) % v.length]?.focus();
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); vai(i + 1); break;
      case "ArrowUp": e.preventDefault(); vai(i - 1); break;
      case "Home": e.preventDefault(); vai(0); break;
      case "End": e.preventDefault(); vai(v.length - 1); break;
      case "Escape":
      case "Tab":
        e.preventDefault();
        e.stopPropagation();
        chiudi();
        break;
    }
  };

  const scegli = (v: VoceMenu) => {
    chiudi();
    v.onClick();
  };

  const voce = (v: VoceMenu) => (
    <button
      key={v.etichetta}
      type="button"
      role="menuitem"
      className={`mf-menu-voce${v.pericolo ? " mf-menu-pericolo" : ""}${v.soloCompatto ? " mf-solo-compatto" : ""}`}
      disabled={v.disabilitata}
      onClick={() => scegli(v)}
    >
      {v.icona && <Icon name={v.icona} size={16} stroke={1.7} />}
      <span>{v.etichetta}</span>
    </button>
  );

  // solo azioni «da telefono»: sul desktop il pulsante non serve
  const soloCompatto = voci.length > 0 && voci.every(v => v.soloCompatto);

  return (
    <span className={`mf-menu-ancora${soloCompatto ? " mf-solo-compatto" : ""}${className ? ` ${className}` : ""}`}>
      <button
        ref={pulsante}
        type="button"
        className={`mf-icona mf-menu-pulsante${testo ? " mf-menu-pulsante-testo" : ""}`}
        aria-haspopup="menu"
        aria-expanded={aperto}
        aria-controls={id}
        aria-label={etichetta}
        title={etichetta}
        popoverTarget={id}
        onKeyDown={e => {
          if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !aperto) {
            e.preventDefault();
            daUltima.current = e.key === "ArrowUp";
            menu.current?.showPopover();
          }
        }}
      >
        <Icon name="more" size={18} stroke={2.2} />
        {testo && <span>{testo}</span>}
      </button>
      <div ref={menu} id={id} popover="auto" role="menu" aria-label={etichetta} className="mf-menu" onKeyDown={onKeyDown}>
        {/* sul telefono il foglio copre la riga: in cima si legge di cosa sono le azioni (il nome del menu lo dice già allo screen reader) */}
        {foglio && oggetto && (
          <p className="mf-menu-titolo" aria-hidden="true">
            {oggetto}
          </p>
        )}
        {normali.map(voce)}
        {pericolose.length > 0 && normali.length > 0 && <div role="separator" className="mf-menu-separatore" />}
        {pericolose.map(voce)}
        {foglio && (
          <button type="button" role="menuitem" className="mf-menu-voce mf-menu-chiudi" onClick={() => chiudi()}>
            <span>Chiudi</span>
          </button>
        )}
      </div>
    </span>
  );
}
