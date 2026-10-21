/* ──────────────────────────────────────────────────────────────
   Login negli e2e (contratto di ondata, CONTRATTI-ONDATA.md). Lo
   implementa la corsia 3 con l'OTP di sviluppo (devOtp:latest sul Convex
   del worktree). Fino al suo merge ogni funzione lancia un errore: le
   spec che le usano portano il tag @sessione.
   ────────────────────────────────────────────────────────────── */

import type { Page } from "@playwright/test";

export type FormaE2E = "f" | "m" | "n";

export interface Proprietario {
  email: string;
  handle: string;
}

const manca = (): never => {
  throw new Error("e2e/helpers/auth.ts: arriva col traguardo 3");
};

/** Entra con l'OTP di sviluppo; crea l'utente se manca. Alla fine la pagina è ricaricata con la sessione. */
export async function accediConOtp(_page: Page, _email: string): Promise<void> {
  manca();
}

/** Nuovo utente con email unica e passo 1 dell'onboarding fatto (profilo active, nessun dato). */
export async function nuovoProprietario(_page: Page, _opts?: { handle?: string; forma?: FormaE2E; nome?: string }): Promise<Proprietario> {
  return manca();
}

/** Entra come proprietario di gabrifila (utente di test + admin:claimProfile sul deployment locale). Solo in locale. */
export async function accediComeGabrifila(_page: Page): Promise<Proprietario> {
  return manca();
}

/** Esce come col bottone "Esci". */
export async function esci(_page: Page): Promise<void> {
  manca();
}
