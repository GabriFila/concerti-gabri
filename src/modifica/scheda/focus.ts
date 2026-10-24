/* ──────────────────────────────────────────────────────────────
   Il focus dentro la scheda dell'Oracolo dopo un'azione che toglie il
   pulsante premuto: un problema sistemato («Usa «Marco R.»», «È una
   persona nuova», «Aggiorna quello», «Tienilo»…), «Aggiungi e usa» quando
   la venue arriva, «Cambia idea», «Scarta» che chiude la scheda,
   «Annulla» sulla conferma. Il pulsante sparisce col suo <li>, il focus
   cadrebbe sul <body> e il Tab successivo ripartirebbe dall'inizio della
   pagina (l'Oracolo agganciato non è modale).

   `recuperaFocus(id, …selettori)` si ricorda dove andare; appena il focus
   risulta perso (subito, o quando la scheda cambia forma: le schede
   chiamano `riprovaFocus()` dopo ogni disegno), lo mette sul primo
   selettore che c'è nella scheda e non è spento, poi sul titolo, poi
   sulla scheda stessa (tabIndex -1). Se il focus non è perso (il pulsante
   c'è ancora, o il proprietario è andato altrove) non tocca niente; la
   richiesta scade dopo qualche secondo.
   ────────────────────────────────────────────────────────────── */

/** Quanto aspetta una richiesta (la venue aggiunta arriva con la sottoscrizione). */
const DURATA_MS = 10_000;

let attesa: { id: string; dove: readonly string[]; fino: number } | null = null;

/** Il focus è perso: sul <body>, o su un elemento non più nella pagina. */
const perso = () => {
  const a = document.activeElement;
  return !a || a === document.body || !a.isConnected;
};

/** Prova a rimettere il focus nella scheda richiesta (se è perso). */
export function riprovaFocus() {
  if (!attesa || typeof document === "undefined") return;
  if (Date.now() > attesa.fino) {
    attesa = null;
    return;
  }
  if (!perso()) return;
  const scheda = document.querySelector<HTMLElement>(`[data-scheda="${CSS.escape(attesa.id)}"]`);
  if (!scheda) return;
  for (const s of [...attesa.dove, ".scheda-titolo"]) {
    const el = [...scheda.querySelectorAll<HTMLElement>(s)].find(x => !(x as HTMLButtonElement).disabled && x.getClientRects().length > 0);
    if (el) {
      el.focus({ preventScroll: true });
      attesa = null;
      return;
    }
  }
  if (scheda.hasAttribute("tabindex")) {
    scheda.focus({ preventScroll: true });
    attesa = null;
  }
}

/**
 * Dopo un'azione che può togliere il pulsante col focus: dove andare, in
 * ordine (selettori dentro la scheda `id`); poi il titolo e la scheda.
 */
export function recuperaFocus(id: string, ...dove: string[]) {
  attesa = { id, dove, fino: Date.now() + DURATA_MS };
  requestAnimationFrame(riprovaFocus);
}

/** Il primo pulsante del prossimo problema da sistemare, poi la riga di quel campo. */
export const dopoProblema = (campo?: string) => [".scheda-problemi button", ...(campo ? [`[data-riga="${campo}"]`] : [])];
