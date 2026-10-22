/* ──────────────────────────────────────────────────────────────
   Slot del root: la pagina d'errore (PIANO §3, §7.0).
   Proprietario: traguardo 8.

   Solo il messaggio in italiano, senza dettagli tecnici (un errore Convex
   non deve mai finire a schermo con i suoi valori). L'errore va a Sentry da
   un effetto, quindi dal browser: gli errori di render e dei loader
   dell'SSR non passano dal middleware di Sentry (src/start.ts), e arrivano
   qui anche dopo l'idratazione. L'evento passa dallo scrubbing di
   instrument.client.ts come ogni altro.
   ────────────────────────────────────────────────────────────── */

import { useEffect } from "react";
import * as Sentry from "@sentry/tanstackstart-react";
import type { ErrorComponentProps } from "@tanstack/react-router";

export function RootError({ error }: ErrorComponentProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <main className="notfound">
      <h1 className="notfound-h">Qualcosa è andato storto</h1>
      <p className="desc">La pagina non si è caricata. Riprova tra poco.</p>
      <a className="notfound-link" href="/gabrifila">Vai ai concerti di Gabri</a>
    </main>
  );
}
