/* ──────────────────────────────────────────────────────────────
   La tastiera del telefono e le finestre fisse.

   Su iPhone (e su Chrome Android, di default) la tastiera non
   ridimensiona la pagina: copre il fondo dello schermo e restringe solo
   il visual viewport. Un foglio ancorato in basso (`bottom:0`, `100dvh`:
   dvh segue le barre del browser, non la tastiera) finisce sotto la
   tastiera, con il campo che si sta scrivendo.

   `osservaTastiera()` (montato una volta in __root) misura la parte
   coperta e, solo mentre la tastiera è aperta su un campo, mette su
   <html> `data-tastiera` e tre variabili, in px del layout viewport:
     --tastiera  quanto copre dal fondo (per `bottom`)
     --vv-alto   da dove parte la parte visibile (per `top`)
     --vv-h      quanto è alta
   Il CSS delle finestre (modifica.css, styles.css, accesso.css) le usa
   solo sotto `html[data-tastiera]`: a tastiera chiusa non cambia nulla.
   ────────────────────────────────────────────────────────────── */

/** Sotto questa soglia non è una tastiera (barre del browser che entrano ed escono). */
export const SOGLIA_TASTIERA = 120;

const NON_TESTO = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

/** Un campo che apre la tastiera. */
export function apreTastiera(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement) return !NON_TESTO.has(el.type) && !el.readOnly;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  return el.isContentEditable;
}

export interface Misura {
  /** Il layout viewport (window.innerHeight). */
  altezza: number;
  /** Il visual viewport. */
  vvAltezza: number;
  vvAlto: number;
  scala: number;
  /** Un campo che apre la tastiera ha il focus. */
  campo: boolean;
}

/** La parte visibile quando la tastiera copre il fondo; null quando non c'è tastiera (o c'è lo zoom). */
export function misuraTastiera(m: Misura): { tastiera: number; alto: number; h: number } | null {
  if (!m.campo || Math.abs(m.scala - 1) > 0.01) return null;
  const tastiera = Math.round(m.altezza - m.vvAltezza - m.vvAlto);
  if (tastiera < SOGLIA_TASTIERA) return null;
  return { tastiera, alto: Math.round(m.vvAlto), h: Math.round(m.vvAltezza) };
}

/** Comincia a seguire la tastiera; restituisce la funzione che smette. */
export function osservaTastiera(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const html = document.documentElement;
  let raf = 0;
  let prima: string | null = null;

  const applica = () => {
    raf = 0;
    const attivo = document.activeElement;
    const m = misuraTastiera({
      altezza: window.innerHeight,
      vvAltezza: vv.height,
      vvAlto: vv.offsetTop,
      scala: vv.scale,
      campo: apreTastiera(attivo),
    });
    const ora = m ? `${m.tastiera}/${m.alto}/${m.h}` : null;
    if (ora === prima) return;
    const apertura = prima === null;
    prima = ora;
    if (!m) {
      html.removeAttribute("data-tastiera");
      for (const v of ["--tastiera", "--vv-alto", "--vv-h"]) html.style.removeProperty(v);
      return;
    }
    html.style.setProperty("--tastiera", `${m.tastiera}px`);
    html.style.setProperty("--vv-alto", `${m.alto}px`);
    html.style.setProperty("--vv-h", `${m.h}px`);
    html.setAttribute("data-tastiera", "");
    // la finestra si è accorciata: il campo può essere finito sotto il suo bordo
    if (apertura && apreTastiera(attivo)) requestAnimationFrame(() => attivo.scrollIntoView({ block: "nearest" }));
  };
  const pianifica = () => {
    if (!raf) raf = requestAnimationFrame(applica);
  };

  vv.addEventListener("resize", pianifica);
  vv.addEventListener("scroll", pianifica);
  // il focus che passa da un campo a un pulsante (o via) chiude la tastiera prima del resize
  document.addEventListener("focusin", pianifica);
  document.addEventListener("focusout", pianifica);
  pianifica();
  return () => {
    vv.removeEventListener("resize", pianifica);
    vv.removeEventListener("scroll", pianifica);
    document.removeEventListener("focusin", pianifica);
    document.removeEventListener("focusout", pianifica);
    if (raf) cancelAnimationFrame(raf);
    html.removeAttribute("data-tastiera");
    for (const v of ["--tastiera", "--vv-alto", "--vv-h"]) html.style.removeProperty(v);
  };
}
