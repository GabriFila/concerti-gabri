/* ──────────────────────────────────────────────────────────────
   Uno scorrimento orizzontale col dito passa alla sezione accanto: tra
   «Sul palco» e «I dati» (shell/Shell.tsx) e tra le viste di /modifica
   sul telefono (modifica/Scheletro.tsx). Dito verso sinistra = la
   sezione dopo, verso destra = quella prima; niente giro dal fondo
   all'inizio.

   Il gesto non vale quando un altro lo usa già:
   - parte dentro un campo, una finestra (dialog, aria-modal), la mappa,
     un elemento che ha un suo gesto orizzontale (`data-gesto`: le schede
     con le viste da sfogliare, il grafico che si sposta) o un'area che
     scorre di lato davvero (la tabella dei concerti, le pastiglie);
   - parte vicino al bordo dello schermo (il gesto «indietro» di iOS e
     Android);
   - c'è una finestra modale aperta, due dita (zoom), o del testo
     selezionato;
   - è lento o più verticale che orizzontale (si sta scorrendo la pagina).
   ────────────────────────────────────────────────────────────── */

import { useEffect, useRef } from "react";

/** Quanto deve correre il dito, in px, e quanto più in orizzontale che in verticale. */
export const SOGLIA_PX = 64;
export const RAPPORTO = 2;
/** Oltre questo tempo non è uno scorrimento ma un trascinamento. */
export const DURATA_MAX_MS = 800;
/** La fascia ai bordi che resta al gesto «indietro» del sistema. */
export const BORDO_PX = 24;

export type Direzione = "precedente" | "successivo";

/** Pura: dato lo spostamento del dito, la direzione o null. */
export function direzioneScorrimento(m: { x0: number; dx: number; dy: number; ms: number; larghezza: number }): Direzione | null {
  if (m.x0 < BORDO_PX || m.x0 > m.larghezza - BORDO_PX) return null;
  if (m.ms > DURATA_MAX_MS) return null;
  if (Math.abs(m.dx) < SOGLIA_PX || Math.abs(m.dx) < Math.abs(m.dy) * RAPPORTO) return null;
  return m.dx < 0 ? "successivo" : "precedente";
}

const ESCLUSI = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog, [role="dialog"], [data-gesto], .mapboxgl-map';

/** Il tocco parte dentro qualcosa che usa già il gesto orizzontale. */
function occupato(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return true;
  if (t.closest(ESCLUSI)) return true;
  for (let el: Element | null = t; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const ox = getComputedStyle(el).overflowX;
    if (ox === "auto" || ox === "scroll") return true;
  }
  return false;
}

/**
 * Ascolta i tocchi sul documento finché `attivo`; `vai` riceve la
 * direzione. Gli ascoltatori sono passivi: lo scroll della pagina non
 * aspetta mai questo codice.
 */
export function useScorrimentoSezioni(attivo: boolean, vai: (d: Direzione) => void) {
  const vaiRef = useRef(vai);
  vaiRef.current = vai;
  useEffect(() => {
    if (!attivo) return;
    let inizio: { x: number; y: number; t: number } | null = null;
    const onStart = (e: TouchEvent) => {
      inizio = null;
      if (e.touches.length !== 1 || occupato(e.target)) return;
      if (document.querySelector('dialog:modal, [aria-modal="true"]')) return;
      const p = e.touches[0];
      inizio = { x: p.clientX, y: p.clientY, t: e.timeStamp };
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length > 1) inizio = null;
    };
    const onEnd = (e: TouchEvent) => {
      const i = inizio;
      inizio = null;
      const p = e.changedTouches[0];
      if (!i || !p || e.touches.length > 0) return;
      if (window.getSelection()?.toString()) return;
      const d = direzioneScorrimento({ x0: i.x, dx: p.clientX - i.x, dy: p.clientY - i.y, ms: e.timeStamp - i.t, larghezza: window.innerWidth });
      if (d) vaiRef.current(d);
    };
    const onCancel = () => {
      inizio = null;
    };
    const opts = { passive: true } as const;
    document.addEventListener("touchstart", onStart, opts);
    document.addEventListener("touchmove", onMove, opts);
    document.addEventListener("touchend", onEnd, opts);
    document.addEventListener("touchcancel", onCancel, opts);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, [attivo]);
}
