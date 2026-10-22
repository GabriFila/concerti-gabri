/* ──────────────────────────────────────────────────────────────
   Entry del client di Start: quella predefinita (@tanstack/react-start,
   plugin/default-entry/client.tsx) con l'osservabilità caricata per prima
   (traguardo 8), così Sentry vede anche gli errori dell'idratazione.
   ────────────────────────────────────────────────────────────── */

import "./instrument.client.ts";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
