/* ──────────────────────────────────────────────────────────────
   Slot del root: la pagina d'errore (PIANO §3, §7.0).
   Proprietario: traguardo 8, che aggiunge Sentry.captureException in un
   effetto (gli errori di render dell'SSR non passano dal middleware).

   Nel traguardo 2: solo il messaggio in italiano, senza dettagli tecnici
   (un errore Convex non deve mai finire a schermo con i suoi valori).
   ────────────────────────────────────────────────────────────── */

import type { ErrorComponentProps } from "@tanstack/react-router";

export function RootError(_props: ErrorComponentProps) {
  return (
    <main className="notfound">
      <h1 className="notfound-h">Qualcosa è andato storto</h1>
      <p className="desc">La pagina non si è caricata. Riprova tra poco.</p>
      <a className="notfound-link" href="/gabrifila">Vai ai concerti di Gabri</a>
    </main>
  );
}
