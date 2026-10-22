/* ──────────────────────────────────────────────────────────────
   Opzioni di Sentry comuni a client e server (PIANO §1.12, traguardo 8).

   Sentry v11 non ha più `sendDefaultPii`: i default di `dataCollection`
   raccolgono IP, cookie, header, tutti i corpi HTTP, query string, input e
   output di @google/genai e variabili dei frame. Qui si spegne tutto, in
   modo esplicito; lo scrubbing di shared/scrub.ts è la seconda cintura.
   Solo errori: niente replay, feedback, tracing né sessioni.
   ────────────────────────────────────────────────────────────── */

import type { BrowserOptions } from "@sentry/tanstackstart-react";

export const DATA_COLLECTION: NonNullable<BrowserOptions["dataCollection"]> = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  stackFrameVariables: false,
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
};

/** Il nome dell'ambiente: "e2e" nei test locali, altrimenti VERCEL_ENV (al build) o "development". */
export function ambiente(e2e: boolean): string {
  if (e2e) return "e2e";
  const env = typeof __VERCEL_ENV__ === "string" ? __VERCEL_ENV__ : "";
  return env || "development";
}

/** Il DSN da usare, o undefined (Sentry spento). Nei test e2e vale solo un sink locale: mai il Sentry vero. */
export function dsnSentry(dsn: string | undefined, e2e: boolean): string | undefined {
  if (!dsn) return undefined;
  if (!e2e) return dsn;
  try {
    const host = new URL(dsn).hostname;
    return host === "127.0.0.1" || host === "localhost" ? dsn : undefined;
  } catch {
    return undefined;
  }
}
